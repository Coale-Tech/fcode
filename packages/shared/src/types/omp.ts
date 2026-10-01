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

/** Launcher available for a managed local Hindsight server. */
export type HindsightLocalLauncher = "binary" | "uvx" | "docker";

/** Live state of the managed local Hindsight server supervisor. */
export interface HindsightLocalState {
  /** Launchers found on PATH; empty when nothing is installed. */
  launchers: HindsightLocalLauncher[];
  state: "stopped" | "starting" | "running" | "failed" | "unavailable";
  /** Port the server is (or will be) listening on. */
  port?: number;
  /** Human-readable reason for `failed` or `unavailable`. */
  message?: string;
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
  /** Reflect/recall mission text written to the bank via PUT on save. */
  hindsightBankMission?: string;
  /** Retain mission text written to the bank via PUT on save. */
  hindsightRetainMission?: string;
  /** When true, the local Hindsight supervisor starts automatically with the agent. */
  hindsightLocal?: boolean;
}
export interface MemoryConfigView extends MemoryConfig {
  hasToken: boolean;
}

/** Result of `hindsightSetBankMission`. */
export interface HindsightSetBankMissionResult {
  ok: boolean;
}

/** A mental-model page returned by the Hindsight API. */
export interface HindsightMentalModelSummary {
  id: string;
  name: string;
  content?: string;
  tags?: string[];
  updatedAt?: string;
}

/** Result of `hindsightListMentalModels`. */
export interface HindsightListMentalModelsResult {
  models: HindsightMentalModelSummary[];
}

/** Result of `hindsightRefreshMentalModel`. */
export interface HindsightRefreshMentalModelResult {
  operationId?: string;
}

/** Result of `benchBootstrapMemory`. */
export interface BenchBootstrapResult {
  ok: boolean;
  benchPath: string;
  sites: string[];
  apps: string[];
  /** Set for the hindsight backend; absent for mnemopi/off. */
  retained?: boolean;
  message?: string;
}
/**
 * Payload emitted by the omp bridge for setStatus / setWidget / setTitle /
 * set_editor_text extension_ui_request methods (sidecar.ext_ui notification).
 */
export type SidecarExtUiEvent =
  | { kind: "status"; sessionId: string; key: string; text: string | undefined }
  | { kind: "widget"; sessionId: string; key: string; lines: string[] | undefined }
  | { kind: "title"; sessionId: string; title: string }
  | { kind: "editor_text"; sessionId: string; text: string };
/** omp tool approval mode. Controls which tool tiers are auto-approved. */
export type ToolApprovalMode = "always-ask" | "write" | "yolo";

/** A live subagent known to the omp session (mirrors RpcSubagentSnapshot). */
export interface OmpSubagentSnapshot {
  id: string;
  index: number;
  agent: string;
  status: "running" | "completed" | "failed" | "aborted" | "timed_out" | "stopped" | "denied";
  task?: string;
  description?: string;
  lastUpdate: number;
}

/** Result of `omp.subagents.list`. */
export interface OmpSubagentListResult {
  subagents: OmpSubagentSnapshot[];
}

/** Result of `omp.subagents.messages`. */
export interface OmpSubagentMessagesResult {
  /** Raw AgentMessage array from omp. */
  messages: unknown[];
}

/**
 * User-controlled omp settings persisted in `omp-settings.json` and injected
 * into the overlay on sidecar restart. Only the configured subset is written;
 * absent keys keep omp's own defaults.
 */
