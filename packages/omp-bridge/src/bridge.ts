/**
 * omp-bridge — sidecar process that replaces pi-agent-core as the AI brain.
 *
 * This file is the entry point run by Electron with ELECTRON_RUN_AS_NODE=1.
 * It speaks Fcode's sidecar NDJSON JSON-RPC on stdin/stdout and drives
 * a bundled `omp --mode rpc` child process.
 *
 * Key design decisions (from the plan and review phases):
 *
 * DX3  — Overlay write failure is FATAL to the spawn; never fall back to
 *         omp's `yolo` approval default.
 * DX6  — All host tools use the `fcode_` prefix.
 * DX7  — fcode_bench_execute auto-approves only read-only method prefixes;
 *         everything else is `always-ask`.
 * DX10 — Protocol v1 fallback emits a system warning and keeps read-only.
 * E9   — All extension_ui_request methods are handled (cancel, editor, notify,
 *         setStatus/setWidget/setTitle forward as sidecar.ext_ui notifications).
 * E10  — The outer NDJSON line is capped at NDJSON_LINE_CAP before reaching
 *         the main process.
 * E14  — open_session failure falls back to a new session; corrupt map = empty.
 * E19  — supportsVision derived from model input modalities; projectPath carried.
 * E20  — Multi-select answers serialized with NUL delimiter.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ErrorCodes, readNdjsonLines, type OmpSettingsValues } from "@pi-desktop/shared";
import { capNdjsonLine, reassembleChunk } from "./chunks.js";
import { SessionStore } from "./sessions.js";
import { createBridgeState } from "./state.js";
import {
  mapExtensionUiRequest,
  serializeAskAnswers,
} from "./ui-requests.js";
import type { OmpExtensionUiRequest } from "./ui-requests.js";

// ─────────────────────────────────────────────────────────────────────────────
// Binary resolution (T7 / DX6)
// ─────────────────────────────────────────────────────────────────────────────

interface ResolveBinaryOptions {
  resourcesPath: string;
  env: Record<string, string | undefined>;
}

/** All three probed paths, in order, for sidecar.fatal reporting (T7). */
export function ompBinaryCandidates(resourcesPath: string): string[] {
  return [
    join(resourcesPath, "bin", "omp"),
    join(resourcesPath, "bin", "omp.exe"),
    "omp",
  ];
}

/**
 * Resolve the omp binary path.
 * Order: OMP_BIN env → resourcesPath/bin/omp (file-exists check) → "omp" on PATH.
 * Never throws — callers check the return value themselves for sidecar.fatal.
 */
