/**
 * omp-bridge — sidecar process that replaces pi-agent-core as the AI brain.
 *
 * This file is the entry point run by Electron with ELECTRON_RUN_AS_NODE=1.
 * It speaks PI-Desktop's sidecar NDJSON JSON-RPC on stdin/stdout and drives
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
 *         setStatus/setWidget/setTitle explicitly ignored).
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
import { join, resolve } from "node:path";
import { readNdjsonLines } from "@pi-desktop/shared";
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

  // ponytail: YAML by hand — avoids a yaml dep for a ~20-line config file.
  return [
    "# omp overlay for Fcode — generated on each launch, do not edit.",
    "# DX3: approval_mode always-ask so no writes are auto-approved.",
    "tools:",
    "  approval_mode: always-ask",
    "  approval:",
    "    # DX7: auto-approve read-only fcode_bench_execute calls.",
    "    fcode_bench_execute_read: allow",
    "",
    "skills:",
    `  customDirectories:`,
    `    - "${skillsDir}"`,
    "  enableClaudeUser: true",
    "",
    "browser:",
    "  enabled: true",
    "  headless: true",
    `  screenshotDir: "${screenshotsDir}"`,
    "  relay: false",
  ].join("\n");
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

/** omp event types to drop silently (no PI counterpart). */
const DROP_EVENTS = new Set([
  "notice", "irc_message", "todo_reminder", "todo_auto_clear",
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

/** PI-Desktop → omp session map key. */
interface SessionBinding {
  ompSessionDir?: string;
  projectPath: string;
  inputModalities: string[];
}

export class OmpBridge {
  private config: BridgeConfig | null = null;
  private ompProcess: ChildProcess | null = null;
  private ompPending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private sessions = new Map<string, SessionBinding>();
  private sessionStore: SessionStore | null = null;
  private state = createBridgeState(homedir());
  /** Map of omp request id → PI pending request info */
  private pendingUiRequests = new Map<string, { sessionId: string; toolCallId: string; toolName: string }>();
  /** Per-session most-recent open tool_execution_start */
  private openTools = new Map<string, { toolCallId: string; toolName: string }>();
  /** Handshake timer — cleared when omp emits "ready" (E9 / failure-handling). */
  private readyTimer: NodeJS.Timeout | null = null;
  /** Optional trace writer set by main() when FCODE_BRIDGE_TRACE=1. */
  private tracer: ((dir: string, line: string) => void) | null = null;

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

  /** Send a command to omp and wait for the response. */
  private ompCall(params: Record<string, unknown>): Promise<unknown> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      this.ompPending.set(id, { resolve, reject });
      const frame = JSON.stringify({ ...params, id }) + "\n";
      this.tracer?.("out-omp", frame.trimEnd());
      this.ompProcess?.stdin?.write(frame);
    });
  }

  /** Emit a system message as an agent.event notification. */
  private emitSystemMessage(sessionId: string, text: string): void {
    this.notify("agent.event", {
      sessionId,
      ts: new Date().toISOString(),
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

    // Response to a call we made (host.proxy result — not used by bridge yet).
    if (id !== undefined && !method) return;

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
            this.ompCall({ type: "extension_ui_response", requestId: reqId, cancelled: true }).catch(() => undefined);
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
        try {
          await this.ompCall({
            type: "extension_ui_response",
            requestId,
            ...(value !== null ? { value } : { cancelled: true }),
          });
          this.pendingUiRequests.delete(requestId);
          this.respond(id, {});
        } catch (e) {
          this.respondError(id, String(e));
        }
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

    const sessionCmd: Record<string, unknown> = sessionType === "open_session" && sessionDir
      ? { type: "open_session", sessionDir }
      : { type: "new_session", cwd: this.state.cwd };

    // Try to open existing session; fall back to new if omp GC'd it (E14).
    if (sessionType === "open_session") {
      try {
        await this.ompCall(sessionCmd);
      } catch {
        // GC'd: fall back to new session and rewrite the store (E14).
        sessionType = "new_session";
        sessionDir = undefined;
        if (store) store.delete(sessionId);
        await this.ompCall({ type: "new_session", cwd: projectPath });
      }
    } else {
      await this.ompCall(sessionCmd);
    }

    // Persist the session mapping.
    this.sessions.set(sessionId, {
      ompSessionDir: sessionDir,
      projectPath,
      inputModalities: existing?.inputModalities ?? [],
    });

    // Now send the actual prompt.
    const promptResult = await this.ompCall({
      type: "prompt",
      message: content,
      turnId,
    }) as { accepted?: boolean; sessionDir?: string };

    // Update the session store with the session directory omp assigned (E14, E19).
    if (promptResult?.sessionDir) {
      const entry = {
        sessionDir: promptResult.sessionDir,
        projectPath,
        inputModalities: existing?.inputModalities ?? [],
      };
      this.sessions.set(sessionId, { ...entry, ompSessionDir: promptResult.sessionDir });
      if (store) store.set(sessionId, entry);
    }

    return { accepted: promptResult?.accepted !== false, turnId };
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

    // RPC response to a bridge call.
    if (frame.id && !frame.type) {
      const pending = this.ompPending.get(String(frame.id));
      if (pending) {
        this.ompPending.delete(String(frame.id));
        if (frame.error) pending.reject(new Error(String((frame.error as Record<string, unknown>)?.message ?? frame.error)));
        else pending.resolve(frame.result);
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
              this.notify("sidecar.notification", {
                type: "system",
                code: "PROTOCOL_DOWNGRADE",
                message: "omp negotiated protocol v1; large tool results may be silently truncated. Sessions are read-only until omp is upgraded.",
              });
            } else {
              this.state.protocolVersion = 2;
            }
          })
          .catch(() => {
            this.state.protocolVersion = 1;
            this.state.readOnly = true;
          });
      } else {
        // DX10: omp doesn't offer v2.
        this.state.protocolVersion = 1;
        this.state.readOnly = true;
      }
      return;
    }

    // extension_ui_request (E9).
    if (frame.type === "extension_ui_request") {
      this.handleUiRequest(frame as unknown as OmpExtensionUiRequest);
      return;
    }

    // Agent events: map omp events to PI-Desktop agent.event notifications.
    const eventType = String(frame.type ?? "");
    if (DROP_EVENTS.has(eventType)) return;

    if (PASSTHROUGH_EVENTS.has(eventType)) {
      // Track open tool calls (for synthesizing toolCallId when ui_request arrives).
      if (eventType === "tool_start" || eventType === "tool_execution_start") {
        const sessionId = String(frame.sessionId ?? "");
        this.openTools.set(sessionId, {
          toolCallId: String(frame.toolCallId ?? frame.id ?? ""),
          toolName: String(frame.toolName ?? ""),
        });
      }
      if (eventType === "tool_end" || eventType === "tool_execution_end") {
        const sessionId = String(frame.sessionId ?? "");
        this.openTools.delete(sessionId);
      }

      this.notify("agent.event", {
        sessionId: frame.sessionId,
        turnId: frame.turnId,
        ts: new Date().toISOString(),
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
        this.ompCall({ type: "extension_ui_response", requestId: req.id, cancelled: true }).catch(() => undefined);
      }
      return;
    }

    if (mapped.type === "editor_refusal") {
      // Immediately respond with a refusal so the tool turn doesn't hang (E9).
      this.ompCall({
        type: "extension_ui_response",
        requestId: req.id,
        cancelled: true,
      }).catch(() => undefined);
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

    // tool_permission_request and asktool_request — track and forward.
    this.pendingUiRequests.set(req.id, {
      sessionId,
      toolCallId: openTool?.toolCallId ?? req.id,
      toolName: openTool?.toolName ?? req.title ?? "tool",
    });

    this.notify("agent.event", {
      sessionId,
      ts: new Date().toISOString(),
      event: mapped,
    });
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
    cwd: string;
    env: NodeJS.ProcessEnv;
  }): Promise<void> {
    this.state.cwd = opts.cwd;
    this.sessionStore = new SessionStore(opts.dataDir);

    const child = spawn(
      opts.ompBinary,
      ["--mode", "rpc", "--approval-mode", "always-ask", "--config", opts.overlayPath],
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
    overlayPath = writeOmpOverlay({ dataDir, resourcesPath, screenshotsDir });
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
