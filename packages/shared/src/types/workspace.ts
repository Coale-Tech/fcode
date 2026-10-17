import type { ProjectMemory } from "./filesystem.js";

/** Shared public types grouped by the owning application domain. */
export type AppNotificationKind = "task.completed" | "task.failed";

export type AppNotification = {
  id: string;
  kind: AppNotificationKind;
  sessionId: string;
  sessionTitle: string;
  turnId: string;
  errorCode?: string;
  /** Optional rich body text for the notification row (capture-rig can supply it). */
  body?: string;
  createdAt: string;
  readAt?: string | null;
};

export type NotificationListResult = {
  notifications: AppNotification[];
  unreadCount: number;
};

export type ProjectWorkspace = {
  path: string;
  name: string;
  /** Best-effort git branch from .git/HEAD when available. */
  branch?: string;
};

export type ProjectRecord = {
  id: number;
  path: string;
  name: string;
  pinned: boolean;
  createdAt: number;
  lastOpenedAt: number;
};

export type ProjectGroupRoot = {
  path: string;
  name: string;
  position: number;
};

export type ProjectGroupRecord = {
  id: string;
  name: string;
  primaryPath: string;
  roots: ProjectGroupRoot[];
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  lastOpenedAt: number;
  /** True for a compatibility projection of an old single-folder project. */
  legacy?: boolean;
  /** Previously removed roots remain suppressed from legacy projections. */
  detachedPaths?: string[];
};

export type ProjectGroupContext = {
  groupId: string;
  roots: ProjectGroupRoot[];
  instructions: string;
  memory: ProjectMemory;
};

export type PullRequestCheck = {
  name: string;
  state: "success" | "failure" | "pending" | "skipped";
  durationSeconds?: number;
  /** Optional short detail text shown after the check name (e.g. "142 passed"). */
  details?: string;
};

export type PullRequestSummary = {
  number: number;
  title: string;
  /** Optional short display name for compact panel headers; falls back to title. */
  shortTitle?: string;
  url: string;
  author?: string;
  headRefName?: string;
  baseRefName?: string;
  /** ISO timestamp of last update. */
  updatedAt?: string;
  /** ISO timestamp when the PR was originally opened (distinct from updatedAt). */
  openedAt?: string;
  isDraft?: boolean;
  /** PR body / description text */
  body?: string;
  /** Number of changed files */
  changedFiles?: number;
  /** Lines added */
  additions?: number;
  /** Lines deleted */
  deletions?: number;
  /** CI check runs */
  checks?: PullRequestCheck[];
};

/**
 * `authKind` for a provider row whose credential is a vendor-account OAuth
 * login rather than a pasted API key. Shared so main, the sidecar runtime and
 * the renderer all branch on the same spelling.
 */