export function resolveOmpBinary(opts: ResolveBinaryOptions): string {
  if (opts.env.OMP_BIN) return opts.env.OMP_BIN;
  const candidates = ompBinaryCandidates(opts.resourcesPath);
  for (const c of candidates.slice(0, -1)) {
    if (existsSync(c)) return c;
  }
  return "omp"; // PATH fallback
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlay generation (DX3 / DX6 / DX7 / DX10)
// ─────────────────────────────────────────────────────────────────────────────

interface OverlayOptions {
  dataDir: string;
  resourcesPath: string;
  screenshotsDir: string;
  /** Memory backend selection; the Hindsight token travels via HINDSIGHT_API_TOKEN env, never here. */
  memory?: { backend: "mnemopi" | "hindsight" | "off"; hindsightUrl?: string; hindsightBank?: string };
  /** Tool approval mode; defaults to "always-ask" (never yolo). */
  approvalMode?: "always-ask" | "write" | "yolo";
  /** User-configured omp settings groups; absent keys use omp's own defaults. */
  ompSettings?: OmpSettingsValues;
}

/**
 * Read-only method prefixes for fcode_bench_execute auto-approval (DX7).
 * Segment-aware: each entry must match the full method segment, not a substring.
 * E.g. "frappe.client.get_list" must NOT match "frappe.client.get_list_evil".
 */
const READ_ONLY_PREFIXES = [
  "frappe.client.get",
  "frappe.client.get_list",
  "frappe.db.get_value",
  "frappe.db.count",
  "frappe.utils.",
  "studio.api.get_",
  "studio.api.list_",
  "builder.api.get_",
  "builder.api.list_",
] as const;

/**
 * Return true when the given `bench execute` method should be auto-approved
 * (is read-only). Segment-aware: the prefix must match at a dot boundary or
 * at the end of the string, never mid-segment (DX7).
 */
export function isReadOnlyExecuteMethod(method: string): boolean {
  if (!method) return false;
  for (const prefix of READ_ONLY_PREFIXES) {
    if (method === prefix) return true;
    // Allow the prefix if it ends with "." or "_" — both are namespace delimiters here.
    // E.g. "frappe.utils." matches frappe.utils.now; "studio.api.get_" matches studio.api.get_page.
    if ((prefix.endsWith(".") || prefix.endsWith("_")) && method.startsWith(prefix)) return true;
    // For bare-word prefixes, only match if followed by "." (next segment) or end-of-string.
    if (!prefix.endsWith(".") && !prefix.endsWith("_") && method.startsWith(prefix)) {
      const rest = method.slice(prefix.length);
      if (rest === "" || rest[0] === ".") return true;
    }
  }
  return false;
}

/**
 * Generate the YAML content for the omp overlay config (DX3, DX7, DX10).
 * The overlay is written before omp is spawned; a write failure is fatal.
 */
export function makeOmpOverlay(opts: OverlayOptions): string {
  const skillsDir = resolve(join(opts.resourcesPath, "fcode-skills"));
  const screenshotsDir = resolve(opts.screenshotsDir);
  const mode = opts.approvalMode ?? "always-ask";
  const s = opts.ompSettings ?? {};

  // Merge user browser settings onto Fcode's required defaults.
  const browserEnabled  = s["browser.enabled"]  ?? true;
  const browserHeadless = s["browser.headless"] ?? true;
  const browserRelay    = s["browser.relay"]    ?? false;

  // Skills: fcode-skills dir always first; user dirs appended.
  const userSkillDirs = s["skills.customDirectories"] ?? [];

  // Hindsight: collect all lines so we emit exactly one hindsight: block.
  const hindsightLines: string[] = [];
  if (opts.memory?.backend === "hindsight") {
    if (opts.memory.hindsightUrl) hindsightLines.push(`  apiUrl: ${JSON.stringify(opts.memory.hindsightUrl)}`);
    if (opts.memory.hindsightBank) hindsightLines.push(`  bankId: ${JSON.stringify(opts.memory.hindsightBank)}`);
  }
  if (s["hindsight.autoRecall"]          !== undefined) hindsightLines.push(`  autoRecall: ${s["hindsight.autoRecall"]}`);
  if (s["hindsight.autoRetain"]          !== undefined) hindsightLines.push(`  autoRetain: ${s["hindsight.autoRetain"]}`);
  if (s["hindsight.retainMode"]          !== undefined) hindsightLines.push(`  retainMode: ${s["hindsight.retainMode"]}`);
  if (s["hindsight.mentalModelsEnabled"] !== undefined) hindsightLines.push(`  mentalModelsEnabled: ${s["hindsight.mentalModelsEnabled"]}`);
  if (s["hindsight.mentalModelAutoSeed"] !== undefined) hindsightLines.push(`  mentalModelAutoSeed: ${s["hindsight.mentalModelAutoSeed"]}`);

  // ponytail: YAML by hand — avoids a yaml dep for a ~20-line config file.
  return [
    "# omp overlay for Fcode — generated on each launch, do not edit.",
    `# DX3: approval_mode ${mode} — controlled by Fcode Settings > AI > Tool approval mode.`,
    "tools:",
    `  approval_mode: ${mode}`,
    "  approval:",
    "    # DX7: auto-approve read-only fcode_bench_execute calls.",
    "    fcode_bench_execute_read: allow",
    "    # T7: auto-approve read-only canvas inspection calls.",
    "    fcode_canvas_read: allow",
    "",
    "skills:",
    `  customDirectories:`,
    `    - "${skillsDir}"`,
    ...userSkillDirs.map((d) => `    - ${JSON.stringify(d)}`),
    "  enableClaudeUser: true",
    ...(s["skills.enabled"] !== undefined ? [`  enabled: ${s["skills.enabled"]}`] : []),
    ...(s["skills.registryUrl"] ? [`  registryUrl: ${JSON.stringify(s["skills.registryUrl"])}`] : []),
    "",
    "browser:",
    `  enabled: ${browserEnabled}`,
    `  headless: ${browserHeadless}`,
    `  screenshotDir: "${screenshotsDir}"`,
    `  relay: ${browserRelay}`,
    ...(s["browser.cdpUrl"]   ? [`  cdpUrl: ${JSON.stringify(s["browser.cdpUrl"])}`]   : []),
    ...(s["browser.relayUrl"] ? [`  relayUrl: ${JSON.stringify(s["browser.relayUrl"])}`] : []),
    ...(opts.memory
      ? [
          "",
          "memory:",
          `  backend: ${opts.memory.backend}`,
          "mnemopi:",
          "  llmMode: session",
        ]
      : []),
    ...(hindsightLines.length > 0 ? ["", "hindsight:", ...hindsightLines] : []),
    // Task / isolation / eval / collab / LSP / IDA / MCP / commands settings
    ...ompSettingsYaml(s),
  ].join("\n");
}

/**
 * Generate YAML lines for the user-configured omp settings groups.
 * Only emits sections where the user has set at least one key.
 * Skills/browser/hindsight are handled inline in makeOmpOverlay to avoid duplicate keys.
 */
function ompSettingsYaml(s: OmpSettingsValues): string[] {
  const lines: string[] = [];

  // task section
  const taskIso = s["task.isolation.enabled"];
  const taskConc = s["task.maxConcurrency"];
  const taskDepth = s["task.maxRecursionDepth"];
  const taskModelOverrides = s["task.agentModelOverrides"];
  if (taskIso !== undefined || taskConc !== undefined || taskDepth !== undefined || taskModelOverrides !== undefined) {
    lines.push("", "task:");
    if (taskIso !== undefined) { lines.push("  isolation:"); lines.push(`    enabled: ${taskIso}`); }
    if (taskConc !== undefined) lines.push(`  maxConcurrency: ${taskConc}`);
    if (taskDepth !== undefined) lines.push(`  maxRecursionDepth: ${taskDepth}`);
    if (taskModelOverrides !== undefined && Object.keys(taskModelOverrides).length > 0) {
      lines.push("  agentModelOverrides:");
      for (const [agent, modelId] of Object.entries(taskModelOverrides)) {
        lines.push(`    ${agent}: ${JSON.stringify(modelId)}`);
      }
    }
  }

  // isolation section
  if (s["isolation.backend"] !== undefined) {
    lines.push("", "isolation:", `  backend: ${s["isolation.backend"]}`);
  }

  // worktree section
  if (s["worktree.clone"] !== undefined) {
    lines.push("", "worktree:", `  clone: ${s["worktree.clone"]}`);
  }

  // eval section
  const evalPy = s["eval.py"];
  const evalJs = s["eval.js"];
  const evalTools = s["eval.tools.enabled"];
  if (evalPy !== undefined || evalJs !== undefined || evalTools !== undefined) {
    lines.push("", "eval:");
    if (evalPy !== undefined) lines.push(`  py: ${evalPy}`);
    if (evalJs !== undefined) lines.push(`  js: ${evalJs}`);
    if (evalTools !== undefined) { lines.push("  tools:"); lines.push(`    enabled: ${evalTools}`); }
  }

  // python section
  const pyMode = s["python.kernelMode"];
  const pyInterp = s["python.interpreter"];
  if (pyMode !== undefined || pyInterp !== undefined) {
    lines.push("", "python:");
    if (pyMode !== undefined) lines.push(`  kernelMode: ${pyMode}`);
    if (pyInterp !== undefined && pyInterp !== "") lines.push(`  interpreter: ${JSON.stringify(pyInterp)}`);
  }

  // collab section
  const collabRelay = s["collab.relayUrl"];
  const collabWeb   = s["collab.webUrl"];
  const collabName  = s["collab.displayName"];
  const collabAuto  = s["collab.autoStart"];
  if (collabRelay !== undefined || collabWeb !== undefined || collabName !== undefined || collabAuto !== undefined) {
    lines.push("", "collab:");
    if (collabRelay !== undefined && collabRelay !== "") lines.push(`  relayUrl: ${JSON.stringify(collabRelay)}`);
    if (collabWeb   !== undefined && collabWeb   !== "") lines.push(`  webUrl: ${JSON.stringify(collabWeb)}`);
    if (collabName  !== undefined && collabName  !== "") lines.push(`  displayName: ${JSON.stringify(collabName)}`);
    if (collabAuto  !== undefined) lines.push(`  autoStart: ${collabAuto}`);
  }

  // lsp section
  const lspEnabled = s["lsp.enabled"];
  const lspFmt = s["lsp.formatOnWrite"];
  const lspDiagWrite = s["lsp.diagnosticsOnWrite"];
  const lspDiagEdit = s["lsp.diagnosticsOnEdit"];
  if (lspEnabled !== undefined || lspFmt !== undefined || lspDiagWrite !== undefined || lspDiagEdit !== undefined) {
    lines.push("", "lsp:");
    if (lspEnabled   !== undefined) lines.push(`  enabled: ${lspEnabled}`);
    if (lspFmt       !== undefined) lines.push(`  formatOnWrite: ${lspFmt}`);
    if (lspDiagWrite !== undefined) lines.push(`  diagnosticsOnWrite: ${lspDiagWrite}`);
    if (lspDiagEdit  !== undefined) lines.push(`  diagnosticsOnEdit: ${lspDiagEdit}`);
  }

  // ida section
  const idaEnabled = s["ida.enabled"];
  const idaPython = s["ida.python"];
  const idaInstallDir = s["ida.installDir"];
  if (idaEnabled !== undefined || idaPython !== undefined || idaInstallDir !== undefined) {
    lines.push("", "ida:");
    if (idaEnabled    !== undefined) lines.push(`  enabled: ${idaEnabled}`);
    if (idaPython     !== undefined && idaPython !== "") lines.push(`  python: ${JSON.stringify(idaPython)}`);
    if (idaInstallDir !== undefined && idaInstallDir !== "") lines.push(`  installDir: ${JSON.stringify(idaInstallDir)}`);
  }

  // mcp section
  const mcpProjCfg = s["mcp.enableProjectConfig"];
  const mcpMd = s["mcp.renderMarkdownResults"];
  const mcpNotify = s["mcp.notifications"];
  if (mcpProjCfg !== undefined || mcpMd !== undefined || mcpNotify !== undefined) {
    lines.push("", "mcp:");
    if (mcpProjCfg !== undefined) lines.push(`  enableProjectConfig: ${mcpProjCfg}`);
    if (mcpMd      !== undefined) lines.push(`  renderMarkdownResults: ${mcpMd}`);
    if (mcpNotify  !== undefined) lines.push(`  notifications: ${mcpNotify}`);
  }

  // commands section
  const cmdClaudeUser = s["commands.enableClaudeUser"];
  const cmdClaudeProj = s["commands.enableClaudeProject"];
  if (cmdClaudeUser !== undefined || cmdClaudeProj !== undefined) {
    lines.push("", "commands:");
    if (cmdClaudeUser !== undefined) lines.push(`  enableClaudeUser: ${cmdClaudeUser}`);
    if (cmdClaudeProj !== undefined) lines.push(`  enableClaudeProject: ${cmdClaudeProj}`);
  }

  return lines;
}

/**
 * Write the omp overlay to `<dataDir>/omp-overlay.yml` and return the path.
 * THROWS on failure — caller must catch and emit a sidecar.fatal message (DX3).
 */
export function writeOmpOverlay(opts: OverlayOptions): string {
  const overlayPath = join(opts.dataDir, "omp-overlay.yml");
  // Will throw ENOENT / EACCES if dataDir is unwritable (DX3).
  writeFileSync(overlayPath, makeOmpOverlay(opts), "utf8");
  return overlayPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event mapping (E9 / E10 / E19 / E20)
// ─────────────────────────────────────────────────────────────────────────────

/** omp agent event type names that pass through with no field change. */
const PASSTHROUGH_EVENTS = new Set([
  "agent_start", "agent_end", "turn_start", "turn_end",
  "message_start", "message_update", "message_end",
  "tool_start", "tool_update", "tool_end",
  "compaction_start", "compaction_end",
  "error",
]);

/** omp's tool lifecycle events use "_execution_" naming; PI's AgentEvent uses
 * the shorter names already listed in PASSTHROUGH_EVENTS above. */
const TOOL_EVENT_RENAME: Record<string, string> = {
  tool_execution_start: "tool_start",
  tool_execution_update: "tool_update",
  tool_execution_end: "tool_end",
};

/** omp event types to drop silently (no PI counterpart). */
const DROP_EVENTS = new Set([
  "notice", "todo_reminder", "todo_auto_clear",
  "ttsr_triggered", "auto_retry_start", "auto_retry_end",
  "retry_fallback_start", "retry_fallback_end",
  "goal_updated", "model_changed", "thinking_level_changed",
  "ready", "negotiate_protocol",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Main bridge class
// ─────────────────────────────────────────────────────────────────────────────

interface BridgeConfig {
  dataDir: string;
  resourcesPath: string;
  networkProxy?: string;
}

/** Fcode → omp session map key. */
interface SessionBinding {
  ompSessionDir?: string;
  projectPath: string;
  inputModalities: string[];
}

/** Tool schemas registered with omp so it can call Fcode host tools (T7). */
const HOST_TOOL_SCHEMAS = [
  {
    name: "fcode_bench_execute",
    description: "Execute a whitelisted Frappe Python method on the active site via bench execute. For mutating methods only; use fcode_bench_execute_read for read-only calls.",
    parameters: {
      type: "object",
      properties: {
        method: { type: "string", description: "Dotted Python method path, e.g. frappe.client.set_value" },
        site: { type: "string", description: "Frappe site name; defaults to the active site" },
        kwargs: { type: "object", description: "Keyword arguments forwarded to the method" },
      },
      required: ["method"],
    },
  },
  {
    name: "fcode_bench_execute_read",
    description: "Execute a read-only Frappe Python method on the active site. Accepts only methods whose prefix is read-only (frappe.client.get, frappe.db.get_value, etc.).",
    parameters: {
      type: "object",
      properties: {
        method: { type: "string" },
        site: { type: "string" },
        kwargs: { type: "object" },
      },
      required: ["method"],
    },
  },
  {
    name: "fcode_bench_run",
    description: "Run an allow-listed bench command (migrate, clear-cache, build, build-studio-app, list-apps, install-app) on the active bench.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", enum: ["migrate", "clear-cache", "build", "build-studio-app", "list-apps", "install-app"] },
        site: { type: "string" },
        args: { type: "array", items: { type: "string" } },
      },
      required: ["command"],
    },
  },
  {
    name: "fcode_canvas",
    description: "Drive the Build-tab WebContentsView canvas (navigate, click, fill, evaluate). Requires user approval.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["navigate", "reload", "click", "fill", "evaluate"] },
        url: { type: "string" },
        uid: { type: "string" },
        text: { type: "string" },
        expression: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "fcode_canvas_read",
    description: "Read-only canvas inspection: snapshot AX tree, read console, take screenshot. Auto-approved.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["snapshot", "console", "screenshot"] },
        limit: { type: "number" },
      },
      required: ["action"],
    },
  },
] as const;

