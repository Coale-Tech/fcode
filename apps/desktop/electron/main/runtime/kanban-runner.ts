/**
 * Kanban dispatcher — ticks every 15 s and on every board change.
 * Injected deps: createSession, prompt, notifyDailyCap, sendChanged, getSettings, getBoard, saveBoard.
 * No Electron direct imports; all side effects come through the injected deps.
 */
import { randomUUID } from "node:crypto";
import type { KanbanBoard, KanbanTask } from "./kanban-core";
import {
  claimTask,
  crashTask,
  reclaimTask,
  timeoutTask,
  blockTask,
  recomputeReady,
  completeTask,
  incrementNudge,
} from "./kanban-core";
import type { KanbanSettings } from "./kanban-settings";

export type KanbanRunnerDeps = {
  getSettings: () => KanbanSettings;
  getBoard: () => KanbanBoard;
  saveBoard: (board: KanbanBoard) => void;
  /** Start a new session; returns its id. */
  createSession: (input: { title: string; projectPath: string }) => Promise<string>;
  /** Deliver a prompt to a session. */
  prompt: (sessionId: string, content: string) => Promise<unknown>;
  /** Notify renderer that daily spawn cap has been hit. */
  notifyDailyCap: (maxSpawns: number) => void;
  /** Emit a kanbanChanged event to the renderer. */
  sendChanged: () => void;
  /** Report internal errors. */
  report: (error: unknown) => void;
  /** Called after every board mutation; diff prev vs next for notifications. */
  onBoardMutation?: (prev: KanbanBoard, next: KanbanBoard) => void;
};

/** Nudge prompt sent to a worker that ended without kanban_complete/kanban_block. */
const NUDGE_PROMPT =
  "Your kanban task is still open. Please call `kanban_complete` with a summary " +
  "of what you did, or `kanban_block` if you are stuck. If you are truly done, " +
  "call `kanban_complete` now.";

export type KanbanRunner = {
  /** Called by the event-persistence tap when a session ends. */
  onTurnEnd: (sessionId: string) => void;
  /** Called on startup to reclaim cards whose sessions are gone. */
  reclaimZombies: (liveSessions: Set<string>) => void;
  /** Manually trigger a dispatcher tick. */
  tick: () => Promise<void>;
  start: () => void;
  stop: () => void;
  pause: (paused: boolean) => void;
  isPaused: () => boolean;
  /** Map of sessionId → taskId for running workers. */
  sessionToCard: () => ReadonlyMap<string, string>;
};

