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
  /** "user" | "project" | "native"; mirrors omp's SlashCommand.level. */
  level?: "user" | "project" | "native";
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
  /** When present: whether fast-mode is currently active for this session. */
  fastModeEnabled?: boolean;
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
  backend: "mnemopi" | "hindsight" | "local" | "sharpshooter" | "off";
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

/** Result of `omp.memory.budget` (omp `get_memory_budget`). */
export interface OmpMemoryBudgetResult {
  /** Chars of memory instructions injected at the last session-start prompt build. */
  usedChars: number;
  /** Cap in chars; 0 = unlimited. Mirrors `memory.injectMaxChars` setting. */
  capChars: number;
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
  backend: "mnemopi" | "hindsight" | "sharpshooter" | "local" | "off";
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
 * One omp setting as declared by omp's registry (`config/all-settings.ts`),
 * emitted into `omp-settings-manifest.json` at build time. The advanced
 * settings page renders from these descriptors; nothing is hand-listed.
 */
export interface OmpSettingDescriptor {
  /** Dotted id, e.g. "retry.maxRetries". */
  id: string;
  type: "boolean" | "string" | "number" | "enum" | "array" | "record";
  default?: unknown;
  /** enum */
  values?: readonly string[];
  /** number */
  min?: number;
  max?: number;
  tab: string;
  group: string;
  label: string;
  description?: string;
  secret?: boolean;
  options?: readonly { value: string; label: string }[];
}

/** Dotted omp setting id → value, for settings without a curated key in {@link OmpSettingsValues}. */
export type OmpAdvancedSettings = Record<string, unknown>;

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
  // Bash: Fcode-owned; emits omp `bash.patterns` allow-rules for read-only commands.
  "bash.autoApproveReadOnly"?: boolean;
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
  // Queue modes (session interaction behaviour; omp/packages/coding-agent/src/modes/settings.ts)
  "steeringMode"?: "all" | "one-at-a-time";
  "followUpMode"?: "all" | "one-at-a-time";
  "interruptMode"?: "immediate" | "wait";
  "loop.mode"?: "prompt" | "compact" | "reset";
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
  "skills.enableClaudeUser"?: boolean;
  /** Fcode defaults to "compact" (pinned/used skills keep full text, others one short line). */
  "skills.listMode"?: "full" | "compact";
  "skills.customDirectories"?: string[];
  "commands.enableClaudeUser"?: boolean;
  "commands.enableClaudeProject"?: boolean;
  // Extensions (omp/packages/coding-agent/src/extensibility/settings.ts)
  "extensions"?: string[];
  "disabledExtensions"?: string[];
  // Hindsight behavioral (omp/packages/coding-agent/src/hindsight/settings.ts)
  "hindsight.autoRecall"?: boolean;
  "hindsight.autoRetain"?: boolean;
  "hindsight.retainMode"?: "full-session" | "last-turn";
  "hindsight.mentalModelsEnabled"?: boolean;
  "hindsight.mentalModelAutoSeed"?: boolean;
  // Memory cross-backend (omp/packages/coding-agent/src/memory-backend/settings.ts)
  "memory.injectMaxChars"?: number;
  /** Char budget for each frozen memory file (USER.md / .omp/MEMORY.md). 0 = disabled. Fcode default: 2000. */
  "memory.frozen.maxChars"?: number;
  // Mnemopi advanced (omp/packages/coding-agent/src/mnemopi/settings.ts)
  // mnemopi.llmMode is forced to "session" by the bridge overlay; excluded.
  // mnemopi.embeddingApiKey and mnemopi.llmApiKey are credentials; use secret store; excluded.
  "mnemopi.scoping"?: "global" | "per-project" | "per-project-tagged";
  "mnemopi.dbPath"?: string;
  "mnemopi.bank"?: string;
  "mnemopi.embeddingVariant"?: "en" | "multilingual";
  "mnemopi.autoRecall"?: boolean;
  "mnemopi.autoRetain"?: boolean;
  "mnemopi.polyphonicRecall"?: boolean;
  "mnemopi.enhancedRecall"?: boolean;
  "mnemopi.proactiveLinking"?: boolean;
  "mnemopi.noEmbeddings"?: boolean;
  "mnemopi.embeddingModel"?: string;
  "mnemopi.embeddingApiUrl"?: string;
  "mnemopi.llmBaseUrl"?: string;
  "mnemopi.llmModel"?: string;
  "mnemopi.retainEveryNTurns"?: number;
  "mnemopi.recallLimit"?: number;
  "mnemopi.recallContextTurns"?: number;
  "mnemopi.recallMaxQueryChars"?: number;
  "mnemopi.injectionTokenLimit"?: number;
  "mnemopi.debug"?: boolean;
  // Hindsight advanced — remaining keys not in MemoryTab or omp-settings-sections
  // hindsight.apiUrl/bankId/apiToken managed by MemoryTab; hindsight.bankMission/retainMission also MemoryTab.
  // hindsight.retainContext is purely internal ("omp" constant); excluded.
  // hindsight.recallTypes (array of strings) is complex; excluded for now.
  "hindsight.scoping"?: "global" | "per-project" | "per-project-tagged";
  "hindsight.bankIdPrefix"?: string;
  "hindsight.retainEveryNTurns"?: number;
  "hindsight.retainOverlapTurns"?: number;
  "hindsight.recallBudget"?: "low" | "mid" | "high";
  "hindsight.recallMaxTokens"?: number;
  "hindsight.recallContextTurns"?: number;
  "hindsight.recallMaxQueryChars"?: number;
  "hindsight.debug"?: boolean;
  "hindsight.requestTimeoutMs"?: number;
  "hindsight.reflectTimeoutMs"?: number;
  "hindsight.recallTimeoutMs"?: number;
  "hindsight.retainTimeoutMs"?: number;
  "hindsight.mentalModelMaxRenderChars"?: number;
  // Sharpshooter (omp/packages/coding-agent/src/sharpshooter/settings.ts)
  "sharpshooter.model"?: string;
  "sharpshooter.intervalMinutes"?: number;
  "sharpshooter.injectionTokenLimit"?: number;
  // Local memory pipeline (omp/packages/coding-agent/src/memories/settings.ts)
  // memories.enabled is legacy/hidden; excluded. Stage1/phase2 lease/retry/heartbeat are pipeline internals; excluded.
  "memories.maxRolloutsPerStartup"?: number;
  "memories.maxRolloutAgeDays"?: number;
  "memories.minRolloutIdleHours"?: number;
  "memories.summaryInjectionTokenLimit"?: number;
  // Appearance — HTML export themes (omp/packages/coding-agent/src/modes/settings.ts)
  "theme.dark"?: string;
  "theme.light"?: string;
  // Skill curator (Fcode-owned; controls the background skill archive pass in the bridge)
  "skills.curator.enabled"?: boolean;
  "skills.curator.staleDays"?: number;
  "skills.curator.archiveDays"?: number;
  // Skill review (Fcode-owned; background LLM pass to save lessons as skills)
  "skills.review.enabled"?: boolean;
  "skills.review.intervalTurns"?: number;
  "skills.review.model"?: string;
  "skills.review.maxInputTokens"?: number;
  /** When true (default), validated skills are staged as proposals awaiting approval. */
  "skills.review.requireApproval"?: boolean;
  // Opt-in tools (omp/packages/coding-agent/src/tools/settings.ts; default: false)
  "astGrep.enabled"?: boolean;
  "checkpoint.enabled"?: boolean;
  "github.enabled"?: boolean;
  "security.enabled"?: boolean;
  // Auto-Learn (omp/packages/coding-agent/src/autolearn/settings.ts)
  "autolearn.enabled"?: boolean;
  /** Generic settings from the omp manifest; a curated key above always wins over the same id here. */
  advanced?: OmpAdvancedSettings;
}

