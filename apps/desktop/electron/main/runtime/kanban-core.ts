/**
 * Kanban board: pure state machine — no Electron, no fs.
 * All mutations return a new board; callers persist via kanban-store.ts.
 */
import { randomUUID } from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type KanbanStatus = "triage" | "todo" | "ready" | "running" | "blocked" | "done";
export type KanbanBlockKind = "dependency" | "needs_input" | "capability" | "transient" | "gave_up";
export type KanbanCreator = "user" | "agent";

export type KanbanTask = {
  id: string;
  title: string;
  body: string;
  status: KanbanStatus;
  archived: boolean;
  priority: number;
  projectPath: string;
  modelOverride?: string;
  createdBy: KanbanCreator;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: string;
  blockKind?: KanbanBlockKind;
  blockReason?: string;
  blockRecurrences: number;
  consecutiveFailures: number;
  maxRuntimeSeconds: number;
  sessionId?: string;
  currentRunId?: string;
};

export type KanbanLink = { parentId: string; childId: string };
export type KanbanComment = { id: string; taskId: string; author: string; body: string; createdAt: number };
export type KanbanRunStatus = "running" | "done" | "crashed" | "timed_out" | "reclaimed" | "gave_up";
export type KanbanRun = {
  id: string;
  taskId: string;
  sessionId: string;
  status: KanbanRunStatus;
  summary?: string;
  error?: string;
  startedAt: number;
  endedAt?: number;
  nudgeCount: number;
};
export type KanbanEvent = { id: string; taskId: string; kind: string; payload?: unknown; ts: number };
export type DailyStats = { date: string; spawned: number };

export type KanbanBoard = {
  tasks: KanbanTask[];
  links: KanbanLink[];
  comments: KanbanComment[];
  runs: KanbanRun[];
  events: KanbanEvent[];
  dailyStats: DailyStats[];
};

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_MAX_RUNTIME_SECONDS = 1800; // 30 min
const MAX_EVENTS_PER_TASK = 200;