export class OmpBridge {
  private config: BridgeConfig | null = null;
  private ompProcess: ChildProcess | null = null;
  private ompPending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  /** Pending host.proxy calls the bridge made to the PI host (keyed by request id). */
  private hostPending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private sessions = new Map<string, SessionBinding>();
  private sessionStore: SessionStore | null = null;
  private state = createBridgeState(homedir());
  /** Map of omp request id → PI pending request info */
  private pendingUiRequests = new Map<string, { sessionId: string; toolCallId: string; toolName: string }>();
  /** Per-session most-recent open tool_execution_start */
  private openTools = new Map<string, { toolCallId: string; toolName: string }>();
  /** Tracks in-flight `prompt` calls awaiting their terminal prompt_result frame. */
  private promptResultPending = new Map<string, { sessionId: string; turnId: string }>();
  /** Handshake timer — cleared when omp emits "ready" (E9 / failure-handling). */
  private readyTimer: NodeJS.Timeout | null = null;
  /** Optional trace writer set by main() when FCODE_BRIDGE_TRACE=1. */
  private tracer: ((dir: string, line: string) => void) | null = null;
  /** Whether set_subagent_subscription{progress} has been sent for this omp process (§9). */
  private subagentSubscribed = false;

  /** Enable raw-frame tracing to a file (FCODE_BRIDGE_TRACE=1). */
  setTracer(fn: (dir: string, line: string) => void): void {
    this.tracer = fn;
  }
  /** Write a JSON-RPC response to the PI host on stdout. */
  private respond(id: string, result: unknown): void {
    const line = capNdjsonLine(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
    process.stdout.write(line);
  }

  /** Write a JSON-RPC error to the PI host on stdout. */
  private respondError(id: string, message: string, code = -32000): void {
    process.stdout.write(
      JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n",
    );
  }

  /** Emit a notification to the PI host (no id). */
  private notify(method: string, params: unknown): void {
    const line = capNdjsonLine(JSON.stringify({ jsonrpc: "2.0", method, params }));
    process.stdout.write(line + "\n");
  }

  /** Write a raw frame to omp's stdin; fire-and-forget, no response awaited
   * (omp never sends a `response` frame back for e.g. extension_ui_response). */
  private sendToOmp(frame: Record<string, unknown>): void {
    const line = JSON.stringify(frame) + "\n";
    this.tracer?.("out-omp", line.trimEnd());
    this.ompProcess?.stdin?.write(line);
  }

  /**
   * Send a command to omp and wait for its response. An explicit `id` lets the
   * caller correlate a later out-of-band frame (e.g. prompt_result) to this
   * same request; omp otherwise gets a fresh random one.
   */
  private ompCall(params: Record<string, unknown>, id: string = randomUUID()): Promise<unknown> {
    const { promise, resolve, reject } = Promise.withResolvers<unknown>();
    this.ompPending.set(id, { resolve, reject });
    this.sendToOmp({ ...params, id });
    return promise;
  }

  /**
   * Send a host.proxy call to the PI host via process.stdout and await the
   * response that arrives on process.stdin (T7: fcode_ tool dispatch).
   */
  private hostCall(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = randomUUID();
    const { promise, resolve, reject } = Promise.withResolvers<unknown>();
    this.hostPending.set(id, { resolve, reject });
    const frame = JSON.stringify({ jsonrpc: "2.0", method: "host.proxy", params: { method, params }, id }) + "\n";
    this.tracer?.("out-host", frame.trimEnd());
    process.stdout.write(frame);
    return promise;
  }

  /** Emit a system message as an agent.event notification. */
  private emitSystemMessage(sessionId: string, text: string): void {
    this.notify("agent.event", {
      sessionId,
      ts: Date.now(),
      event: {
        type: "message_start",
        message: {
          id: randomUUID(),
          role: "assistant",
          content: text,
          status: "complete",
          createdAt: new Date().toISOString(),
          isSystem: true,
        },
      },
    });
  }

  /** Handle an incoming NDJSON frame from the PI host. */
  async handleHostFrame(frame: unknown): Promise<void> {
    if (!frame || typeof frame !== "object") return;
    const msg = frame as Record<string, unknown>;
    const { id, method, params } = msg as {
      id?: string;
      method?: string;
      params?: Record<string, unknown>;
    };

    // Response to a host.proxy call the bridge made (T7: fcode_ tool dispatch).
    if (id !== undefined && !method) {
      const pend = this.hostPending.get(String(id));
      if (pend) {
        this.hostPending.delete(String(id));
        if (msg && typeof msg === "object" && "error" in msg && msg.error) {
          const errObj = msg.error;
          const errMsg = errObj && typeof errObj === "object" && "message" in errObj
            ? String(errObj.message)
            : String(errObj);
          pend.reject(new Error(errMsg));
        } else {
          const result = msg && typeof msg === "object" && "result" in msg ? msg.result : undefined;
          pend.resolve(result);
        }
      }
      return;
    }

    if (!method || id === undefined) return;
    const p = (params ?? {}) as Record<string, unknown>;

    switch (method) {
      case "sidecar.configure":
        this.config = {
          dataDir: String(p.dataDir ?? homedir()),
          resourcesPath: String(p.resourcesPath ?? ""),
          networkProxy: p.networkProxy ? String(p.networkProxy) : undefined,
        };
        this.sessionStore = new SessionStore(this.config.dataDir);
        this.respond(id, { ok: true });
        break;

      case "sidecar.health":
        this.respond(id, { ok: true });
        break;

      case "agent.prompt": {
        const sessionId = String(p.sessionId ?? "");
        const turnId = String(p.turnId ?? "");
        const content = String(p.content ?? "");
        const projectPath = String(p.projectPath ?? this.state.cwd);

        try {
          const result = await this.ompPrompt({ sessionId, turnId, content, projectPath, params: p });
          this.respond(id, result);
        } catch (e) {
          this.respondError(id, String(e));
        }
        break;
      }

      case "agent.steeringContext": {
        const sessionId = String(p.sessionId ?? "");
        const binding = this.sessions.get(sessionId);
        const supportsVision = (binding?.inputModalities ?? []).includes("image");
        this.respond(id, {
          supportsVision,
          projectPath: binding?.projectPath ?? this.state.cwd,
        });
        break;
      }

      case "agent.steer": {
        try {
          await this.ompCall({ type: "steer", sessionId: p.sessionId, message: p.content });
          this.respond(id, { accepted: true });
        } catch (e) {
          this.respond(id, { accepted: false });
        }
        break;
      }

      case "agent.stop": {
        try {
          const result = await this.ompCall({ type: "abort", sessionId: p.sessionId }) as { requested?: boolean };
          this.respond(id, { requested: result?.requested ?? true });
        } catch {
          this.respond(id, { requested: false });
        }
        break;
      }

      case "agent.abort":
        this.ompCall({ type: "abort", sessionId: p.sessionId }).catch(() => undefined);
        this.respond(id, {});
        break;

      case "agent.compact": {
        try {
          const result = await this.ompCall({ type: "compact", sessionId: p.sessionId }) as { accepted?: boolean };
          this.respond(id, { accepted: result?.accepted !== false });
        } catch {
          this.respond(id, { accepted: false });
        }
        break;
      }

      case "agent.getStatus": {
        try {
          const result = await this.ompCall({ type: "get_state", sessionId: p.sessionId }) as Record<string, unknown>;
          this.respond(id, {
            status: {
              sessionId: p.sessionId,
              isRunning: Boolean(result?.isRunning),
              pendingToolConfirmations: result?.pendingToolConfirmations ?? [],
            },
          });
        } catch {
          this.respond(id, { status: { sessionId: p.sessionId, isRunning: false, pendingToolConfirmations: [] } });
        }
        break;
      }

      case "agent.disposeSession": {
        const sessionId = String(p.sessionId ?? "");
        // Cancel pending UI requests for this session; tell omp so its tool turn doesn't hang (E9).
        for (const [reqId, req] of this.pendingUiRequests) {
          if (req.sessionId === sessionId) {
            this.sendToOmp({ type: "extension_ui_response", id: reqId, cancelled: true });
            this.pendingUiRequests.delete(reqId);
          }
        }
        this.openTools.delete(sessionId);
        this.sessions.delete(sessionId);
        this.respond(id, {});
        break;
      }

      case "asktool.resolve": {
        const requestId = String(p.requestId ?? "");
        const answers = (p.answers ?? []) as Array<string[] | null>;
        const value = serializeAskAnswers(answers);
        this.sendToOmp({
          type: "extension_ui_response",
          id: requestId,
          ...(value !== null ? { value } : { cancelled: true }),
        });
        this.pendingUiRequests.delete(requestId);
        this.respond(id, {});
        break;
      }

      case "tool_permission.resolve": {
        const requestId = String(p.requestId ?? "");
        const decision = String(p.decision ?? "");
        this.sendToOmp({
          type: "extension_ui_response",
          id: requestId,
          confirmed: decision !== "deny",
        });
        this.pendingUiRequests.delete(requestId);
        this.respond(id, {});
        break;
      }

      case "agent.executeApprovedPlan":
        // Plan checkpoints do not exist in this fork (plan step 9).
        this.respond(id, { accepted: false });
        break;

      // native.session.* — not bridged in v1.
      case "native.session.list":
      case "native.session.search":
      case "native.session.get":
      case "native.session.fork":
        this.respond(id, { sessions: [], error: "native bridging unsupported" });
        break;

      // omp sidecar methods (DX14 / step 9 channel table).
      case "omp.models.list":
        this.ompCallAndForward(id, { type: "get_available_models" });
        break;
      case "omp.models.set":
        this.ompCallAndForward(id, { type: "set_model", ...p });
        break;
      case "omp.thinking.levels":
        this.ompCallAndForward(id, { type: "get_available_thinking_levels" });
        break;
      case "omp.thinking.set":
        this.ompCallAndForward(id, { type: "set_thinking_level", ...p });
        break;
      case "omp.commands.list":
        this.ompCallAndForward(id, { type: "get_available_commands" });
        break;
      case "omp.memory.status":
        this.ompCallAndForward(id, { type: "get_memory_status" });
        break;
      case "omp.state":
        this.ompCallAndForward(id, { type: "get_state", ...p });
        break;
      case "omp.login.providers":
        this.ompCallAndForward(id, { type: "get_login_providers" });
        break;
      case "omp.login.start":
        this.ompCallAndForward(id, { type: "login", ...p });
        break;
      case "omp.session.branch":
        this.ompCallAndForward(id, { type: "branch", ...p });
        break;
      case "omp.session.rename":
        this.ompCallAndForward(id, { type: "set_session_name", ...p });
        break;
      case "omp.auto-compaction.set":
        this.ompCallAndForward(id, { type: "set_auto_compaction", ...p });
        break;

      case "omp.session.stats":
        this.ompCallAndForward(id, { type: "get_session_stats" });
        break;

      case "omp.subagents.list":
        this.ompCallAndForward(id, { type: "get_subagents" });
        break;

      case "omp.subagents.messages":
        this.ompCallAndForward(id, { type: "get_subagent_messages", ...p });
        break;

      default:
        this.respondError(id, `Unknown method: ${method}`, -32601);
    }
  }

  private ompCallAndForward(hostId: string, params: Record<string, unknown>): void {
    this.ompCall(params)
      .then((result) => this.respond(hostId, result))
      .catch((e) => this.respondError(hostId, String(e)));
  }

  private async ompPrompt(opts: {
    sessionId: string;
    turnId: string;
    content: string;
    projectPath: string;
    params: Record<string, unknown>;
  }): Promise<{ accepted: boolean; turnId: string }> {
    const { sessionId, turnId, content, projectPath } = opts;

    const existing = this.sessions.get(sessionId);
    const store = this.sessionStore;

    let sessionType: "new_session" | "open_session" = "new_session";
    let sessionDir: string | undefined;

    if (existing?.ompSessionDir) {
      sessionDir = existing.ompSessionDir;
      sessionType = "open_session";
    } else if (store) {
      const stored = store.get(sessionId);
      if (stored) {
        sessionDir = stored.sessionDir;
        sessionType = "open_session";
      }
    }

    // omp has no per-session cwd/project field on new_session or open_session:
    // cwd is fixed once at process spawn for the bridge's whole lifetime
    // (start(), below). A single shared ompProcess also means open_session's
    // "most recent session in this directory" resume can race if two
    // Fcode sessions ever share a project.
    // ponytail: single-cwd-per-process ceiling; upgrade path is one omp child
    // per session (tracked as a follow-up to this fix).
    const sessionCmd: Record<string, unknown> = sessionType === "open_session" && sessionDir
      ? { type: "open_session", sessionDir }
      : { type: "new_session" };

    // Try to open existing session; fall back to new if omp GC'd it (E14).
    if (sessionType === "open_session") {
      try {
        await this.ompCall(sessionCmd);
      } catch {
        // GC'd: fall back to new session and rewrite the store (E14).
        sessionType = "new_session";
        sessionDir = undefined;
        if (store) store.delete(sessionId);
        await this.ompCall({ type: "new_session" });
      }
    } else {
      await this.ompCall(sessionCmd);
    }

    // new_session/open_session responses carry no session identifier; learn it
    // from get_state so the *next* prompt for this sessionId can resume this
    // same omp session instead of starting over (E14, E19).
    if (sessionType === "new_session") {
      const state = (await this.ompCall({ type: "get_state" })) as { sessionFile?: string };
      if (state?.sessionFile) sessionDir = dirname(state.sessionFile);
    }

    this.sessions.set(sessionId, {
      ompSessionDir: sessionDir,
      projectPath,
      inputModalities: existing?.inputModalities ?? [],
    });
    if (store && sessionDir) {
      store.set(sessionId, {
        sessionDir,
        projectPath,
        inputModalities: existing?.inputModalities ?? [],
      });
    }

    // Subscribe to subagent progress once per omp process; idempotent, harmless to retry (§9).
    if (!this.subagentSubscribed) {
      this.subagentSubscribed = true;
      await this.ompCall({ type: "set_subagent_subscription", level: "progress" }).catch(() => undefined);
    }

    // Send the actual prompt. Its immediate response is only an ack
    // ({agentInvoked}); the real outcome arrives later as a separate
    // prompt_result frame correlated on the same id (see handleOmpFrame).
    const promptId = randomUUID();
    this.promptResultPending.set(promptId, { sessionId, turnId });
    const ack = (await this.ompCall({ type: "prompt", message: content, turnId }, promptId)) as {
      agentInvoked?: boolean;
    };
    if (ack?.agentInvoked === false) {
      // Completed locally (e.g. a slash command); no prompt_result is coming.
      this.promptResultPending.delete(promptId);
    }

    return { accepted: true, turnId };
  }

  /** Handle an NDJSON frame from omp's stdout. */
  handleOmpFrame(line: string): void {
    this.tracer?.("in-omp", line);
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }

    // rpc_chunk reassembly (E10).
    if (frame.type === "rpc_chunk") {
      try {
        const reassembled = reassembleChunk(this.state.chunks, frame as unknown as Parameters<typeof reassembleChunk>[1]);
        if (reassembled) this.handleOmpFrame(reassembled);
      } catch (e) {
        // FrameTooLargeError → reject in-flight ompCalls then settle all active sessions (E10).
        const errMsg = `Frame reassembly failed: ${String(e)}`;
        for (const [, { reject }] of this.ompPending) reject(new Error(errMsg));
        this.ompPending.clear();
        for (const [sid] of this.sessions) this.emitSystemMessage(sid, `[fcode] ${errMsg}`);
      }
      return;
    }

    // RPC response to a bridge call (real shape: {id, type:"response", ...}).
    if (frame.type === "response" && frame.id !== undefined) {
      const pending = this.ompPending.get(String(frame.id));
      if (pending) {
        this.ompPending.delete(String(frame.id));
        if (frame.success === false) pending.reject(new Error(String(frame.error ?? "omp call failed")));
        else pending.resolve(frame.data);
      }
      return;
    }

    // Terminal outcome of a prompt (E5/E19): the "response" above only acks
    // that omp accepted it; this frame, correlated on the same id, reports how
    // the turn actually ended. omp's own agent_end/message_end events
    // (passthrough below) already cover the success case, so this only needs
    // to surface what nothing else does: aborts and errors.
    if (frame.type === "prompt_result") {
      const promptId = String(frame.id ?? "");
      const pending = this.promptResultPending.get(promptId);
      this.promptResultPending.delete(promptId);
      if (pending) {
        const status = String(frame.status ?? "");
        if (status === "error" || status === "aborted") {
          const promptError = frame.error as { message?: string; retryable?: boolean } | undefined;
          this.notify("agent.event", {
            sessionId: pending.sessionId,
            turnId: pending.turnId,
            ts: Date.now(),
            event: {
              type: "error",
              error: {
                code: status === "aborted" ? ErrorCodes.TURN_ABORTED : ErrorCodes.PROVIDER_ERROR,
                message: promptError?.message ?? "omp prompt failed",
                retriable: promptError?.retryable,
              },
            },
          });
        }
      }
      return;
    }

    // Protocol handshake (DX10).
    if (frame.type === "ready") {
      // Clear the handshake timer — omp is alive (failure-handling).
      if (this.readyTimer) { clearTimeout(this.readyTimer); this.readyTimer = null; }
      const versions = (frame.supportedProtocolVersions as number[] | undefined) ?? [];
      if (versions.includes(2)) {
        this.ompCall({ type: "negotiate_protocol", protocolVersion: 2 })
          .then((result) => {
            const negotiated = (result as Record<string, unknown>)?.protocolVersion;
            if (negotiated !== 2) {
              // DX10: v1 fallback — emit warning and mark read-only.
              this.state.protocolVersion = 1;
              this.state.readOnly = true;
              process.stderr.write(`[omp-bridge] handshake: protocol=v1 (negotiate returned ${String(negotiated)})\n`);
              this.notify("sidecar.notification", {
                type: "system",
                code: "PROTOCOL_DOWNGRADE",
                message: "omp negotiated protocol v1; large tool results may be silently truncated. Sessions are read-only until omp is upgraded.",
              });
            } else {
              this.state.protocolVersion = 2;
              process.stderr.write(`[omp-bridge] handshake: protocol=v2\n`);
              // T7: Announce Fcode host tools so omp can call them via host_tool_call.
              this.registerHostTools()
                .then((names) => {
                  process.stderr.write(`[omp-bridge] handshake: registered host tools: ${names.join(", ")}\n`);
                })
                .catch((e: unknown) => {
                  const msg = String((e as Error)?.message ?? e);
                  process.stderr.write(`[omp-bridge] handshake: host tool registration failed: ${msg}\n`);
                  this.notify("sidecar.notification", {
                    type: "system",
                    code: "HOST_TOOL_REGISTRATION_FAILED",
                    message: `Fcode host tools failed to register with omp: ${msg}. Host tools will not be available this session.`,
                  });
                });
            }
          })
          .catch((e: unknown) => {
            this.state.protocolVersion = 1;
            this.state.readOnly = true;
            process.stderr.write(`[omp-bridge] handshake: protocol=v1 (negotiate_protocol failed: ${String((e as Error)?.message ?? e)})\n`);
          });
      } else {
        // DX10: omp doesn't offer v2.
        this.state.protocolVersion = 1;
        this.state.readOnly = true;
        process.stderr.write(`[omp-bridge] handshake: protocol=v1 (omp offers ${versions.join(",") || "none"})\n`);
      }
      return;
    }


    // T7: omp calls a registered Fcode host tool.
    if (frame.type === "host_tool_call") {
      const toolCallId = String(frame.toolCallId ?? frame.id ?? "");
      const toolName = String(frame.toolName ?? "");
      const args = (frame.args ?? {}) as Record<string, unknown>;
      // Use the first active session's ID, or fall back to empty string.
      const sessionId = frame.sessionId != null
        ? String(frame.sessionId)
        : (this.sessions.keys().next().value ?? "");
      this.hostCall(toolName, { sessionId, toolCallId, args })
        .then((result) => {
          const resp = JSON.stringify({ type: "host_tool_result", toolCallId, result }) + "\n";
          this.tracer?.("out-omp", resp.trimEnd());
          this.ompProcess?.stdin?.write(resp);
        })
        .catch((e: unknown) => {
          const resp = JSON.stringify({
            type: "host_tool_result",
            toolCallId,
            result: { ok: false, isError: true, content: String((e as Error)?.message ?? e) },
          }) + "\n";
          this.tracer?.("out-omp", resp.trimEnd());
          this.ompProcess?.stdin?.write(resp);
        });
      return;
    }

    // extension_ui_request (E9).
    if (frame.type === "extension_ui_request") {
      this.handleUiRequest(frame as unknown as OmpExtensionUiRequest);
      return;
    }

    // irc_message: forward as a quiet system transcript line if content is plain text.
    if (frame.type === "irc_message") {
      const sessionId = this.sessions.keys().next().value ?? "";
      const msg = frame.message as Record<string, unknown> | undefined;
      const content = msg?.content;
      if (typeof content === "string" && content.trim()) {
        this.emitSystemMessage(sessionId, content.trim());
      }
      return;
    }

    // Subagent full-event stream (subagent_event): relay inner event tagged with subagentId.
    if (frame.type === "subagent_event") {
      const payload = (frame.payload ?? {}) as Record<string, unknown>;
      const subagentId = String(payload.id ?? "");
      const sessionId = this.sessions.keys().next().value ?? "";
      this.notify("agent.event", {
        sessionId,
        ts: Date.now(),
        subagentId,
        event: payload.event,
      });
      return;
    }

    // Subagent lifecycle/progress frames → agent.event rows (§9).
    if (frame.type === "subagent_lifecycle" || frame.type === "subagent_progress") {
      this.handleSubagentFrame(frame);
      return;
    }

    // Agent events: map omp events to Fcode agent.event notifications.
    const rawType = String(frame.type ?? "");
    if (DROP_EVENTS.has(rawType)) return;
    const eventType = TOOL_EVENT_RENAME[rawType] ?? rawType;
    if (eventType !== rawType) frame.type = eventType;

    // Same type name, different fields: omp's agent_end/turn_end carry the
    // full message payload, but PI's AgentEvent expects a slimmer summary.
    if (eventType === "agent_end") {
      const messages = Array.isArray(frame.messages) ? frame.messages : [];
      frame.messageIds = messages.map((m: any) => String(m?.id ?? ""));
      delete frame.messages;
      delete frame.telemetry;
      delete frame.coverage;
    } else if (eventType === "turn_end") {
      delete frame.message;
      delete frame.toolResults;
    }

    if (PASSTHROUGH_EVENTS.has(eventType)) {
      // Track open tool calls (for synthesizing toolCallId when ui_request arrives).
      if (eventType === "tool_start") {
        const sessionId = String(frame.sessionId ?? "");
        this.openTools.set(sessionId, {
          toolCallId: String(frame.toolCallId ?? frame.id ?? ""),
          toolName: String(frame.toolName ?? ""),
        });
      }
      if (eventType === "tool_end") {
        const sessionId = String(frame.sessionId ?? "");
        this.openTools.delete(sessionId);
      }

      this.notify("agent.event", {
        sessionId: frame.sessionId,
        turnId: frame.turnId,
        ts: Date.now(),
        event: frame,
      });
    }
  }