/**
 * Runtime set of every dotted key that Fcode handles explicitly in
 * {@link OmpSettingsValues} (excluding `advanced`).
 *
 * The advanced settings page uses this to hide descriptors that are already
 * covered by a curated section, keeping a single source of truth.
 *
 * The `satisfies` check below ensures this stays complete: TypeScript fails
 * if a key is added to `OmpSettingsValues` without also adding it here.
 */
/** @internal completeness-check; satisfies errors if OmpSettingsValues gains a key not listed here. */
const _curatedCheck = {
  "task.isolation.enabled": true,
  "isolation.backend": true,
  "worktree.clone": true,
  "task.maxConcurrency": true,
  "task.maxRecursionDepth": true,
  "task.agentModelOverrides": true,
  "eval.py": true,
  "eval.js": true,
  "eval.tools.enabled": true,
  "python.kernelMode": true,
  "python.interpreter": true,
  "bash.autoApproveReadOnly": true,
  "browser.enabled": true,
  "browser.cdpUrl": true,
  "browser.relay": true,
  "browser.relayUrl": true,
  "browser.headless": true,
  "collab.relayUrl": true,
  "collab.webUrl": true,
  "collab.displayName": true,
  "collab.autoStart": true,
  "steeringMode": true,
  "followUpMode": true,
  "interruptMode": true,
  "loop.mode": true,
  "lsp.enabled": true,
  "lsp.formatOnWrite": true,
  "lsp.diagnosticsOnWrite": true,
  "lsp.diagnosticsOnEdit": true,
  "ida.enabled": true,
  "ida.python": true,
  "ida.installDir": true,
  "mcp.enableProjectConfig": true,
  "mcp.renderMarkdownResults": true,
  "mcp.notifications": true,
  "skills.enabled": true,
  "skills.registryUrl": true,
  "skills.enableClaudeUser": true,
  "skills.listMode": true,
  "skills.customDirectories": true,
  "commands.enableClaudeUser": true,
  "commands.enableClaudeProject": true,
  "extensions": true,
  "disabledExtensions": true,
  "hindsight.autoRecall": true,
  "hindsight.autoRetain": true,
  "hindsight.retainMode": true,
  "hindsight.mentalModelsEnabled": true,
  "hindsight.mentalModelAutoSeed": true,
  "memory.injectMaxChars": true,
  "memory.frozen.maxChars": true,
  "mnemopi.scoping": true,
  "mnemopi.dbPath": true,
  "mnemopi.bank": true,
  "mnemopi.embeddingVariant": true,
  "mnemopi.autoRecall": true,
  "mnemopi.autoRetain": true,
  "mnemopi.polyphonicRecall": true,
  "mnemopi.enhancedRecall": true,
  "mnemopi.proactiveLinking": true,
  "mnemopi.noEmbeddings": true,
  "mnemopi.embeddingModel": true,
  "mnemopi.embeddingApiUrl": true,
  "mnemopi.llmBaseUrl": true,
  "mnemopi.llmModel": true,
  "mnemopi.retainEveryNTurns": true,
  "mnemopi.recallLimit": true,
  "mnemopi.recallContextTurns": true,
  "mnemopi.recallMaxQueryChars": true,
  "mnemopi.injectionTokenLimit": true,
  "mnemopi.debug": true,
  "hindsight.scoping": true,
  "hindsight.bankIdPrefix": true,
  "hindsight.retainEveryNTurns": true,
  "hindsight.retainOverlapTurns": true,
  "hindsight.recallBudget": true,
  "hindsight.recallMaxTokens": true,
  "hindsight.recallContextTurns": true,
  "hindsight.recallMaxQueryChars": true,
  "hindsight.debug": true,
  "hindsight.requestTimeoutMs": true,
  "hindsight.reflectTimeoutMs": true,
  "hindsight.recallTimeoutMs": true,
  "hindsight.retainTimeoutMs": true,
  "hindsight.mentalModelMaxRenderChars": true,
  "sharpshooter.model": true,
  "sharpshooter.intervalMinutes": true,
  "sharpshooter.injectionTokenLimit": true,
  "memories.maxRolloutsPerStartup": true,
  "memories.maxRolloutAgeDays": true,
  "memories.minRolloutIdleHours": true,
  "memories.summaryInjectionTokenLimit": true,
  "theme.dark": true,
  "theme.light": true,
  "skills.curator.enabled": true,
  "skills.curator.staleDays": true,
  "skills.curator.archiveDays": true,
  "skills.review.enabled": true,
  "skills.review.intervalTurns": true,
  "skills.review.model": true,
  "skills.review.maxInputTokens": true,
  "skills.review.requireApproval": true,
  "astGrep.enabled": true,
  "checkpoint.enabled": true,
  "github.enabled": true,
  "security.enabled": true,
  "autolearn.enabled": true,
} satisfies Record<keyof Omit<OmpSettingsValues, "advanced">, true>;

