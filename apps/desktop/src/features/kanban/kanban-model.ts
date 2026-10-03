/** Pure board helpers for the Kanban page and drawer (no React, no IPC). */
import type { KanbanBoard, KanbanRun, KanbanStatus, KanbanTask } from "@pi-desktop/shared";

export const KANBAN_COLUMNS: KanbanStatus[] = ["triage", "todo", "ready", "running", "blocked", "done"];

/** Columns a user can move a card into. `running` is dispatcher-owned. */
export const USER_STATUSES: KanbanStatus[] = ["triage", "todo", "ready", "blocked", "done"];

/** Short display id, e.g. `T_9F2A` (first four hex digits of the uuid). */
export function shortId(id: string): string {
  return `T_${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

export function projectName(projectPath: string): string {
  const parts = projectPath.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? projectPath;
}

/** Running cards are owned by the dispatcher (core.moveTask ignores them). */
export function canMoveTo(task: Pick<KanbanTask, "status">, target: KanbanStatus): boolean {
  return task.status !== "running" && task.status !== target && USER_STATUSES.includes(target);
}

/** `done/total` over the card's children, or null for a leaf card. */
export function childProgress(board: KanbanBoard, taskId: string): { done: number; total: number } | null {
  const childIds = board.links.filter((l) => l.parentId === taskId).map((l) => l.childId);
  if (childIds.length === 0) return null;
  const byId = new Map(board.tasks.map((t) => [t.id, t]));
  const done = childIds.filter((id) => byId.get(id)?.status === "done").length;
  return { done, total: childIds.length };
}

export function linkCounts(board: KanbanBoard, taskId: string): { parents: number; children: number } {
  return {
    parents: board.links.filter((l) => l.childId === taskId).length,
    children: board.links.filter((l) => l.parentId === taskId).length,
  };
}

export function commentCount(board: KanbanBoard, taskId: string): number {
  return board.comments.filter((c) => c.taskId === taskId).length;
}

export type KanbanFilters = { search: string; project: string; showArchived: boolean };

export const NO_FILTERS: KanbanFilters = { search: "", project: "", showArchived: false };

export function filtersActive(f: KanbanFilters): boolean {
  return f.search.trim() !== "" || f.project !== "" || f.showArchived;
}

/** Search matches id, title, body, result and project path, case-insensitively. */
export function filterTasks(tasks: KanbanTask[], f: KanbanFilters): KanbanTask[] {
  const q = f.search.trim().toLowerCase();
  return tasks.filter((t) => {
    if (t.archived && !f.showArchived) return false;
    if (f.project && t.projectPath !== f.project) return false;
    if (!q) return true;
    return [t.id, shortId(t.id), t.title, t.body, t.result ?? "", t.projectPath].some((s) =>
      s.toLowerCase().includes(q),
    );
  });
}

/** Distinct project paths on the board, for the project filter. */
export function boardProjects(tasks: KanbanTask[]): string[] {
  return [...new Set(tasks.map((t) => t.projectPath))].sort();
}

/** Session to open for a card: the live one, else the most recent run's. */
export function workerSessionId(task: KanbanTask, runs: KanbanRun[]): string | undefined {
  if (task.sessionId) return task.sessionId;
  return [...runs].sort((a, b) => b.startedAt - a.startedAt)[0]?.sessionId;
}

/** Shift-click range over the visible card order (inclusive), whichever way it runs. */
export function rangeBetween(order: string[], a: string, b: string): string[] {
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i < 0 || j < 0) return [b];
  return order.slice(Math.min(i, j), Math.max(i, j) + 1);
}

/** "12m" / "1h 4m" / "38s" for a run duration. */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
