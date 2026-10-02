/**
 * Kanban IPC — all channels are local (no remote session id, confirmed by K0 spike).
 * Remote routing check: sessionIdForCall returns null for these args → ROUTE_LOCAL.
 */
import { IPC } from "@pi-desktop/shared";
import type { IpcRegistrar } from "./types";
import type { KanbanBoard } from "../runtime/kanban-core";
import {
  createTask,
  moveTask,
  addLink,
  addComment,
  archiveTask,
  recomputeReady,
} from "../runtime/kanban-core";
import type { KanbanRunner } from "../runtime/kanban-runner";
import type { KanbanSettings } from "../runtime/kanban-settings";
import { validateKanbanSettings } from "../runtime/kanban-settings";

export type KanbanIpcDependencies = {
  registrar: IpcRegistrar;
  getBoard: () => KanbanBoard;
  saveBoard: (board: KanbanBoard) => void;
  getSettings: () => KanbanSettings;
  saveSettings: (settings: KanbanSettings) => void;
  runner: KanbanRunner;
  sendChanged: () => void;
};

export function registerKanbanIpc({
  registrar,
  getBoard,
  saveBoard,
  getSettings,
  saveSettings,
  runner,
  sendChanged,
}: KanbanIpcDependencies): void {
  const { handle } = registrar;

  const mutate = (fn: (board: KanbanBoard) => KanbanBoard) => {
    const next = fn(getBoard());
    saveBoard(next);
    sendChanged();
    return next;
  };

  handle(IPC.invoke.kanbanList, async () => {
    const board = getBoard();
    return {
      tasks: board.tasks,
      links: board.links,
      comments: board.comments,
      runs: board.runs,
      paused: runner.isPaused(),
    };
  });

  handle(IPC.invoke.kanbanCreate, async (input: {
    title?: string;
    body?: string;
    projectPath?: string;
    modelOverride?: string;
    parentIds?: string[];
    flagTriage?: boolean;
  } = {}) => {
    const projectPath = String(input.projectPath ?? "").trim();
    if (!projectPath) throw new Error("projectPath required");
    const title = String(input.title ?? "").trim();
    if (!title) throw new Error("title required");
    const board = getBoard();
    const { board: next, taskId } = createTask(board, {
      title,
      body: input.body ?? "",
      projectPath,
      modelOverride: input.modelOverride,
      parentIds: input.parentIds ?? [],
      createdBy: "user",
      flagTriage: input.flagTriage,
    });
    saveBoard(next);
    sendChanged();
    // Kick dispatcher if a ready card was just created
    void runner.tick().catch(() => undefined);
    return { taskId };
  });

  handle(IPC.invoke.kanbanMove, async (input: { taskId?: string; status?: string } = {}) => {
    const taskId = String(input.taskId ?? "").trim();
    const status = String(input.status ?? "").trim() as Parameters<typeof moveTask>[2];
    if (!taskId || !status) throw new Error("taskId and status required");
    const next = mutate((board) => moveTask(board, taskId, status));
    void runner.tick().catch(() => undefined);
    return { task: next.tasks.find((t) => t.id === taskId) ?? null };
  });

  handle(IPC.invoke.kanbanLink, async (input: { parentId?: string; childId?: string } = {}) => {
    const parentId = String(input.parentId ?? "").trim();
    const childId = String(input.childId ?? "").trim();
    if (!parentId || !childId) throw new Error("parentId and childId required");
    const board = getBoard();
    const next = addLink(board, parentId, childId);
    if (!next) throw Object.assign(new Error("cycle detected or invalid task"), { errorCode: "KANBAN_CYCLE" });
    const b2 = recomputeReady(next);
    saveBoard(b2);
    sendChanged();
    return { ok: true };
  });

  handle(IPC.invoke.kanbanComment, async (input: { taskId?: string; body?: string; author?: string } = {}) => {
    const taskId = String(input.taskId ?? "").trim();
    const body = String(input.body ?? "").trim();
    const author = String(input.author ?? "user").trim();
    if (!taskId || !body) throw new Error("taskId and body required");
    mutate((board) => addComment(board, taskId, author, body));
    return { ok: true };
  });

  handle(IPC.invoke.kanbanArchive, async (input: { taskId?: string; archived?: boolean } = {}) => {
    const taskId = String(input.taskId ?? "").trim();
    if (!taskId) throw new Error("taskId required");
    const archived = input.archived !== false; // default true
    mutate((board) => archiveTask(board, taskId, archived));
    return { ok: true };
  });

  handle(IPC.invoke.kanbanListRuns, async (taskId: string) => {
    const board = getBoard();
    return { runs: board.runs.filter((r) => r.taskId === taskId) };
  });

  handle(IPC.invoke.kanbanSettingsGet, async () => getSettings());

  handle(IPC.invoke.kanbanSettingsSet, async (input: unknown) => {
    const settings = validateKanbanSettings(input);
    saveSettings(settings);
    return settings;
  });

  handle(IPC.invoke.kanbanSetPaused, async (paused: boolean) => {
    runner.pause(typeof paused === "boolean" ? paused : false);
    return { paused: runner.isPaused() };
  });

  handle(IPC.invoke.kanbanNudge, async () => {
    void runner.tick().catch(() => undefined);
    return { ok: true };
  });
}