/** Lookup table — every omp setting id already covered by a curated key in {@link OmpSettingsValues}. */
export const CURATED_OMP_KEYS: Readonly<Record<string, true>> = _curatedCheck;

// ── Skill approval / journey ──────────────────────────────────────────────────

/** A pending skill proposal waiting for user approval. */
export interface OmpSkillProposal {
  id: string;
  name: string;
  description: string;
  body: string;
  stagedAt: string;
}

/** Result of `ompSkillProposalList`. */
export interface OmpSkillProposalListResult {
  proposals: OmpSkillProposal[];
}

/** Result of `ompSkillProposalApprove` / `ompSkillProposalReject`. */
export interface OmpSkillProposalActResult {
  ok: boolean;
}

/** One event in the skill journey timeline. */
export type OmpJourneyEvent =
  | { type: "curator"; ts: string; actor: string; action: string; skill: string }
  | { type: "git-commit"; ts: string; hash: string; skill: string; message: string }
  | { type: "proposal-approved" | "proposal-rejected"; ts: string; skill: string; id: string };

/** Result of `ompSkillJourney`. */
export interface OmpSkillJourneyResult {
  events: OmpJourneyEvent[];
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
  /** Present on `type: "message"` entries (raw omp SessionEntry message). */
  message?: { role?: string; content?: unknown };
}

