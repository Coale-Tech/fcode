/** Shared types for the Kanban board (protocol between main and renderer). */

export type KanbanStatus =
  | "triage"
  | "todo"
  | "ready"
  | "running"
  | "blocked"
  | "done";

export type KanbanBlockKind =
  | "dependency"
  | "needs_input"
  | "capability"
  | "transient"
  | "gave_up";

export type KanbanCreator = "user" | "agent";

export type KanbanTask = {
  id: string;
  title: string;
  body: string;
  status: KanbanStatus;
  priority: number;
  createdBy: KanbanCreator;
  projectPath: string;
  sessionId?: string;
  blockKind?: KanbanBlockKind;
  archived: boolean;
  consecutiveFailures: number;
  createdAt: number;
  updatedAt: number;
};

export type KanbanLink = { parentId: string; childId: string };

export type KanbanComment = {
  id: string;
  taskId: string;
  author: string;
  body: string;
  createdAt: number;
};

export type KanbanRunStatus =
  | "running"
  | "done"
  | "crashed"
  | "timed_out"
  | "reclaimed"
  | "gave_up";

export type KanbanRun = {
  id: string;
  taskId: string;
  sessionId: string;
  status: KanbanRunStatus;
  startedAt: number;
  endedAt?: number;
  nudgeCount: number;
};

export type KanbanBoard = {
  tasks: KanbanTask[];
  links: KanbanLink[];
  comments: KanbanComment[];
  runs: KanbanRun[];
  dailyStats: { date: string; spawned: number }[];
};

export type KanbanSettings = {
  enabled: boolean;
  maxInProgress: number;
  maxRuntimeSeconds: number;
  maxAgentCardsPerSession: number;
  maxDailySpawns: number;
};