  private handleUiRequest(req: OmpExtensionUiRequest): void {
    const sessionId = String(req.sessionId ?? "unknown");
    const openTool = this.openTools.get(sessionId);

    const mapped = mapExtensionUiRequest(req, sessionId, openTool);
    if (!mapped) {
      // cancel → remove from pending map.
      if (req.method === "cancel") {
        this.pendingUiRequests.delete(req.id);
        // Also send a response to omp so it doesn't block.
        this.sendToOmp({ type: "extension_ui_response", id: req.id, cancelled: true });
      }
      return;
    }

    if (mapped.type === "system_message") {
      this.emitSystemMessage(sessionId, mapped.text);
      return;
    }

    if (mapped.type === "open_url") {
      this.notify("sidecar.notification", { type: "open_url", url: mapped.url, sessionId });
      this.emitSystemMessage(sessionId, mapped.text);
      return;
    }

    // setStatus / setWidget / setTitle / set_editor_text — fire-and-forget UI state updates.
    if (
      mapped.type === "ext_status" ||
      mapped.type === "ext_widget" ||
      mapped.type === "ext_title" ||
      mapped.type === "set_editor_text"
    ) {
      this.notify("sidecar.ext_ui", mapped);
      return;
    }

    // tool_permission_request and asktool_request — track and forward, nested
    // as PI's AgentEvent expects ({type, request}), not the mapper's flat shape.
    this.pendingUiRequests.set(req.id, {
      sessionId,
      toolCallId: openTool?.toolCallId ?? req.id,
      toolName: openTool?.toolName ?? req.title ?? "tool",
    });

    const { type, ...request } = mapped;
    this.notify("agent.event", {
      sessionId,
      ts: Date.now(),
      event: { type, request },
    });
  }