/** Result of `omp.session.entries`. */
export interface OmpSessionEntriesResult {
  entries: OmpSessionEntry[];
  leafId: string | null;
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
/** One installed omp skillshare package (from skills.json + skills.lock.json on disk). */
export interface OmpInstalledSkillEntry {
  /** `@scope/name` package id. */
  id: string;
  /** `"project"` when installed in the nearest `.omp/` dir; `"user"` for `~/.omp/agent/`. */
  scope: "project" | "user";
  /** Locked version; absent when the manifest entry was never installed. */
  version?: string;
  /** Manifest semver range; absent for a lock entry without a manifest entry. */
  range?: string;
  /** True when the store directory is present with the correct integrity hash. */
  stored: boolean;
}

/** Result of `ompInstalledSkillsList`. */
export interface OmpInstalledSkillsListResult {
  skills: OmpInstalledSkillEntry[];
}

/**
 * Aggregated historical stats from `omp stats --json` (subset of DashboardStats.overall).
 * Absent when omp binary is unreachable or the stats DB has never been synced.
 */
export interface OmpHistoricalStatsResult {
  totalRequests: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheRate: number;
  /** ISO-8601 timestamp of when the stats were collected. */
  collectedAt: string;
}

/** One agent-managed git worktree under `~/.omp/wt/` (from disk scan). */
export interface OmpWorktreeEntry {
  /** Absolute path to the worktree directory. */
  path: string;
  /** Classification: PR checkout, task-isolation dir, empty dir, or unrecognised dir. */
  kind: "pr-checkout" | "task-isolation" | "empty" | "stray";
  /** Branch name when available. */
  branch?: string;
  /** Parent repo root when this is a registered git worktree. */
  parentRepo?: string;
  /** Non-null when the entry is unhealthy and should be cleared. */
  orphanReason?: string;
}

/** Result of `ompWorktreeList`. */
export interface OmpWorktreeListResult {
  worktrees: OmpWorktreeEntry[];
}

/** Result of `ompWorktreeClear` (clear one worktree). */
export interface OmpWorktreeClearResult {
  ok: boolean;
  /** OS error message when ok is false. */
  error?: string;
}

/** Result of `ompWorktreePrune` (prune all orphaned worktrees). */
export interface OmpWorktreePruneResult {
  ok: boolean;
  /** Paths that were pruned. */
  pruned: string[];
  /** OS error message when ok is false. */
  error?: string;
}

/** Result of `ompWorktreeAdd` (add a new worktree). */
export interface OmpWorktreeAddResult {
  ok: boolean;
  /** Absolute path to the created worktree. */
  path?: string;
  /** OS error message when ok is false. */
  error?: string;
}

/** Result of `omp.share` — snapshot URL from the `/share` slash command. */
export interface OmpShareResult {
  /** Extracted share URL, or null when omp returned no URL. */
  url: string | null;
  /** Raw text output from the `/share` command (for display). */
  text: string | null;
}

/** One installed omp extension (npm plugin or marketplace plugin). */
export interface OmpExtensionEntry {
  /** Unique identifier: npm package name for npm, plugin id for marketplace. */
  id: string;
  /** Display name (same as id for npm plugins). */
  name: string;
  /** Installed version, if known. */
  version?: string;
  /** Installation source. */
  source: "npm" | "marketplace";
  /** Whether the extension is currently enabled. */
  enabled: boolean;
  /** Short description from manifest, if available. */
  description?: string;
}

/** Result of `ompExtensionsList`. */
export interface OmpExtensionListResult {
  extensions: OmpExtensionEntry[];
}

/** Result of `ompExtensionInstall` / `ompExtensionUninstall`. */
export interface OmpExtensionMutateResult {
  ok: boolean;
  output: string;
}

/** Result of the omp `bash` RPC command. */
export interface OmpBashResult {
  /** Combined stdout+stderr from the command. */
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
}

/** Result of `ompUserProfileGet` — raw text from ~/.omp/agent/USER.md (empty when absent). */
export interface OmpUserProfileGetResult {
  text: string;
}

/** Result of `ompUserProfileSet` — ok on success, error message on failure. */
export interface OmpUserProfileSetResult {
  ok: boolean;
  error?: string;
}

/** One language server as omp will see it: its built-in default merged with `~/.omp/agent/lsp.json`. */
export interface OmpLspServer {
  name: string;
  command: string;
  fileTypes: string[];
  /** Ships in omp's built-in set. */
  builtin: boolean;
  /** Has an entry in the user's lsp.json (an added server, or an override of a built-in). */
  custom: boolean;
  disabled: boolean;
  isLinter: boolean;
  /** Where `command` resolves on the agent's PATH; null = not found. */
  resolved: string | null;
  /** `resolved` is inside Fcode's bundled tools folder. */
  bundled: boolean;
}

/** Result of `ompLspList`. `error` is set when lsp.json could not be read (the built-ins are still listed). */
export interface OmpLspListResult {
  servers: OmpLspServer[];
  configPath: string;
  error?: string;
}

/** Input of `ompLspSave`: fields given are merged into the server's lsp.json entry. A new name needs `command` and `fileTypes`. */
export interface OmpLspSaveInput {
  name: string;
  command?: string;
  args?: string[];
  fileTypes?: string[];
  rootMarkers?: string[];
  disabled?: boolean;
}

/** One local commit on the self-improvement branch of a skill pack clone. */
export interface OmpSkillPackCommit {
  sha: string;
  subject: string;
}
/** Lint result for one skill file in the self-improve branch. */
export interface OmpSkillLintResult {
  skill: string;
  errors: string[];
  warnings: string[];
}

/** State of the self-improving skill pack (`<dataDir>/skills/frappeskills`). */
export interface OmpSkillPackStatus {
  /** False until the first background clone has landed (bundled snapshot in use). */
  cloned: boolean;
  branch: string;
  /** Commits on the branch that upstream does not have yet. */
  commits: OmpSkillPackCommit[];
  /** Files changed against upstream, committed or not. */
  files: string[];
  /** True when the working tree has edits that are not committed. */
  dirty: boolean;
  /** Lint results for each changed .md file (empty array when nothing to lint). */
  lint: OmpSkillLintResult[];
}

/** Result of `ompSkillPackOpenPr`. */
export interface OmpSkillPackOpenPrResult {
  url: string;
}

/** One entry returned by `ompSkillCuratorStatus`. */
export interface OmpSkillCuratorEntry {
  name: string;
  uses: number;
  lastUsed: string | null;
  status: "active" | "stale" | "archived" | "pinned";
}

/** Result of `ompSkillCuratorStatus`. */
export interface OmpSkillCuratorStatusResult {
  skills: OmpSkillCuratorEntry[];
}

/** Result of `ompSkillCuratorRestore` / `ompSkillCuratorPin`. */
export interface OmpSkillCuratorMutateResult {
  ok: boolean;
}

/** Source tier for one entry in the effective agent list. */
export type OmpAgentSource = "project" | "user" | "fcode" | "omp";

/** One entry in the effective agent list (merged across all sources). */
export interface OmpAgentEntry {
  name: string;
  description: string;
  /** Tool names declared in frontmatter; empty for "all tools" agents (e.g. task). */
  tools: string[];
  /** Model pin if the agent frontmatter declares one (e.g. "@smol"). */
  model?: string;
  /** Where this agent came from. */
  source: OmpAgentSource;
  /** True when a higher-priority source provides an agent with the same name. */
  shadowed?: boolean;
}

/** Result of `ompAgentList`. */
export interface OmpAgentListResult {
  agents: OmpAgentEntry[];
}

// ── Session RPC surface (slice D) ────────────────────────────────────────────

/**
 * One node in the session tree returned by `get_tree`.
 * Mirrors omp's `SessionTreeNode`; children are nested nodes.
 * Content of `entry` is opaque (omp-internal); use `OmpSessionEntry` for ids.
 */
export interface OmpSessionTreeNode {
  entry: OmpSessionEntry;
  children: OmpSessionTreeNode[];
  label?: string;
}

/** Result of `omp.session.getTree`. */
export interface OmpSessionGetTreeResult {
  tree: OmpSessionTreeNode[];
  leafId: string | null;
}

/** Result of `omp.session.getMessages` (full message list, no paging). */
export interface OmpSessionMessagesResult {
  /** Raw AgentMessage objects from omp; typed as unknown for forward-compat. */
  messages: unknown[];
}

/** One page of messages from `get_messages_page`. */
export interface OmpSessionMessagesPageResult {
  messages: unknown[];
  /** Opaque cursor; absent when this is the last page. */
  nextCursor?: string;
  totalMessages: number;
}

/** Result of `omp.session.newSession`. */
export interface OmpNewSessionResult {
  cancelled: boolean;
}

/** Result of `omp.session.switchSession`. */
export interface OmpSwitchSessionResult {
  cancelled: boolean;
}

// ── Hooks / Slash-Command authoring (slice E1) ────────────────────────────────

/** One hook script entry (pre- or post-tool execution hook). */
export interface OmpHookEntry {
  /** Filename including extension, e.g. "bash.sh". */
  name: string;
  /** Absolute path to the hook script. */
  path: string;
  /** "pre" | "post" */
  type: "pre" | "post";
  /** Tool the hook applies to, e.g. "bash" or "*" for all. */
  tool: string;
  /** "user" (in ~/.omp/agent/) or "project" (in .omp/ relative to cwd). */
  level: "user" | "project";
  /** Raw script content. */
  content: string;
  /**
   * True when this hook is not in disabledExtensions.
   * The extension id is `hook:<type>:<tool>:<name>` per omp's hookCapability.toExtensionId.
   */
  enabled: boolean;
}

/** Result of `ompHooksList`. */
export interface OmpHooksListResult {
  hooks: OmpHookEntry[];
}

/** Result of `ompHooksCreate` / `ompHooksEdit` / `ompHooksDelete`. */
export interface OmpHookMutateResult {
  ok: boolean;
  error?: string;
}

/** Result of `ompCommandsCreate` / `ompCommandsEdit` / `ompCommandsDelete`. */
export interface OmpCommandMutateResult {
  ok: boolean;
  error?: string;
}

/** Result of `ompCommandRead` — raw file content of a user slash-command. */
export interface OmpCommandReadResult {
  content: string;
}

/** Result of `ompCleanse` — output of `omp cleanse` run in the workspace. */
export interface OmpCleanseResult {
  ok: boolean;
  output: string;
}

/** Result of `ompAutoresearch` — ack from the `/autoresearch` slash command dispatch. */
export interface OmpAutoresearchResult {
  /** false = slash command ran locally; true = fell through to LLM; absent = error. */
  agentInvoked?: boolean;
}

// ── omp CLI runner (slice F) ──────────────────────────────────────────────────

/** Allowed omp CLI subcommands exposed via `ompCliRun`. */
export type OmpCliSubcommand =
  | "stats"
  | "usage"
  | "gc"
  | "models"
  | "ps"
  | "worktree"
  | "tiny-models"
  | "toks"
  | "config"
  | "web-search";

/** Result of `ompCliRun` — the run identifier (output arrives via events). */
export interface OmpCliRunResult {
  runId: string;
}

/** `ompCliOutput` event payload — one stdout/stderr chunk from a CLI run. */
export interface OmpCliOutputEvent {
  runId: string;
  chunk: string;
  stream: "stdout" | "stderr";
}

/** `ompCliDone` event payload — CLI run completed or was killed. */
export interface OmpCliDoneEvent {
  runId: string;
  exitCode: number | null;
  killed: boolean;
}

/** Result of `omp.tui.open` — TUI launch script path and project cwd. */
export interface OmpTuiOpenResult {
  /** Executable shell script (mode 0600) that sets provider env and execs omp TUI. */
  scriptPath: string;
  /** Working directory (session project path) for the integrated terminal. */
  cwd: string | null;
}

/** Result of `omp.acp.info` — ACP launch command and editor config snippets. */
export interface OmpAcpInfoResult {
  /** Full command: `<binaryPath> acp --config <overlayPath>` */
  command: string;
  binaryPath: string;
  overlayPath: string;
  /** JSON string to paste into Zed's `agent_servers` array. */
  zedSnippet: string;
  /** JSON string for JetBrains / cursor-style agent config. */
  jetbrainsSnippet: string;
}
