/**
 * Host-persisted omp settings groups (task / eval / browser / collab).
 * Stored in `<dataDir>/omp-settings.json`; injected into the bridge overlay
 * on sidecar restart via the `FCODE_OMP_SETTINGS` env var.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OmpSettingsValues } from "@pi-desktop/shared";
import { writeJsonAtomicSync } from "./atomic-json";

// ─────────────────────────────────────────────────────────────────────────────
// Schema — mirrors the omp source settings exactly (enums, min/max).
// ─────────────────────────────────────────────────────────────────────────────

type FieldSchema =
  | { type: "boolean" }
  | { type: "string" }
  | { type: "number"; min: number; max: number }
  | { type: "enum"; values: readonly string[] }
  | { type: "array" }
  | { type: "record" };

const ISOLATION_BACKENDS = ["auto", "apfs", "btrfs", "zfs", "reflink", "overlayfs", "projfs", "block-clone", "rcopy"] as const;
const COLLAB_AUTO_START = ["off", "view", "control"] as const;
const PYTHON_KERNEL_MODES = ["session", "per-call"] as const;
const QUEUE_FLOW_MODES = ["all", "one-at-a-time"] as const;
const INTERRUPT_MODES = ["immediate", "wait"] as const;
const LOOP_MODES = ["prompt", "compact", "reset"] as const;
const HINDSIGHT_RETAIN_MODES = ["full-session", "last-turn"] as const;
const MNEMOPI_SCOPING_MODES = ["global", "per-project", "per-project-tagged"] as const;
const HINDSIGHT_SCOPING_MODES = ["global", "per-project", "per-project-tagged"] as const;
const MNEMOPI_EMBEDDING_VARIANTS = ["en", "multilingual"] as const;
const HINDSIGHT_RECALL_BUDGETS = ["low", "mid", "high"] as const;

const SCHEMA: Record<keyof OmpSettingsValues, FieldSchema> = {
  // Task / isolation (omp/packages/coding-agent/src/task/settings.ts)
  "task.isolation.enabled":   { type: "boolean" },
  "isolation.backend":        { type: "enum", values: ISOLATION_BACKENDS },
  "worktree.clone":           { type: "boolean" },
  "task.maxConcurrency":      { type: "number", min: 0, max: 256 },
  "task.maxRecursionDepth":   { type: "number", min: -1, max: 32 },
  "task.agentModelOverrides": { type: "record" },
  // Eval / Python (omp/packages/coding-agent/src/eval/settings.ts)
  "eval.py":                  { type: "boolean" },
  "eval.js":                  { type: "boolean" },
  "eval.tools.enabled":       { type: "boolean" },
  "python.kernelMode":        { type: "enum", values: PYTHON_KERNEL_MODES },
  "python.interpreter":       { type: "string" },
  // Bash (Fcode-owned; bridge.ts turns it into omp `bash.patterns` allow-rules)
  "bash.autoApproveReadOnly": { type: "boolean" },
  // Browser (omp/packages/coding-agent/src/tools/browser/settings.ts)
  "browser.enabled":          { type: "boolean" },
  "browser.cdpUrl":           { type: "string" },
  "browser.relay":            { type: "boolean" },
  "browser.relayUrl":         { type: "string" },
  "browser.headless":         { type: "boolean" },
  // Collab (omp/packages/coding-agent/src/collab/settings.ts)
  "collab.relayUrl":          { type: "string" },
  "collab.webUrl":            { type: "string" },
  "collab.displayName":       { type: "string" },
  "collab.autoStart":         { type: "enum", values: COLLAB_AUTO_START },
  // Queue modes (omp/packages/coding-agent/src/modes/settings.ts)
  "steeringMode":             { type: "enum", values: QUEUE_FLOW_MODES },
  "followUpMode":             { type: "enum", values: QUEUE_FLOW_MODES },
  "interruptMode":            { type: "enum", values: INTERRUPT_MODES },
  "loop.mode":                { type: "enum", values: LOOP_MODES },
  // LSP (omp/packages/coding-agent/src/lsp/settings.ts)
  "lsp.enabled":              { type: "boolean" },
  "lsp.formatOnWrite":        { type: "boolean" },
  "lsp.diagnosticsOnWrite":   { type: "boolean" },
  "lsp.diagnosticsOnEdit":    { type: "boolean" },
  // IDA Pro (omp/packages/coding-agent/src/ida/settings.ts)
  "ida.enabled":              { type: "boolean" },
  "ida.python":               { type: "string" },
  "ida.installDir":           { type: "string" },
  // MCP (omp/packages/coding-agent/src/mcp/settings.ts)
  "mcp.enableProjectConfig":  { type: "boolean" },
  "mcp.renderMarkdownResults":{ type: "boolean" },
  "mcp.notifications":        { type: "boolean" },
  // Skills & Commands (omp/packages/coding-agent/src/extensibility/settings.ts)
  "skills.enabled":           { type: "boolean" },
  "skills.registryUrl":       { type: "string" },
  "skills.customDirectories": { type: "array" },
  "commands.enableClaudeUser":  { type: "boolean" },
  "commands.enableClaudeProject": { type: "boolean" },
  // Extensions (omp/packages/coding-agent/src/extensibility/settings.ts)
  extensions:                   { type: "array" },
  disabledExtensions:           { type: "array" },
  // Hindsight behavioral (omp/packages/coding-agent/src/hindsight/settings.ts)
  "hindsight.autoRecall":          { type: "boolean" },
  "hindsight.autoRetain":          { type: "boolean" },
  "hindsight.retainMode":          { type: "enum", values: HINDSIGHT_RETAIN_MODES },
  "hindsight.mentalModelsEnabled": { type: "boolean" },
  "hindsight.mentalModelAutoSeed": { type: "boolean" },
  // Mnemopi advanced (omp/packages/coding-agent/src/mnemopi/settings.ts)
  // mnemopi.llmMode forced to "session" by overlay; mnemopi.embeddingApiKey/llmApiKey are secrets.
  "mnemopi.scoping":               { type: "enum", values: MNEMOPI_SCOPING_MODES },
  "mnemopi.dbPath":                { type: "string" },
  "mnemopi.bank":                  { type: "string" },
  "mnemopi.embeddingVariant":      { type: "enum", values: MNEMOPI_EMBEDDING_VARIANTS },
  "mnemopi.autoRecall":            { type: "boolean" },
  "mnemopi.autoRetain":            { type: "boolean" },
  "mnemopi.polyphonicRecall":      { type: "boolean" },
  "mnemopi.enhancedRecall":        { type: "boolean" },
  "mnemopi.proactiveLinking":      { type: "boolean" },
  "mnemopi.noEmbeddings":          { type: "boolean" },
  "mnemopi.embeddingModel":        { type: "string" },
  "mnemopi.embeddingApiUrl":       { type: "string" },
  "mnemopi.llmBaseUrl":            { type: "string" },
  "mnemopi.llmModel":              { type: "string" },
  "mnemopi.retainEveryNTurns":     { type: "number", min: 1, max: 100 },
  "mnemopi.recallLimit":           { type: "number", min: 1, max: 200 },
  "mnemopi.recallContextTurns":    { type: "number", min: 0, max: 20 },
  "mnemopi.recallMaxQueryChars":   { type: "number", min: 100, max: 50000 },
  "mnemopi.injectionTokenLimit":   { type: "number", min: 0, max: 200000 },
  "mnemopi.debug":                 { type: "boolean" },
  // Hindsight advanced remaining (omp/packages/coding-agent/src/hindsight/settings.ts)
  // hindsight.retainContext is purely internal; hindsight.recallTypes is array-of-string (complex, skip).
  "hindsight.scoping":                    { type: "enum", values: HINDSIGHT_SCOPING_MODES },
  "hindsight.bankIdPrefix":               { type: "string" },
  "hindsight.retainEveryNTurns":          { type: "number", min: 1, max: 100 },
  "hindsight.retainOverlapTurns":         { type: "number", min: 0, max: 20 },
  "hindsight.recallBudget":               { type: "enum", values: HINDSIGHT_RECALL_BUDGETS },
  "hindsight.recallMaxTokens":            { type: "number", min: 0, max: 100000 },
  "hindsight.recallContextTurns":         { type: "number", min: 0, max: 20 },
  "hindsight.recallMaxQueryChars":        { type: "number", min: 0, max: 50000 },
  "hindsight.debug":                      { type: "boolean" },
  "hindsight.requestTimeoutMs":           { type: "number", min: 1000, max: 600000 },
  "hindsight.reflectTimeoutMs":           { type: "number", min: 1000, max: 600000 },
  "hindsight.recallTimeoutMs":            { type: "number", min: 1000, max: 600000 },
  "hindsight.retainTimeoutMs":            { type: "number", min: 1000, max: 600000 },
  "hindsight.mentalModelMaxRenderChars":  { type: "number", min: 0, max: 200000 },
  // Sharpshooter (omp/packages/coding-agent/src/sharpshooter/settings.ts)
  "sharpshooter.model":               { type: "string" },
  "sharpshooter.intervalMinutes":     { type: "number", min: 1, max: 1440 },
  "sharpshooter.injectionTokenLimit": { type: "number", min: 0, max: 200000 },
  // Local memory pipeline (omp/packages/coding-agent/src/memories/settings.ts)
  // memories.enabled is legacy/hidden; stage1/phase2 lease/retry/heartbeat are pipeline internals.
  "memories.maxRolloutsPerStartup":        { type: "number", min: 1, max: 10000 },
  "memories.maxRolloutAgeDays":            { type: "number", min: 1, max: 365 },
  "memories.minRolloutIdleHours":          { type: "number", min: 0, max: 168 },
  "memories.summaryInjectionTokenLimit":   { type: "number", min: 0, max: 200000 },
  // Appearance — HTML export themes (omp/packages/coding-agent/src/modes/settings.ts)
  "theme.dark":                    { type: "string" },
  "theme.light":                   { type: "string" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function readOmpSettings(dataDir: string): OmpSettingsValues {
  try {
    const raw = JSON.parse(readFileSync(join(dataDir, "omp-settings.json"), "utf8")) as unknown;
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      // Re-validate on load so stale/corrupt files don't blow up the sidecar.
      return validateOmpSettings(raw as Record<string, unknown>);
    }
  } catch {
    // File absent, unreadable, or invalid — return empty (omp keeps its defaults).
  }
  return {};
}

/**
 * Trust boundary: validate a patch object against the schema.
 * Returns a new object with only known, correctly typed keys.
 * Throws on the first violation so the caller can surface a clear error.
 */
