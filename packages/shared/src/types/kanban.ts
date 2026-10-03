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
  modelOverride?: string;
  blockKind?: KanbanBlockKind;
  blockReason?: string;
  result?: string;
  archived: boolean;
  consecutiveFailures: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
};

export type KanbanEvent = { id: string; taskId: string; kind: string; payload?: unknown; ts: number };

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
  summary?: string;
  error?: string;
  startedAt: number;
  endedAt?: number;
  nudgeCount: number;
};

export type KanbanBoard = {
  tasks: KanbanTask[];
  links: KanbanLink[];
  comments: KanbanComment[];
  runs: KanbanRun[];
  events: KanbanEvent[];
  dailyStats: { date: string; spawned: number }[];
};

export type KanbanSettings = {
  enabled: boolean;
  maxInProgress: number;
  maxRuntimeSeconds: number;
  maxAgentCardsPerSession: number;
  maxDailySpawns: number;
};