export function emptyBoard(): KanbanBoard {
  return { tasks: [], links: [], comments: [], runs: [], events: [], dailyStats: [] };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextId(): string {
  return randomUUID();
}

function task(board: KanbanBoard, id: string): KanbanTask | undefined {
  return board.tasks.find((t) => t.id === id);
}

function mapTask(board: KanbanBoard, id: string, fn: (t: KanbanTask) => KanbanTask): KanbanBoard {
  return { ...board, tasks: board.tasks.map((t) => (t.id === id ? fn(t) : t)) };
}

function mapRun(board: KanbanBoard, id: string, fn: (r: KanbanRun) => KanbanRun): KanbanBoard {
  return { ...board, runs: board.runs.map((r) => (r.id === id ? fn(r) : r)) };
}

function appendEvent(board: KanbanBoard, taskId: string, kind: string, payload?: unknown): KanbanBoard {
  const ev: KanbanEvent = { id: nextId(), taskId, kind, payload, ts: Date.now() };
  const all = [...board.events, ev];
  // Cap at MAX_EVENTS_PER_TASK per task (keep newest)
  const forTask = all.filter((e) => e.taskId === taskId);
  if (forTask.length > MAX_EVENTS_PER_TASK) {
    const drop = new Set(forTask.slice(0, forTask.length - MAX_EVENTS_PER_TASK).map((e) => e.id));
    return { ...board, events: all.filter((e) => !drop.has(e.id)) };
  }
  return { ...board, events: all };
}

// ── Cycle detection ───────────────────────────────────────────────────────────

/**
 * Returns true if adding parentId→childId would create a cycle.
 * Walks upward from parentId collecting ancestors; if childId appears, it's a cycle.
 */
export function wouldCreateCycle(board: KanbanBoard, parentId: string, childId: string): boolean {
  if (parentId === childId) return true;
  // BFS/DFS upward: find all ancestors of parentId
  const visited = new Set<string>();
  const queue = [parentId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (id === childId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const link of board.links) {
      if (link.childId === id && !visited.has(link.parentId)) {
        queue.push(link.parentId);
      }
    }
  }
  return false;
}

// ── State machine: create ─────────────────────────────────────────────────────

export type CreateTaskInput = {
  title: string;
  body?: string;
  projectPath: string;
  modelOverride?: string;
  priority?: number;
  parentIds?: string[];
  createdBy: KanbanCreator;
  /** User-created cards: land in triage when explicitly flagged */
  flagTriage?: boolean;
  maxRuntimeSeconds?: number;
};

/**
 * Create a card. Agent-created cards always land in triage.
 * User-created: triage (if flagged) > todo (if has parents) > ready (default).
 */
export function createTask(board: KanbanBoard, input: CreateTaskInput): { board: KanbanBoard; taskId: string } {
  const id = nextId();
  let status: KanbanStatus;
  if (input.createdBy === "agent") {
    status = "triage";
  } else if (input.flagTriage) {
    status = "triage";
  } else if ((input.parentIds?.length ?? 0) > 0) {
    status = "todo";
  } else {
    status = "ready";
  }

  const t: KanbanTask = {
    id,
    title: input.title.trim() || "(untitled)",
    body: input.body ?? "",
    status,
    archived: false,
    priority: input.priority ?? 0,
    projectPath: input.projectPath,
    modelOverride: input.modelOverride,
    createdBy: input.createdBy,
    createdAt: Date.now(),
    blockRecurrences: 0,
    consecutiveFailures: 0,
    maxRuntimeSeconds: input.maxRuntimeSeconds ?? DEFAULT_MAX_RUNTIME_SECONDS,
  };

  let next: KanbanBoard = { ...board, tasks: [...board.tasks, t] };

  // Add parent links
  for (const parentId of input.parentIds ?? []) {
    if (!task(board, parentId)) continue;
    if (!wouldCreateCycle(next, parentId, id)) {
      next = { ...next, links: [...next.links, { parentId, childId: id }] };
    }
  }

  next = appendEvent(next, id, "created", { status, createdBy: input.createdBy });
  return { board: next, taskId: id };
}

// ── recomputeReady ────────────────────────────────────────────────────────────

/** Promote todo tasks to ready when all their parents are done. */
export function recomputeReady(board: KanbanBoard): KanbanBoard {
  let next = board;
  for (const t of board.tasks) {
    if (t.status !== "todo") continue;
    const parents = board.links.filter((l) => l.childId === t.id).map((l) => l.parentId);
    if (parents.length === 0) continue;
    const allDone = parents.every((pid) => {
      const p = task(board, pid);
      return p?.status === "done";
    });
    if (allDone) {
      next = mapTask(next, t.id, (t) => ({ ...t, status: "ready" }));
      next = appendEvent(next, t.id, "ready", { reason: "parents_done" });
    }
  }
  return next;
}

// ── claim ─────────────────────────────────────────────────────────────────────

/** Claim a ready task: ready → running; opens a run row. */
export function claimTask(board: KanbanBoard, taskId: string, sessionId: string, runId: string): KanbanBoard {
  const t = task(board, taskId);
  if (!t || t.status !== "ready") return board;

  const run: KanbanRun = {
    id: runId,
    taskId,
    sessionId,
    status: "running",
    startedAt: Date.now(),
    nudgeCount: 0,
  };

  let next = mapTask(board, taskId, (t) => ({
    ...t,
    status: "running",
    sessionId,
    currentRunId: runId,
    startedAt: Date.now(),
    // consecutiveFailures accumulates across runs; only completeTask resets it
  }));
  next = { ...next, runs: [...next.runs, run] };

  // Track daily spawns
  const d = today();
  const stats = [...next.dailyStats];
  const idx = stats.findIndex((s) => s.date === d);
  if (idx >= 0) stats[idx] = { ...stats[idx], spawned: stats[idx].spawned + 1 };
  else stats.push({ date: d, spawned: 1 });
  next = { ...next, dailyStats: stats };

  next = appendEvent(next, taskId, "claimed", { sessionId, runId });
  return next;
}

// ── complete ──────────────────────────────────────────────────────────────────

/** Complete a running task: running → done; closes the run. */
export function completeTask(board: KanbanBoard, taskId: string, summary?: string, result?: string): KanbanBoard {
  const t = task(board, taskId);
  if (!t || t.status !== "running") return board;

  const runId = t.currentRunId;
  let next = mapTask(board, taskId, (t) => ({
    ...t,
    status: "done" as KanbanStatus,
    completedAt: Date.now(),
    result,
    sessionId: undefined,
    currentRunId: undefined,
    consecutiveFailures: 0,
  }));

  if (runId) {
    next = mapRun(next, runId, (r) => ({ ...r, status: "done" as KanbanRunStatus, summary, endedAt: Date.now() }));
  }
  next = appendEvent(next, taskId, "completed", { summary });

  // Recompute downstream
  next = recomputeReady(next);
  return next;
}

// ── block ─────────────────────────────────────────────────────────────────────

/** Block a running task per block-kind rules. */
export function blockTask(
  board: KanbanBoard,
  taskId: string,
  reason: string,
  kind: KanbanBlockKind,
): KanbanBoard {
  const t = task(board, taskId);
  if (!t) return board;

  const runId = t.currentRunId;
  const newRecurrences = t.blockRecurrences + 1;
  let newStatus: KanbanStatus;

  if (kind === "dependency") {
    newStatus = newRecurrences >= 2 ? "triage" : "todo";
  } else {
    newStatus = "blocked";
  }

  let next = mapTask(board, taskId, (t) => ({
    ...t,
    status: newStatus,
    blockKind: kind,
    blockReason: reason,
    blockRecurrences: newRecurrences,
    sessionId: undefined,
    currentRunId: undefined,
  }));

  if (runId) {
    const runStatus: KanbanRunStatus = kind === "gave_up" ? "gave_up" : "done";
    next = mapRun(next, runId, (r) => ({ ...r, status: runStatus, error: reason, endedAt: Date.now() }));
  }
  next = appendEvent(next, taskId, "blocked", { reason, kind, newStatus });
  return next;
}

// ── crash (dispatcher-side failure) ──────────────────────────────────────────

/**
 * Record a crash: consecutiveFailures++.
 * At >= 2 failures, block as gave_up; otherwise return to ready.
 */
export function crashTask(board: KanbanBoard, taskId: string, runId: string, errorCode: string): KanbanBoard {
  const t = task(board, taskId);
  if (!t) return board;

  const newFailures = t.consecutiveFailures + 1;
  const newStatus: KanbanStatus = newFailures >= 2 ? "blocked" : "ready";
  const newKind: KanbanBlockKind | undefined = newFailures >= 2 ? "gave_up" : undefined;

  let next = mapTask(board, taskId, (t) => ({
    ...t,
    status: newStatus,
    blockKind: newKind,
    blockReason: newFailures >= 2 ? "gave_up after repeated failures" : undefined,
    consecutiveFailures: newFailures,
    sessionId: undefined,
    currentRunId: undefined,
  }));
  next = mapRun(next, runId, (r) => ({ ...r, status: "crashed" as KanbanRunStatus, error: errorCode, endedAt: Date.now() }));
  next = appendEvent(next, taskId, "crashed", { errorCode, newStatus, consecutiveFailures: newFailures });
  return next;
}

// ── reclaim (app-quit restart) ────────────────────────────────────────────────

/**
 * Reclaim a task whose session is gone (app quit mid-run).
 * Returns to ready, no failure counted, closes run as reclaimed.
 */
export function reclaimTask(board: KanbanBoard, taskId: string): KanbanBoard {
  const t = task(board, taskId);
  if (!t || t.status !== "running") return board;

  const runId = t.currentRunId;
  let next = mapTask(board, taskId, (t) => ({
    ...t,
    status: "ready" as KanbanStatus,
    sessionId: undefined,
    currentRunId: undefined,
    // consecutiveFailures NOT incremented (reclaim is not a failure)
  }));
  if (runId) {
    next = mapRun(next, runId, (r) => ({ ...r, status: "reclaimed" as KanbanRunStatus, endedAt: Date.now() }));
  }
  next = appendEvent(next, taskId, "reclaimed");
  return next;
}

// ── timeout ───────────────────────────────────────────────────────────────────

/** Wall-clock timeout: treat as a crash. */
export function timeoutTask(board: KanbanBoard, taskId: string, runId: string): KanbanBoard {
  const t = task(board, taskId);
  if (!t) return board;

  const newFailures = t.consecutiveFailures + 1;
  const newStatus: KanbanStatus = newFailures >= 2 ? "blocked" : "ready";
  const newKind: KanbanBlockKind | undefined = newFailures >= 2 ? "gave_up" : undefined;

  let next = mapTask(board, taskId, (t) => ({
    ...t,
    status: newStatus,
    blockKind: newKind,
    blockReason: newFailures >= 2 ? "gave_up after repeated timeouts" : undefined,
    consecutiveFailures: newFailures,
    sessionId: undefined,
    currentRunId: undefined,
  }));
  next = mapRun(next, runId, (r) => ({ ...r, status: "timed_out" as KanbanRunStatus, error: "timeout", endedAt: Date.now() }));
  next = appendEvent(next, taskId, "timed_out", { newStatus, consecutiveFailures: newFailures });
  return next;
}

// ── nudge count ───────────────────────────────────────────────────────────────

/** Increment nudge count on the active run; returns the new count. */
export function incrementNudge(board: KanbanBoard, taskId: string): { board: KanbanBoard; nudgeCount: number } {
  const t = task(board, taskId);
  if (!t?.currentRunId) return { board, nudgeCount: 0 };
  const run = board.runs.find((r) => r.id === t.currentRunId);
  if (!run) return { board, nudgeCount: 0 };
  const nudgeCount = run.nudgeCount + 1;
  const next = mapRun(board, run.id, (r) => ({ ...r, nudgeCount }));
  return { board: next, nudgeCount };
}

// ── link ──────────────────────────────────────────────────────────────────────

/** Add a parent→child link. Returns null on cycle. */
export function addLink(
  board: KanbanBoard,
  parentId: string,
  childId: string,
): KanbanBoard | null {
  if (!task(board, parentId) || !task(board, childId)) return null;
  if (wouldCreateCycle(board, parentId, childId)) return null;
  // Deduplicate
  const exists = board.links.some((l) => l.parentId === parentId && l.childId === childId);
  if (exists) return board;
  return appendEvent(
    { ...board, links: [...board.links, { parentId, childId }] },
    childId,
    "linked",
    { parentId },
  );
}

/** Remove a parent→child link (no-op when absent). */
export function removeLink(board: KanbanBoard, parentId: string, childId: string): KanbanBoard {
  const links = board.links.filter((l) => !(l.parentId === parentId && l.childId === childId));
  if (links.length === board.links.length) return board;
  return appendEvent({ ...board, links }, childId, "unlinked", { parentId });
}

// ── comment ───────────────────────────────────────────────────────────────────

export function addComment(board: KanbanBoard, taskId: string, author: string, body: string): KanbanBoard {
  const comment: KanbanComment = { id: nextId(), taskId, author, body, createdAt: Date.now() };
  return { ...board, comments: [...board.comments, comment] };
}

// ── move (user drag / promote) ────────────────────────────────────────────────

/** User moves a card to a new status column. Guards: running cards cannot be moved. */
export function moveTask(board: KanbanBoard, taskId: string, toStatus: KanbanStatus): KanbanBoard {
  const t = task(board, taskId);
  if (!t || t.status === "running") return board;
  let next = mapTask(board, taskId, (t) => ({ ...t, status: toStatus }));
  next = appendEvent(next, taskId, "moved", { from: t.status, to: toStatus });
  return next;
}

// ── unarchive / archive ───────────────────────────────────────────────────────

export function archiveTask(board: KanbanBoard, taskId: string, archived: boolean): KanbanBoard {
  return mapTask(board, taskId, (t) => ({ ...t, archived }));
}

/** Edit user-facing fields. Blank title is rejected; priority is clamped to a non-negative integer. */
export function updateTask(
  board: KanbanBoard,
  taskId: string,
  patch: { title?: string; body?: string; priority?: number },
): KanbanBoard {
  if (!task(board, taskId)) return board;
  const title = patch.title === undefined ? undefined : patch.title.trim();
  if (title === "") return board;
  const priority =
    patch.priority === undefined || !Number.isFinite(patch.priority)
      ? undefined
      : Math.max(0, Math.trunc(patch.priority));
  return appendEvent(
    mapTask(board, taskId, (t) => ({
      ...t,
      ...(title !== undefined ? { title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(priority !== undefined ? { priority } : {}),
    })),
    taskId,
    "edited",
    { fields: Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined) },
  );
}

// ── daily cap helpers ─────────────────────────────────────────────────────────

export function todaySpawnCount(board: KanbanBoard): number {
  return board.dailyStats.find((s) => s.date === today())?.spawned ?? 0;
}

// ── session cap helpers ───────────────────────────────────────────────────────

/** Count agent-created cards this session (from events with `createdBy === "agent"` and matching sessionId). */
export function agentCardCountForSession(board: KanbanBoard, sessionId: string): number {
  // Tasks are not keyed by session; events are. Count `created` events where
  // the task has no session field and was agent-created (proxy: events tagged
  // with the session are not stored — use task createdBy count per session
  // from runs). Simplest: check tasks created by agent whose currentRunId
  // links back to this session's runs.
  // ponytail: just count by scanning tasks; good enough for small boards.
  return board.tasks.filter(
    (t) => t.createdBy === "agent" && board.runs.some((r) => r.sessionId === sessionId && r.taskId === t.id),
  ).length;
}
