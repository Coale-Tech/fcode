/** Fan-out run types: start N parallel agent sessions on isolated git worktrees. */

export type FanoutVariant = {
  /** Override for the auto-generated branch name (`fanout/<runId>-<n>`). */
  branch?: string;
  agentId?: string;
  modelId?: string;
  providerId?: string;
};

export type FanoutVariantStatus = "pending" | "running" | "done" | "failed";

export type FanoutVariantRun = {
  /** 1-based variant index. */
  n: number;
  branch: string;
  /** null when worktree creation failed. */
  worktreePath: string | null;
  /** null when session creation failed. */
  sessionId: string | null;
  status: FanoutVariantStatus;
  error?: string;
};

export type FanoutRun = {
  id: string;
  repoPath: string;
  prompt: string;
  variants: FanoutVariantRun[];
  startedAt: number;
};

export type FanoutAdoptResult = {
  merged: boolean;
  /** Reason for failure; absent on success. */
  reason?: string;
};