  /** Register Fcode host tools with omp so it can invoke them via host_tool_call (T7). */
  private async registerHostTools(): Promise<string[]> {
    const result = await this.ompCall({ type: "set_host_tools", tools: HOST_TOOL_SCHEMAS });
    const data = result as Record<string, unknown> | undefined;
    return (data?.toolNames as string[] | undefined) ?? HOST_TOOL_SCHEMAS.map((t) => t.name);
  }

  /**
   * Map omp subagent frames to agent.event notifications (§9).
   *
   * Uses the first active session (single-omp-process architecture; see ompPrompt ponytail note).
   * `parentToolCallId` and `agentName` go in the envelope so the renderer's events-slice
   * picks them up as UiMessage fields (ADR 0062).
   */
  private handleSubagentFrame(frame: Record<string, unknown>): void {
    const sessionId = this.sessions.keys().next().value ?? "";

    if (frame.type === "subagent_lifecycle") {
      const payload = (frame.payload ?? {}) as Record<string, unknown>;
      const toolCallId = String(payload.id ?? "");
      const agentName = String(payload.agent ?? "");
      const parentToolCallId = payload.parentToolCallId != null
        ? String(payload.parentToolCallId)
        : undefined;
      const status = String(payload.status ?? "");

      if (status === "started") {
        this.notify("agent.event", {
          sessionId,
          ts: Date.now(),
          ...(parentToolCallId ? { parentToolCallId } : {}),
          agentName,
          event: {
            type: "tool_start",
            toolCallId,
            toolName: "task",
            args: { task: payload.task ?? payload.description },
          },
        });
      } else {
        // completed, failed, aborted
        this.notify("agent.event", {
          sessionId,
          ts: Date.now(),
          ...(parentToolCallId ? { parentToolCallId } : {}),
          agentName,
          event: {
            type: "tool_end",
            toolCallId,
            result: { status, description: payload.description },
            isError: status === "failed",
          },
        });
      }
      return;
    }

    if (frame.type === "subagent_progress") {
      const payload = (frame.payload ?? {}) as Record<string, unknown>;
      const progress = (payload.progress ?? {}) as Record<string, unknown>;
      const toolCallId = String(progress.id ?? "");
      const agentName = String(payload.agent ?? "");
      const parentToolCallId = payload.parentToolCallId != null
        ? String(payload.parentToolCallId)
        : undefined;

      this.notify("agent.event", {
        sessionId,
        ts: Date.now(),
        ...(parentToolCallId ? { parentToolCallId } : {}),
        agentName,
        event: {
          type: "tool_update",
          toolCallId,
          partialResult: String(payload.task ?? ""),
        },
      });
    }
  }