export function createKanbanRunner(deps: KanbanRunnerDeps): KanbanRunner {
  const { getSettings, getBoard, saveBoard, createSession, prompt, notifyDailyCap, sendChanged, report } = deps;

  // sessionId → taskId
  const sessionToCardId = new Map<string, string>();
  // taskId → startedAt (wall clock for timeout enforcement)
  const runStartedAt = new Map<string, number>();

  let paused = false;
  let polling = false;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  // ── per-day spawn cap notification (fire once per cap hit) ──────────────────
  let dailyCapNotified = false;

  const updateBoard = (next: KanbanBoard) => {
    const prev = getBoard();
    saveBoard(next);
    sendChanged();
    deps.onBoardMutation?.(prev, next);
  };

  // ── Timeout enforcement ───────────────────────────────────────────────────

  const enforceTimeouts = () => {
    let board = getBoard();
    const now = Date.now();
    for (const [sessionId, taskId] of sessionToCardId) {
      const t = board.tasks.find((t) => t.id === taskId);
      if (!t || t.status !== "running") continue;
      const started = runStartedAt.get(taskId) ?? t.startedAt ?? now;
      const elapsed = (now - started) / 1000;
      if (elapsed > t.maxRuntimeSeconds) {
        const run = board.runs.find((r) => r.id === t.currentRunId);
        if (run) {
          board = timeoutTask(board, taskId, run.id);
          sessionToCardId.delete(sessionId);
          runStartedAt.delete(taskId);
        }
      }
    }
    return board;
  };

  // ── Reclaim zombies (sessions gone without closing their card) ────────────

  const reclaimZombies = (liveSessions: Set<string>) => {
    let board = getBoard();
    let changed = false;
    for (const t of board.tasks.filter((t) => t.status === "running")) {
      if (t.sessionId && !liveSessions.has(t.sessionId)) {
        board = reclaimTask(board, t.id);
        if (t.sessionId) sessionToCardId.delete(t.sessionId);
        runStartedAt.delete(t.id);
        changed = true;
      }
    }
    if (changed) updateBoard(board);
  };

  // ── Main tick ─────────────────────────────────────────────────────────────

  const tick = async () => {
    if (polling || stopped) return;
    const settings = getSettings();
    if (!settings.enabled || paused) return;

    polling = true;
    try {
      let board = enforceTimeouts();
      board = recomputeReady(board);

      // Count running workers per projectPath (dir-mode: one per dir)
      const runningByPath = new Map<string, number>();
      for (const [, taskId] of sessionToCardId) {
        const t = board.tasks.find((t) => t.id === taskId);
        if (t) runningByPath.set(t.projectPath, (runningByPath.get(t.projectPath) ?? 0) + 1);
      }

      const inProgress = sessionToCardId.size;
      if (inProgress >= settings.maxInProgress) {
        updateBoard(board);
        return;
      }

      // Check daily cap
      const d = new Date().toISOString().slice(0, 10);
      const todaySpawned = board.dailyStats.find((s) => s.date === d)?.spawned ?? 0;
      if (todaySpawned >= settings.maxDailySpawns) {
        if (!dailyCapNotified) {
          dailyCapNotified = true;
          notifyDailyCap(settings.maxDailySpawns);
        }
        updateBoard(board);
        return;
      }

      // Claim ready tasks (priority DESC, createdAt ASC)
      const ready = board.tasks
        .filter((t) => t.status === "ready" && !t.archived)
        .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

      for (const t of ready) {
        if (sessionToCardId.size >= settings.maxInProgress) break;
        // HD1: one worker per dir
        if ((runningByPath.get(t.projectPath) ?? 0) >= 1) continue;
        // Re-check daily cap after each claim (board was updated by claimTask)
        const todaySpawnedNow = board.dailyStats.find((s) => s.date === d)?.spawned ?? 0;
        if (todaySpawnedNow >= settings.maxDailySpawns) {
          if (!dailyCapNotified) { dailyCapNotified = true; notifyDailyCap(settings.maxDailySpawns); }
          break;
        }

        const runId = randomUUID();
        const sessionTitle = `[kanban] ${t.title}`;
        let sessionId: string;
        try {
          sessionId = await createSession({ title: sessionTitle, projectPath: t.projectPath });
        } catch (err) {
          report(err);
          continue;
        }

        board = claimTask(board, t.id, sessionId, runId);
        sessionToCardId.set(sessionId, t.id);
        runStartedAt.set(t.id, Date.now());
        runningByPath.set(t.projectPath, (runningByPath.get(t.projectPath) ?? 0) + 1);

        // Reset daily cap notification when a new day starts
        dailyCapNotified = false;

        // Build worker prompt from card
        const workerPrompt = buildWorkerPrompt(t, board);
        try {
          await prompt(sessionId, workerPrompt);
        } catch (err) {
          report(err);
          // session created but prompt failed — crash immediately
          const run = board.runs.find((r) => r.id === runId);
          if (run) board = crashTask(board, t.id, runId, "PROMPT_FAILED");
          sessionToCardId.delete(sessionId);
          runStartedAt.delete(t.id);
        }
      }

      updateBoard(board);
    } catch (err) {
      report(err);
    } finally {
      polling = false;
    }
  };

  // ── Turn-end tap ─────────────────────────────────────────────────────────

  const onTurnEnd = (sessionId: string) => {
    const taskId = sessionToCardId.get(sessionId);
    if (!taskId) return;

    let board = getBoard();
    const t = board.tasks.find((t) => t.id === taskId);
    if (!t || t.status !== "running") return;

    // If still running after turn end → nudge
    const { board: next, nudgeCount } = incrementNudge(board, taskId);
    board = next;

    if (nudgeCount > 2) {
      // Block as gave_up
      board = blockTask(board, taskId, "gave_up after 2 nudges", "gave_up");
      sessionToCardId.delete(sessionId);
      runStartedAt.delete(taskId);
      updateBoard(board);
      return;
    }

    updateBoard(board);

    // Re-prompt with nudge (async, fire-and-forget)
    void prompt(sessionId, NUDGE_PROMPT).catch(report);
  };

  return {
    onTurnEnd,
    reclaimZombies,
    tick,
    start() {
      if (timer || stopped) return;
      timer = setInterval(() => void tick(), 15_000);
      if (timer.unref) timer.unref();
      void tick();
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = undefined;
    },
    pause(p: boolean) {
      paused = p;
      if (!p) void tick();
    },
    isPaused() { return paused; },
    sessionToCard() { return sessionToCardId; },
  };
}

// ── Worker prompt builder ─────────────────────────────────────────────────────

function buildWorkerPrompt(task: KanbanTask, board: KanbanBoard): string {
  const parents = board.links
    .filter((l) => l.childId === task.id)
    .map((l) => board.tasks.find((t) => t.id === l.parentId))
    .filter((t) => t != null);

  const parentContext = parents.length > 0
    ? "\n\n**Parent task results:**\n" +
      parents.map((p) => `- ${p!.title}: ${p!.result ?? "(no result)"}`).join("\n")
    : "";

  return (
    `# Kanban task: ${task.title}\n\n` +
    `${task.body ?? ""}${parentContext}\n\n` +
    `**Working directory:** ${task.projectPath}\n\n` +
    "When done, call `kanban_complete` with a brief summary. " +
    "If blocked, call `kanban_block` with reason and kind. " +
    "Do not end your turn without calling one of these tools."
  );
}
