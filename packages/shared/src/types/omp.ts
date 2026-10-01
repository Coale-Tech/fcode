/**
 * Shared result types for the ten omp sidecar methods exposed over IPC (DX14 / plan §9).
 *
 * Shapes match the `data` field of the corresponding omp RPC responses
 * (`rpc-types.ts` in oh-my-pi) as forwarded by the bridge's ompCallAndForward.
 */

/** A model available in the current omp session. */
export interface OmpModel {
  /** Provider-scoped model identifier (e.g. "claude-sonnet-4-5"). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Owning provider record. */
  provider: { id: string; name: string; [key: string]: unknown };
  /** Additional metadata from the model catalog. */
  [key: string]: unknown;
}

/** Result of `omp.models.list`. */
export interface OmpModelsListResult {
  models: OmpModel[];
}

/** Result of `omp.models.set`. Matches the `Model` shape from omp. */
export type OmpModelsSetResult = OmpModel;

/** Thinking-level token as used by omp. */
export type OmpThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/** Result of `omp.thinking.levels`. */
export interface OmpThinkingLevelsResult {
  levels: OmpThinkingLevel[];
}

/** A slash command exposed by omp. */
export interface OmpSlashCommand {
  name: string;
  aliases?: string[];
  description?: string;
  input?: { hint?: string };
  subcommands?: Array<{ name: string; description?: string; usage?: string }>;
  source: string;
}

/** Result of `omp.commands.list`. */
export interface OmpCommandsListResult {
  commands: OmpSlashCommand[];
}

/** Snapshot of the current omp session state (subset of RpcSessionState). */
export interface OmpStateResult {
  model?: OmpModel;
  thinkingLevel?: OmpThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  sessionId: string;
  sessionName?: string;
  messageCount: number;
  autoCompactionEnabled?: boolean;
  contextUsage?: { tokensUsed?: number; tokensAvailable?: number; tokensTotal?: number; [key: string]: unknown };
  [key: string]: unknown;
}

/** A login provider reported by omp. */
export interface OmpLoginProvider {
  id: string;
  name: string;
  available: boolean;
  authenticated: boolean;
}

/** Result of `omp.login.providers`. */
export interface OmpLoginProvidersResult {
  providers: OmpLoginProvider[];
}

/** Result of `omp.login.start`. */
export interface OmpLoginStartResult {
  providerId: string;
}

/** Result of `omp.session.branch`. */
export interface OmpSessionBranchResult {
  text: string;
  cancelled: boolean;
}

/** Result of `omp.memory.status` (omp `get_memory_status`). */
export interface OmpMemoryStatusResult {
  backend: "mnemopi" | "hindsight" | "local" | "off";
  active: boolean;
  writable: boolean;
  searchable: boolean;
  scope?: string;
  retainBank?: string;
  workingCount?: number;
  episodicCount?: number;
  tripleCount?: number;
  message?: string;
  error?: string;
  latencyMs: number;
}

/** Result of `omp.session.stats` (omp `get_session_stats`). */
export interface OmpSessionStatsResult {
  userMessages: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  /** Session cost in USD. Zero for local/uncounted models. */
  cost: number;
}

/** Fcode-owned memory backend selection. The Hindsight token is write-only. */
export interface MemoryConfig {
  backend: "mnemopi" | "hindsight" | "off";
  hindsightUrl?: string;
  hindsightBank?: string;
}
export interface MemoryConfigView extends MemoryConfig {
  hasToken: boolean;
}