  /**
   * Start the bridge: write the overlay, spawn omp, wire stdio.
   * Throws (DX3) if the overlay cannot be written.
   */
  async start(opts: {
    dataDir: string;
    resourcesPath: string;
    ompBinary: string;
    overlayPath: string;
    modelsConfigPath?: string;
    approvalMode?: "always-ask" | "write" | "yolo";
    cwd: string;
    env: NodeJS.ProcessEnv;
  }): Promise<void> {
    process.stderr.write(`[omp-bridge] starting: binary=${opts.ompBinary}\n`);
    this.state.cwd = opts.cwd;
    this.sessionStore = new SessionStore(opts.dataDir);

    const ompArgs = ["--mode", "rpc", "--approval-mode", opts.approvalMode ?? "always-ask", "--config", opts.overlayPath];
    if (opts.modelsConfigPath) ompArgs.push("--models-config", opts.modelsConfigPath);

    const child = spawn(
      opts.ompBinary,
      ompArgs,
      {
        cwd: opts.cwd,
        env: opts.env,
        stdio: ["pipe", "pipe", "inherit"],
        shell: false,
      },
    );

    this.ompProcess = child;

    // Handshake timeout — reject pending calls and emit sidecar.fatal if omp never says "ready".
    this.readyTimer = setTimeout(() => {
      this.readyTimer = null;
      this.notify("sidecar.fatal", {
        code: "HANDSHAKE_TIMEOUT",
        paths: ompBinaryCandidates(opts.resourcesPath),
        detail: "omp process did not emit 'ready' within 30 s",
      });
      for (const [, { reject }] of this.ompPending) reject(new Error("handshake timeout"));
      this.ompPending.clear();
    }, 30_000);
    this.readyTimer.unref();

    child.on("error", (err) => {
      // SpawnENOENT — emit sidecar.fatal so the UI shows the blocked panel (T7).
      if (this.readyTimer) { clearTimeout(this.readyTimer); this.readyTimer = null; }
      this.notify("sidecar.fatal", {
        code: "ENOENT",
        paths: ompBinaryCandidates(opts.resourcesPath),
        detail: String(err),
      });
    });

    // Wire omp stdout → bridge frame handler (incoming trace applied inside handleOmpFrame).
    readNdjsonLines(child.stdout!, (line) => {
      this.handleOmpFrame(line);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point (when run as a standalone process)
// ─────────────────────────────────────────────────────────────────────────────

/** Safe parse of `FCODE_OMP_SETTINGS` JSON; returns empty on any failure. */
function parseOmpSettings(raw: string | undefined): OmpSettingsValues {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as OmpSettingsValues;
    }
  } catch {
    // non-fatal
  }
  return {};
}

/** Main entry point for the sidecar process. */
async function main(): Promise<void> {
  const bridge = new OmpBridge();
  const resourcesPath = process.env.FCODE_RESOURCES_PATH ?? process.env.RESOURCES_PATH ?? "";
  const dataDir = process.env.FCODE_DATA_DIR ?? join(homedir(), ".fcode-dev");
  const ompBinary = resolveOmpBinary({ resourcesPath, env: process.env as Record<string, string | undefined> });

  let overlayPath: string;
  try {
    const screenshotsDir = join(dataDir, "screenshots");
    mkdirSync(screenshotsDir, { recursive: true });
    const backend = process.env.FCODE_MEMORY_BACKEND;
    const rawMode = process.env.FCODE_TOOL_APPROVAL_MODE;
    const approvalMode: "always-ask" | "write" | "yolo" =
      rawMode === "write" || rawMode === "yolo" ? rawMode : "always-ask";
    overlayPath = writeOmpOverlay({
      dataDir,
      resourcesPath,
      screenshotsDir,
      approvalMode,
      ompSettings: parseOmpSettings(process.env.FCODE_OMP_SETTINGS),
      memory:
        backend === "mnemopi" || backend === "hindsight" || backend === "off"
          ? {
              backend,
              hindsightUrl: process.env.FCODE_HINDSIGHT_URL,
              hindsightBank: process.env.FCODE_HINDSIGHT_BANK,
            }
          : undefined,
    });
  } catch (e) {
    // DX3: overlay write failure is fatal — settle with a system message.
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "sidecar.fatal",
        params: {
          code: "OVERLAY_WRITE_FAILED",
          paths: [join(dataDir, "omp-overlay.yml")],
          detail: String(e),
        },
      }) + "\n",
    );
    process.exit(1);
  }

  const traceEnabled = process.env.FCODE_BRIDGE_TRACE === "1";
  let hostTracer: ((dir: string, line: string) => void) | null = null;
  if (traceEnabled) {
    const traceFile = join(dataDir, "bridge-trace.ndjson");
    const { appendFileSync } = await import("node:fs");
    const traceFrame = (dir: string, line: string) => appendFileSync(traceFile, `${dir}: ${line}\n`);
    // Trace outgoing frames to PI host (stdout).
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => {
      traceFrame("out-host", data.trimEnd());
      return origWrite(data);
    }) as typeof process.stdout.write;
    // Trace omp↔bridge frames (in-omp, out-omp).
    bridge.setTracer(traceFrame);
    hostTracer = traceFrame;
  }

  // Wire stdin → bridge frame handler.
  readNdjsonLines(process.stdin, async (line) => {
    hostTracer?.("in-host", line);
    let frame: unknown;
    try {
      frame = JSON.parse(line);
    } catch {
      return;
    }
    await bridge.handleHostFrame(frame);
  });

  const cwd = process.env.FCODE_BENCH_PATH ?? homedir();
  await bridge.start({
    dataDir,
    resourcesPath,
    ompBinary,
    overlayPath,
    modelsConfigPath: process.env.FCODE_MODELS_CONFIG,
    approvalMode,
    cwd,
    env: {
      ...process.env,
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH }
        : {}),
    },
  });
}

// Only run main() when executed directly, not when imported by tests.
if (process.argv[1] && resolve(process.argv[1]).endsWith("bridge.ts") ||
    process.argv[1] && resolve(process.argv[1]).endsWith("bridge.js")) {
  main().catch((e) => {
    console.error("[omp-bridge] fatal:", e);
    process.exit(1);
  });
}