export interface OmpSettingsValues {
  // Task / isolation
  "task.isolation.enabled"?: boolean;
  "isolation.backend"?: "auto" | "apfs" | "btrfs" | "zfs" | "reflink" | "overlayfs" | "projfs" | "block-clone" | "rcopy";
  "worktree.clone"?: boolean;
  "task.maxConcurrency"?: number;
  "task.maxRecursionDepth"?: number;
  "task.agentModelOverrides"?: Record<string, string>;
  // Eval / Python
  "eval.py"?: boolean;
  "eval.js"?: boolean;
  "eval.tools.enabled"?: boolean;
  "python.kernelMode"?: "session" | "per-call";
  "python.interpreter"?: string;
  // Browser
  "browser.enabled"?: boolean;
  "browser.cdpUrl"?: string;
  "browser.relay"?: boolean;
  "browser.relayUrl"?: string;
  "browser.headless"?: boolean;
  // Collab
  "collab.relayUrl"?: string;
  "collab.webUrl"?: string;
  "collab.displayName"?: string;
  "collab.autoStart"?: "off" | "view" | "control";
  // LSP (omp/packages/coding-agent/src/lsp/settings.ts)
  "lsp.enabled"?: boolean;
  "lsp.formatOnWrite"?: boolean;
  "lsp.diagnosticsOnWrite"?: boolean;
  "lsp.diagnosticsOnEdit"?: boolean;
  // IDA Pro (omp/packages/coding-agent/src/ida/settings.ts)
  "ida.enabled"?: boolean;
  "ida.python"?: string;
  "ida.installDir"?: string;
  // MCP (omp/packages/coding-agent/src/mcp/settings.ts)
  "mcp.enableProjectConfig"?: boolean;
  "mcp.renderMarkdownResults"?: boolean;
  "mcp.notifications"?: boolean;
  // Skills & Commands (omp/packages/coding-agent/src/extensibility/settings.ts)
  "skills.enabled"?: boolean;
  "skills.registryUrl"?: string;
  "skills.customDirectories"?: string[];
  "commands.enableClaudeUser"?: boolean;
  "commands.enableClaudeProject"?: boolean;
  // Hindsight behavioral (omp/packages/coding-agent/src/hindsight/settings.ts)
  "hindsight.autoRecall"?: boolean;
  "hindsight.autoRetain"?: boolean;
  "hindsight.retainMode"?: "full-session" | "last-turn";
  "hindsight.mentalModelsEnabled"?: boolean;
  "hindsight.mentalModelAutoSeed"?: boolean;
}

// ─── Session-data additions (feat/session-data) ──────────────────────────────

/** A todo item in an omp phase list. */
export interface OmpTodoItem {
  id?: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "abandoned" | "blocked";
  blocker?: string;
}

/** A named phase containing todo items. */
export interface OmpTodoPhase {
  id?: string;
  name: string;
  tasks: OmpTodoItem[];
}

/** Result of `omp.session.exportHtml`. */
export interface OmpSessionExportHtmlResult {
  path: string;
}

/** Result of `omp.session.lastAssistantText`. */
export interface OmpSessionLastAssistantTextResult {
  text: string | null;
}

/** Result of `omp.session.handoff`. */
export interface OmpSessionHandoffResult {
  savedPath?: string;
}

/** Result of `omp.session.setTodos`. */
export interface OmpSessionSetTodosResult {
  phases: OmpTodoPhase[];
}

/** A minimal session entry for the tree view (id/parentId/type/timestamp). */
export interface OmpSessionEntry {
  id: string;
  parentId: string | null;
  type: string;
  timestamp?: string | number;
  label?: string;
  /** For message entries, the role of the message. */
  role?: string;
}

/** A node in the session tree (recursive). */
export interface OmpSessionTreeNode {
  entry: OmpSessionEntry;
  children: OmpSessionTreeNode[];
  label?: string;
}

/** Result of `omp.session.entries`. */
export interface OmpSessionEntriesResult {
  entries: OmpSessionEntry[];
  leafId: string | null;
}

/** Result of `omp.session.tree`. */
export interface OmpSessionTreeResult {
  tree: OmpSessionTreeNode[];
  leafId: string | null;
}

/** Result of `omp.session.switch`. */
export interface OmpSessionSwitchResult {
  cancelled: boolean;
}

/** A message summary for a branch entry, returned by `get_branch_messages`. */
export interface OmpBranchMessage {
  entryId: string;
  text: string;
}

/** Result of `omp.session.branchMessages`. */
export interface OmpSessionBranchMessagesResult {
  messages: OmpBranchMessage[];
}
/** Result of `omp.share` — snapshot URL from the `/share` slash command. */
export interface OmpShareResult {
  /** Extracted share URL, or null when omp returned no URL. */
  url: string | null;
  /** Raw text output from the `/share` command (for display). */
  text: string | null;
}