export function validateOmpSettings(patch: Record<string, unknown>): OmpSettingsValues {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue; // allow omission
    const rule = SCHEMA[key as keyof OmpSettingsValues];
    if (!rule) {
      throw new Error(`unknown omp setting key: ${JSON.stringify(key)}`);
    }
    switch (rule.type) {
      case "boolean":
        if (typeof value !== "boolean") {
          throw new Error(`omp setting ${JSON.stringify(key)}: expected boolean, got ${typeof value}`);
        }
        break;
      case "string":
        if (typeof value !== "string") {
          throw new Error(`omp setting ${JSON.stringify(key)}: expected string, got ${typeof value}`);
        }
        break;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new Error(`omp setting ${JSON.stringify(key)}: expected number, got ${typeof value}`);
        }
        if (value < rule.min || value > rule.max) {
          throw new Error(`omp setting ${JSON.stringify(key)}: ${value} out of range [${rule.min}, ${rule.max}]`);
        }
        break;
      case "enum":
        if (typeof value !== "string" || !(rule.values as readonly string[]).includes(value)) {
          throw new Error(
            `omp setting ${JSON.stringify(key)}: invalid value ${JSON.stringify(value)}, expected one of ${rule.values.join(", ")}`,
          );
        }
        break;
      case "array":
        if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
          throw new Error(`omp setting ${JSON.stringify(key)}: expected string[], got ${typeof value}`);
        }
        break;
      case "record": {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          throw new Error(`omp setting ${JSON.stringify(key)}: expected object, got ${Array.isArray(value) ? "array" : typeof value}`);
        }
        const rec: Record<string, string> = {};
        for (const [agentName, modelId] of Object.entries(value as Record<string, unknown>)) {
          if (!agentName) continue; // skip empty keys silently
          // Reject keys with YAML metacharacters (newline, colon, control chars).
          // Agent ids are identifiers: allow letters, digits, hyphen, underscore, dot.
          if (!/^[a-zA-Z0-9_.\-]+$/.test(agentName)) {
            throw new Error(`omp setting ${JSON.stringify(key)}: invalid agent id ${JSON.stringify(agentName)}`);
          }
          if (typeof modelId !== "string") {
            throw new Error(`omp setting ${JSON.stringify(key)}[${JSON.stringify(agentName)}]: expected string model id, got ${typeof modelId}`);
          }
          if (modelId !== "") rec[agentName] = modelId; // empty string clears the entry
        }
        out[key] = rec;
        continue; // already stored
      }
    }
    out[key] = value;
  }
  return out as OmpSettingsValues;
}

export function writeOmpSettings(dataDir: string, settings: OmpSettingsValues): void {
  writeJsonAtomicSync(join(dataDir, "omp-settings.json"), settings);
}

/** Env var that the bridge process reads to build the overlay. */
export function ompSettingsEnv(settings: OmpSettingsValues): Record<string, string> {
  return { FCODE_OMP_SETTINGS: JSON.stringify(settings) };
}
