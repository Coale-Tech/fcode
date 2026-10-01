import { writeFileSync } from "node:fs";
import { MEMORY_TOKEN_SECRET_REF, memoryEnv, readMemoryConfig } from "../memory-config";
import { approvalModeEnv, readApprovalMode } from "../approval-mode-config";
import { ompSettingsEnv, readOmpSettings } from "../omp-settings-config";
import { join } from "node:path";
import { IPC, type AgentEventEnvelope, type UiMessage } from "@pi-desktop/shared";
import {
  findSubagentProviderSource,
  loadInstructionChain,
  modelConfigWithBinding,
  subagentProviderLookupError,
} from "@pi-desktop/agent-runtime";
import { loadBuiltinSkillBody } from "../builtin-skills";
import { createImageGenerationTool } from "../services/image-generation-service";
import { registerPluginDevTools } from "../plugin-dev-tools";
import { resolveLocalFile } from "../browser-view";
import { catalogModelConfigFor } from "../models-dev-catalog";
import { AgentSidecar } from "../agent-sidecar";
import { relaxedNetworkPolicyEnabled } from "../endpoint-policy";
import { OAUTH_AUTH_KIND, type VendorOAuth } from "../oauth";
import type { AgentExtensionBridge } from "../agent-extensions";
import { withAgentCanvasOwnership, type BrowserHost } from "../browser-host";
import type { InflightCheckpointer } from "@pi-desktop/host-runtime";
import { summarizeToolResult, type Logger } from "../logger";
import type { ModelsDevCatalog } from "../models-dev-catalog";
import type { PluginRuntime } from "../plugin-runtime";
import type { UserMcpRuntime } from "../user-mcp";
import type { RuntimeState } from "./context";
import type { FinishTurn } from "./plans";
import { benchSupervisor, ALLOWED_BENCH_VERBS, benchFailureText } from "../bench/supervisor";
import { isReadOnlyBenchMethod } from "../bench/approval";
import { studioExpression } from "../bench/studio-actions";
import { pythonLiteral } from "../bench/python-literal";
import { shell } from "electron";
import { parseAllowedExternalUrl } from "../safe-open-external";

export type SidecarRuntimeDependencies = {
  runtimeState: RuntimeState;
  steeringReplies: Set<string>;
  logger: Logger;
  sendToRenderer: (channel: string, payload: unknown) => void;
  persistAgentEvent: (envelope: AgentEventEnvelope) => UiMessage | undefined;
  activeTurns: Map<string, string>;
  approvedExecutionIdsBySession: Map<string, string>;
  claimedExecutionSessions: Map<string, string>;
  inflightCheckpointer: InflightCheckpointer;
  finishTurn: FinishTurn;
  finishApprovedExecution: (...args: any[]) => Promise<void>;
  superviseRestart: (kind: "host" | "sidecar") => Promise<void>;
  /**
   * Terminal identity, shared with the persistence pass. A terminal event for a
   * turn that no longer owns its session must not clear the current turn's state
   * in Agent Host or the renderer.
   */
  isStaleTerminalEvent: (envelope: AgentEventEnvelope) => boolean;
  isQuitting: () => boolean;
  dataDir: string;
  agentExtensions: AgentExtensionBridge;
  vendorOAuth: VendorOAuth;
  listRuntimeProviders: (includeDisabled?: boolean) => Promise<any[]>;
  modelsDevCatalog: ModelsDevCatalog;
  effectiveSubagentModelConfig: (...args: any[]) => any;
  browserHost: BrowserHost;
  plugins: PluginRuntime;
  sessionProjects: Map<string, string | null>;
  loadUserSkillBody: (id: string, projectPath: string | null) => Promise<any>;
  activeUserSkills: (projectPath: string | undefined) => Promise<any[]>;
  pluginActiveInProject: (pluginId: string, projectPath: string | null | undefined) => boolean;
  currentNetworkProxy: () => any;
};

export function createSidecarRuntime({
  runtimeState,
  steeringReplies,
  logger,
  sendToRenderer,
  persistAgentEvent,
  activeTurns,
  approvedExecutionIdsBySession,
  claimedExecutionSessions,
  inflightCheckpointer,
  finishTurn,
  isStaleTerminalEvent,
  finishApprovedExecution,
  superviseRestart,
  isQuitting,
  dataDir,
  agentExtensions,
  vendorOAuth,
  listRuntimeProviders,
  modelsDevCatalog,
  effectiveSubagentModelConfig,
  browserHost,
  plugins,
  sessionProjects,
  loadUserSkillBody,
  activeUserSkills,
  pluginActiveInProject,
  currentNetworkProxy,
}: SidecarRuntimeDependencies): {
  emitAgentEvent: (envelope: AgentEventEnvelope) => void;
  wireSidecar: (sidecar: AgentSidecar) => void;
  startSidecar: () => Promise<void>;
} {

// ── Fcode provider injection ─────────────────────────────────────────────────

/** Map Fcode apiStyle values → omp's `api` field. */
const FCODE_API_STYLE_MAP: Record<string, string> = {
  anthropic_messages: "anthropic-messages",
  chat_completions: "openai-completions",
  responses: "openai-responses",
  openai_codex_responses: "openai-codex-responses",
  google_generative_ai: "google-generative-ai",
};

/**
 * Collect Fcode provider secrets and build the fcode-providers.yml content.
 * The YAML stores env var NAMES (not values) as apiKey so keys are never
 * written to disk. The actual secrets are returned in `providerEnv`.
 */
async function buildFcodeProvidersConfig(
  host: { call: <T>(method: string, params?: unknown) => Promise<T> },
  providers: Array<{
    id: string;
    baseUrl?: string;
    apiStyle?: string;
    models?: Array<{ id: string }>;
    authKind?: string;
    hasOauth?: boolean;
    enabled?: boolean;
  }>,
): Promise<{ yaml: string; providerEnv: Record<string, string> } | null> {
  const providerEnv: Record<string, string> = {};
  const lines = ["# Fcode-injected providers — generated on each launch, do not edit.", "providers:"];
  let any = false;
  for (const p of providers) {
    if (p.authKind === "none" || p.hasOauth) continue;
    const envKey = `FCODE_PROVIDER_${p.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_KEY`;
    let secret: string | undefined;
    try {
      const r = await host.call<{ value?: string }>("providers.getSecret", { id: p.id });
      secret = r.value;
    } catch { continue; }
    if (!secret) continue;
    providerEnv[envKey] = secret;
    lines.push(`  fcode-${p.id}:`);
    if (p.baseUrl) lines.push(`    baseUrl: "${p.baseUrl}"`);
    const api = FCODE_API_STYLE_MAP[p.apiStyle ?? "chat_completions"] ?? "openai-completions";
    lines.push(`    api: ${api}`);
    lines.push(`    apiKey: ${envKey}`);
    const models = p.models ?? [];
    if (models.length) {
      lines.push(`    models:`);
      for (const m of models) lines.push(`      - id: "${m.id}"`);
    }
    any = true;
  }
  return any ? { yaml: lines.join("\n") + "\n", providerEnv } : null;
}

  const emitAgentEvent = (envelope: AgentEventEnvelope) => {
    // A terminal event for a turn that no longer owns its session must not clear
    // the current turn's state in Agent Host or the renderer. Persistence is a
    // separate call, so dropping it here still archives it as history.
    if (isStaleTerminalEvent(envelope)) return;
    runtimeState.agentHostBridge?.ingest(envelope);
    sendToRenderer(IPC.event.agentMessage, envelope);
  };
  const activeToolCalls = new Map<
    string,
    {
      sessionId: string;
      toolCallId: string;
      toolName: string;
      startedAt: number;
      turnId?: string;
      parentToolCallId?: string;
      agentName?: string;
    }
  >();
  const toolKey = (sessionId: string, toolCallId: string) => `${sessionId}:${toolCallId}`;
  /**
   * A crashed turn whose session moved on can never finalize: the newer turn's
   * teardown is not this cleanup's to run, and the crashed turn's records must
   * not be left behind. The finalizer refuses the settlement for a turn that no
   * longer owns the session and drops exactly those records.
   */
  const releaseCrashedTurn = (sessionId: string, crashedTurnId: string) =>
    finishTurn(sessionId, "aborted", "PLAN_APPROVAL_INTERRUPTED", {
      turnId: crashedTurnId,
    });

  /**
   * Unwind one session after the agent sidecar exited unexpectedly. Its own
   * function so the ownership re-check after each await is explicit: the session
   * can start a newer turn while this cleanup is suspended.
   */
  const settleCrashedSession = async (
    sessionId: string,
    crashedTurnId: string,
  ): Promise<void> => {
    const executionId = approvedExecutionIdsBySession.get(sessionId);
    if (runtimeState.host) {
      await runtimeState.host.call("plans.abort", { sessionId }).catch(() => undefined);
    }
    // A newer turn may own the session by now; this cleanup is the old one's.
    // It must still not leave the crashed turn's records behind.
    if (activeTurns.get(sessionId) !== crashedTurnId) {
      await releaseCrashedTurn(sessionId, crashedTurnId);
      return;
    }
    // No final row is coming from a dead sidecar: keep whatever the reply had
    // streamed so far as an aborted transcript row (D299).
    await inflightCheckpointer.flush(sessionId);
    // The flush awaits too, so a newer turn can have started and checkpointed
    // while it ran. `settle` discards the session's pending checkpoint outright,
    // so it is reached only for the turn that still owns the session, and it is
    // called synchronously right after this check: no await in between.
    if (activeTurns.get(sessionId) !== crashedTurnId) {
      await releaseCrashedTurn(sessionId, crashedTurnId);
      return;
    }
    inflightCheckpointer.settle(sessionId);
    await finishTurn(sessionId, "aborted", "PLAN_APPROVAL_INTERRUPTED", {
      recoverInflight: true,
      turnId: crashedTurnId,
    });
    if (executionId) {
      await finishApprovedExecution(
        executionId,
        "interrupted",
        "PLAN_EXECUTION_INTERRUPTED",
      );
    }
  };
  const wireSidecar = (s: AgentSidecar) => {

  s.onNotification((method, params) => {
    if (method === "native.agent.event") {
      // Native AgentSession already persisted the event to its canonical Pi
      // JSONL. It owns neither the Desktop outbox nor Host queue/turn state.
      sendToRenderer(IPC.event.agentMessage, params as AgentEventEnvelope);
      return;
    }
    if (method === "agent.event") {
      const envelope = params as AgentEventEnvelope;
      const event = envelope.event;
      if (event.type === "tool_start") {
        activeToolCalls.set(toolKey(envelope.sessionId, event.toolCallId), {
          sessionId: envelope.sessionId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          startedAt: envelope.ts,
          turnId: envelope.turnId,
          parentToolCallId: envelope.parentToolCallId,
          agentName: envelope.agentName,
        });
      } else if (event.type === "tool_end") {
        const key = toolKey(envelope.sessionId, event.toolCallId);
        const started = activeToolCalls.get(key);
        activeToolCalls.delete(key);
        const result = summarizeToolResult(event.result);
        const resultCode =
          typeof result.errorCode === "string"
            ? result.errorCode
            : typeof result.code === "string"
              ? result.code
              : undefined;
        logger.app(
          "tool",
          event.isError ? "error" : "info",
          event.isError ? "tool execution failed" : "tool execution completed",
          {
            sessionId: envelope.sessionId,
            turnId: envelope.turnId ?? started?.turnId,
            toolCallId: event.toolCallId,
            parentToolCallId: started?.parentToolCallId,
            agentName: started?.agentName,
            ...(resultCode ? { code: resultCode } : {}),
            data: {
              toolName: started?.toolName ?? "unknown",
              outcome: event.isError ? "error" : "success",
              durationMs: started
                ? Math.max(0, envelope.ts - started.startedAt)
                : undefined,
              result,
            },
          },
        );
      }
      emitAgentEvent(envelope);
      const persistedMessage = persistAgentEvent(envelope);
      if (persistedMessage) {
        // The renderer may have reloaded while a long-running tool was open.
        // Replay the completed row through the existing message_end contract so
        // it can append the row when the original tool_start is no longer in
        // the in-memory transcript.
        emitAgentEvent({
          ...envelope,
          event: { type: "message_end", message: persistedMessage },
        } satisfies AgentEventEnvelope);
      }
    }
    // omp-bridge fatal: forward to renderer so ChatSurface can render the
    // blocking "omp binary not found" panel (IPC.event.sidecarFatal).
    if (method === "sidecar.fatal") {
      sendToRenderer(IPC.event.sidecarFatal, params);
      return;
    }
    // omp-bridge open_url (emitted during omp.login.start OAuth flow): open in
    // the system browser with the same http(s)-only allowlist used everywhere.
    if (method === "sidecar.notification") {
      const n = params as { type?: string; url?: string; message?: string };
      if (n.type === "open_url") {
        const url = parseAllowedExternalUrl(n.url);
        if (url) void shell.openExternal(url);
      } else if (n.type === "system" && n.message) {
        // PROTOCOL_DOWNGRADE, HOST_TOOL_REGISTRATION_FAILED, …
        sendToRenderer(IPC.event.toast, { message: n.message });
      }
      return;
    }
    // omp-bridge setStatus/setWidget/setTitle: forward as-is to renderer.
    if (method === "sidecar.ext_ui") {
      sendToRenderer(IPC.event.sidecarExtUi, params);
      return;
    }
    // permissions.request reaches the renderer once, via wireHost; the
    // sidecar no longer relays it (agent-sidecar.setHost filters it out).
  });
  s.onExit(({ code, signal, intentional, stderrTail }) => {
    if (runtimeState.sidecar !== s) return;
    logger.flushChild("agent");
    const interruptedToolCalls = [...activeToolCalls.values()];
    activeToolCalls.clear();
    runtimeState.sidecar = null;
    steeringReplies.clear();
    if (intentional || isQuitting()) return;
    for (const tool of interruptedToolCalls) {
      logger.app("tool", "error", "tool execution interrupted", {
        sessionId: tool.sessionId,
        turnId: tool.turnId,
        toolCallId: tool.toolCallId,
        parentToolCallId: tool.parentToolCallId,
        agentName: tool.agentName,
        data: {
          toolName: tool.toolName,
          outcome: "interrupted",
          durationMs: Math.max(0, Date.now() - tool.startedAt),
          reason: "agent_sidecar_exit",
          exitCode: code,
          signal,
        },
      });
    }
    // A sidecar crash closes live approval waiters before the replacement
    // sidecar starts. This prevents an old renderer response from waking a
    // dead runtime and records the durable turn as interrupted.
    for (const sessionId of [...activeTurns.keys()]) {
      // Snapshot the turn this cleanup belongs to before the awaits below: the
      // session can start a new turn while this one is still unwinding, and a
      // late cleanup must not settle or abort that newer turn.
      const crashedTurnId = activeTurns.get(sessionId);
      if (!crashedTurnId) continue;
      void settleCrashedSession(sessionId, crashedTurnId).catch((error: unknown) => {
        // The crash handler cannot await this and the sidecar is already gone:
        // log the failure instead of leaving the rejection unhandled.
        logger.app("runtime", "warn", "crashed-turn settlement failed", {
          sessionId,
          data: String(error),
        });
      });
    }
    for (const [executionId] of claimedExecutionSessions) {
      void finishApprovedExecution(
        executionId,
        "interrupted",
        "PLAN_EXECUTION_INTERRUPTED",
      );
    }
    logger.app("runtime", "error", "agent sidecar exited unexpectedly", {
      data: { exitCode: code, signal, stderrTail },
    });
    sendToRenderer(IPC.event.hostStatus, {
      ok: false,
      component: "sidecar",
      restarting: true,
    });
    void superviseRestart("sidecar");
  });
  };
  const startSidecar = async (): Promise<void> => {
  // Inject Fcode providers into omp via --models-config. Secrets go into env
  // vars (FCODE_PROVIDER_<ID>_KEY); the config file only stores var names so
  // keys are never written to disk.
  let providerEnv: Record<string, string> = {};
  if (runtimeState.host) {
    try {
      const allProviders = await listRuntimeProviders(false);
      const injected = await buildFcodeProvidersConfig(runtimeState.host, allProviders);
      if (injected) {
        const configPath = join(dataDir, "fcode-providers.yml");
        writeFileSync(configPath, injected.yaml, "utf8");
        providerEnv = { ...injected.providerEnv, FCODE_MODELS_CONFIG: configPath };
      }
    } catch {
      // Non-fatal — omp starts without Fcode provider injection.
    }
  }
  // Memory backend selection + Hindsight token (env only; never in the overlay file).
  try {
    const memory = readMemoryConfig(dataDir);
    let token: string | null = null;
    if (memory.backend === "hindsight" && runtimeState.host) {
      const res = await runtimeState.host.call<{ value: string | null }>("secrets.getForRuntime", {
        secretRef: MEMORY_TOKEN_SECRET_REF,
      });
      token = res?.value ?? null;
    }
    providerEnv = { ...providerEnv, ...memoryEnv(memory, token) };
  } catch {
    // Non-fatal — omp falls back to its own memory defaults.
  }
  // Tool approval mode — controls omp's --approval-mode on spawn.
  providerEnv = { ...providerEnv, ...approvalModeEnv(readApprovalMode(dataDir)) };
  // omp settings groups (task / eval / browser / collab).
  providerEnv = { ...providerEnv, ...ompSettingsEnv(readOmpSettings(dataDir)) };
  // Set omp's working directory to the active bench so the bash RPC and session
  // path context use the correct project root instead of the user home directory.
  const benchPath = benchSupervisor.activeBenchPath;
  if (benchPath) providerEnv = { ...providerEnv, FCODE_BENCH_PATH: benchPath };

  const s = new AgentSidecar((text) => logger.child("agent", text), providerEnv);
  wireSidecar(s);
  s.setProjectInstructionResolver(async ({ projectPath, path }) => {
    // The root is registered by Electron main from the host-owned session
    // record. The sidecar can provide a target path, never an arbitrary root.
    const instructions = await loadInstructionChain(projectPath, path);
    if (!projectPath || !runtimeState.host) return instructions;
    try {
      const result = await runtimeState.host.call<{
        context?: {
          roots?: Array<{ path?: string }>;
          instructions?: string;
        } | null;
      }>("project.group.context", { path: projectPath });
      const roots = result.context?.roots ?? [];
      const rootGuide = roots.length > 1
        ? [
            `Primary root: ${roots[0]?.path ?? projectPath}`,
            ...roots.slice(1).map((root) => `Additional root: ${root.path ?? ""}`),
            "Use an absolute path when reading or editing an additional root.",
          ].join("\n")
        : "";
      const groupInstructions = result.context?.instructions?.trim();
      if (!rootGuide && !groupInstructions) return instructions;
      return {
        entries: [
          ...(instructions?.entries ?? []),
          ...(rootGuide
            ? [{ source: "ChatGPT Project folders", content: rootGuide }]
            : []),
          ...(groupInstructions
            ? [{ source: "ChatGPT Project instructions", content: groupInstructions }]
            : []),
        ],
      };
    } catch {
      return instructions;
    }
  });
    // Request auth for a vendor account (ADR 0098). The sidecar names a provider
  // row it was launched with; main resolves that row's account and returns a
  // short-lived `ModelAuth`. The refresh token never crosses this boundary.
  s.setTrustedExtensionBridge({
    publishCommands: (params) =>
      agentExtensions.publishCommands(
        String(params.sessionId ?? ""),
        Array.isArray(params.commands) ? (params.commands as any[]) : [],
      ),
    publishDiagnostics: (params) =>
      agentExtensions.publishDiagnostics(
        String(params.sessionId ?? ""),
        Array.isArray(params.diagnostics) ? (params.diagnostics as any[]) : [],
        Array.isArray(params.reports) ? (params.reports as any[]) : [],
      ),
    requestUi: (params) => agentExtensions.requestUi(params as any),
    configureModel: async (params) => {
      if (!runtimeState.host) throw new Error("host unavailable");
      const sessionId = String(params.sessionId ?? "").trim();
      const result = await runtimeState.host.call<{ session?: {
        providerId?: string;
        modelId?: string;
        thinkingLevel?: string;
      } | null }>("session.configure", {
        id: sessionId,
        mode: String(params.mode ?? "agent"),
        providerId: String(params.providerId ?? ""),
        modelId: String(params.modelId ?? ""),
        thinkingLevel: typeof params.thinkingLevel === "string" ? params.thinkingLevel : undefined,
      });
      if (result.session) {
        plugins.broadcastEvent("session:modelChanged", [{
          sessionId,
          modelKey: result.session.providerId && result.session.modelId
            ? `${result.session.providerId}/${result.session.modelId}`
            : null,
          thinkingLevel: result.session.thinkingLevel,
        }]);
      }
      return { ok: Boolean(result.session), session: result.session ?? null };
    },
    queuePush: async (params) => {
      if (!runtimeState.agentHostBridge) throw new Error("agent host unavailable");
      return runtimeState.agentHostBridge.queue.push({
        sessionId: String(params.sessionId ?? ""),
        content: String(params.content ?? ""),
        ...(typeof params.idempotencyKey === "string" ? { idempotencyKey: params.idempotencyKey } : {}),
      });
    },
    queuePrioritize: async (params) => {
      if (!runtimeState.agentHostBridge) throw new Error("agent host unavailable");
      await runtimeState.agentHostBridge.queue.prioritize(String(params.id ?? ""));
      return { ok: true };
    },
  });
  s.setVendorAuthResolver(async ({ providerId }) =>
    vendorOAuth.resolveAuth(providerId),
  );
  s.setSubagentModelResolver(async (key: string) => {
    const slash = key.indexOf("/");
    if (slash < 1) throw new Error("invalid model key");
    const providerPart = key.slice(0, slash);
    const modelId = key.slice(slash + 1);
    if (!modelId) throw new Error("empty model id");

    const allProviders = await listRuntimeProviders(false);
    const provider = findSubagentProviderSource(providerPart, allProviders);
    if (!provider) {
      throw new Error(subagentProviderLookupError(providerPart, allProviders));
    }

    // Check if the model has availableForSubagents enabled
    const binding = provider.models?.find(
      (m: any) => m.id === modelId || m.id.toLowerCase() === modelId.toLowerCase(),
    );
    if (!binding?.availableForSubagents) {
      throw new Error(
        `model "${modelId}" on provider "${provider.name}" is not enabled for delegation`,
      );
    }

    const isVendorAccount = provider.authKind === OAUTH_AUTH_KIND;
    let apiKey = "";
    if (!isVendorAccount && provider.authKind !== "none") {
      const secret = await runtimeState.host!.call<{ value?: string }>(
        "providers.getSecret",
        { id: provider.id },
      );
      apiKey = secret?.value ?? "";
      if (!apiKey) throw new Error(`provider "${provider.name}" has no API key`);
    }

    await modelsDevCatalog.ensureLoaded();
    let catalogModelConfig: Parameters<typeof modelConfigWithBinding>[0];
    if (isVendorAccount) {
      const vendorBinding = await vendorOAuth.bindingFor(provider.id, modelId);
      if (!vendorBinding) throw new Error(`vendor "${provider.name}" does not offer "${modelId}"`);
      catalogModelConfig =
        vendorBinding.modelConfig ?? catalogModelConfigFor(modelsDevCatalog, {
          vendorKey: provider.vendorKey,
          baseUrl: vendorBinding.baseUrl ?? provider.baseUrl,
          apiStyle: vendorBinding.apiStyle ?? provider.apiStyle,
          modelId,
        });
    } else {
      catalogModelConfig = catalogModelConfigFor(modelsDevCatalog, {
        vendorKey: provider.vendorKey,
        baseUrl: provider.baseUrl,
        apiStyle: provider.apiStyle,
        modelId,
      });
    }
    const { modelConfig, capabilities } = effectiveSubagentModelConfig(
      provider,
      modelId,
      catalogModelConfig,
    );

    return {
      id: provider.id,
      name: provider.name,
      ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
      modelId,
      apiKey,
      ...(provider.authKind ? { authKind: provider.authKind } : {}),
      ...(provider.apiStyle ? { apiStyle: provider.apiStyle } : {}),
      supportsReasoning: capabilities.supportsReasoning,
      supportedThinkingLevels: [...capabilities.supportedThinkingLevels],
      ...(modelConfig ? { modelConfig } : {}),
    };
  });
  // Agent-driven work panel preview (D100): open a workspace HTML file in
  // the embedded browser; live reload keeps it current through later edits.
  s.setLocalTool("GenerateImages", createImageGenerationTool({
    dataDir,
    getHost: () => runtimeState.host,
    // Fake-IP tolerance belongs to the network policy, not to the proxy switch.
    allowFakeIp: () => relaxedNetworkPolicyEnabled(),
  }));
  s.setLocalTool("BrowserPreview", async ({ args, sessionId }) => {
    const raw = String((args as { path?: unknown })?.path ?? "").trim();
    if (!raw) {
      return {
        ok: false,
        isError: true,
        content: "BrowserPreview: `path` is required.",
      };
    }
    let root: string | null = null;
    try {
      const res = (await runtimeState.host?.call("session.get", { id: sessionId })) as
        | { session: { projectPath?: string } | null }
        | undefined;
      root = res?.session?.projectPath?.trim() || null;
    } catch {
      root = null;
    }
    if (!root) {
      return {
        ok: false,
        isError: true,
        content: "BrowserPreview: no workspace is open.",
      };
    }
    if (!resolveLocalFile(raw, root)) {
      return {
        ok: false,
        isError: true,
        content: `BrowserPreview: "${raw}" does not resolve to an existing file inside the workspace.`,
      };
    }
    const preview = await browserHost.previewWorkspaceFile(sessionId, raw, root);
    if (!preview.ok) {
      return {
        ok: false,
        isError: true,
        content: preview.content,
      };
    }
    sendToRenderer(IPC.event.browserPreview, {
      sessionId,
      path: raw,
    });
    return {
      ok: true,
      content: `Previewing ${raw} in the work-panel Browser plugin. Live reload is active — subsequent edits to the file or sibling assets re-render automatically.`,
    };
  });
  // Plugin skills (D174): the model loads a declared skill document by id.
  // Served in main because the plugin runtime — and the plugin directories —
  // live here, not in host-core.
  s.setLocalTool("Skill", async ({ args, sessionId }) => {
    const id = String((args as { id?: unknown })?.id ?? "").trim();
    if (!id) {
      return {
        ok: false,
        isError: true,
        content: "Skill: `id` is required. Use an id from the Skills section.",
      };
    }
    const projectPath = sessionProjects.get(sessionId) ?? null;
    try {
      // Bundled skills answer first; they are not owned by any plugin. A user
      // skill is looked up next, and only then a plugin's — the ids cannot
      // collide, since a plugin skill id always carries a `<pluginId>/` prefix.
      const skill =
        loadBuiltinSkillBody(id) ??
        (await loadUserSkillBody(id, projectPath)) ??
        plugins.loadSkillBody(id);
      return {
        ok: true,
        content: `# Skill: ${skill.name} (${skill.id})\n\n${skill.body}`,
      };
    } catch (error) {
      const userIds = (await activeUserSkills(projectPath ?? undefined)).map(
        (skill) => skill.id,
      );
      const pluginIds = plugins
        .getSkills()
        .filter((skill) => pluginActiveInProject(skill.pluginId, projectPath))
        .map((skill) => skill.id);
      const available = [...userIds, ...pluginIds].join(", ");
      return {
        ok: false,
        isError: true,
        content: `Skill: ${error instanceof Error ? error.message : String(error)}.${
          available ? ` Available skills: ${available}.` : ""
        }`,
      };
    }
  });
  // Plugin authoring (D171): scaffold, validate and package a plugin without
  // leaving the session. Paths stay inside the open workspace.
  registerPluginDevTools(s, {
    resolveWorkspace: async (sessionId) => {
      try {
        const res = (await runtimeState.host?.call("session.get", { id: sessionId })) as
          | { session: { projectPath?: string } | null }
          | undefined;
        return res?.session?.projectPath?.trim() || null;
      } catch {
        return null;
      }
    },
    registerDevPlugin: async (path) => {
      if (!runtimeState.host) throw new Error("host unavailable");
      const loaded = await runtimeState.host.call<{ plugin?: { permissions?: string[] } }>(
        "plugins.loadDev",
        { path },
      );
      return loaded.plugin?.permissions ?? [];
    },
    loadPlugin: async (path, permissions) => {
      const manifest = await plugins.loadFromPath(path, permissions ?? [], {
        development: true,
      });
      plugins.watchDevPlugin(manifest.id);
      for (const toast of plugins.drainToasts()) {
        sendToRenderer(IPC.event.toast, { message: toast });
      }
      sendToRenderer(IPC.event.pluginChanged,{ reason: "scaffold" });
    },
  });

  // T7: Fcode host tools — registered by method name so the bridge can
  // dispatch host_tool_call frames directly without going through tools.execute.

  s.setLocalTool("fcode_bench_execute", async (ctx) => {
    const args = ctx.args;
    if (!args || typeof args !== "object") {
      return { ok: false, isError: true, content: "fcode_bench_execute: args must be an object" };
    }
    const method = "method" in args ? String(args.method) : "";
    if (!method) {
      return { ok: false, isError: true, content: "fcode_bench_execute: method is required" };
    }
    const benchPath = benchSupervisor.activeBenchPath;
    if (!benchPath) {
      return { ok: false, isError: true, content: "fcode_bench_execute: no active bench" };
    }
    const site = "site" in args && args.site != null ? String(args.site) : benchSupervisor.activeSite;
    const kwargs = "kwargs" in args && args.kwargs ? args.kwargs : {};
    const result = await benchSupervisor.runOneShot({
      benchPath,
      site,
      verb: "execute",
      args: [method, "--kwargs", pythonLiteral(kwargs)],
    });
    if (result.exitCode !== 0) {
      return {
        ok: false,
        isError: true,
        content: benchFailureText(result),
      };
    }
    return { ok: true, content: result.output };
  });

  s.setLocalTool("fcode_bench_execute_read", async (ctx) => {
    const args = ctx.args;
    if (!args || typeof args !== "object") {
      return { ok: false, isError: true, content: "fcode_bench_execute_read: args must be an object" };
    }
    const method = "method" in args ? String(args.method) : "";
    if (!method) {
      return { ok: false, isError: true, content: "fcode_bench_execute_read: method is required" };
    }
    if (!isReadOnlyBenchMethod(method)) {
      return {
        ok: false,
        isError: true,
        content: `fcode_bench_execute_read: '${method}' is not a read-only method. Use fcode_bench_execute for mutating calls.`,
      };
    }
    const benchPath = benchSupervisor.activeBenchPath;
    if (!benchPath) {
      return { ok: false, isError: true, content: "fcode_bench_execute_read: no active bench" };
    }
    const site = "site" in args && args.site != null ? String(args.site) : benchSupervisor.activeSite;
    const kwargs = "kwargs" in args && args.kwargs ? args.kwargs : {};
    const result = await benchSupervisor.runOneShot({
      benchPath,
      site,
      verb: "execute",
      args: [method, "--kwargs", pythonLiteral(kwargs)],
    });
    if (result.exitCode !== 0) {
      return {
        ok: false,
        isError: true,
        content: benchFailureText(result),
      };
    }
    return { ok: true, content: result.output };
  });

  s.setLocalTool("fcode_bench_run", async (ctx) => {
    const args = ctx.args;
    if (!args || typeof args !== "object") {
      return { ok: false, isError: true, content: "fcode_bench_run: args must be an object" };
    }
    const command = "command" in args ? String(args.command) : "";
    if (!command) {
      return { ok: false, isError: true, content: "fcode_bench_run: command is required" };
    }
    if (!ALLOWED_BENCH_VERBS.has(command)) {
      return {
        ok: false,
        isError: true,
        content: `fcode_bench_run: '${command}' is not allowed. Allowed verbs: ${[...ALLOWED_BENCH_VERBS].join(", ")}`,
      };
    }
    const benchPath = benchSupervisor.activeBenchPath;
    if (!benchPath) {
      return { ok: false, isError: true, content: "fcode_bench_run: no active bench" };
    }
    const site = "site" in args && args.site != null ? String(args.site) : benchSupervisor.activeSite;
    const extraArgs = "args" in args && Array.isArray(args.args) ? args.args.map(String) : [];
    const result = await benchSupervisor.runOneShot({
      benchPath,
      site,
      verb: command,
      args: extraArgs,
    });
    if (result.exitCode !== 0) {
      return {
        ok: false,
        isError: true,
        content: benchFailureText(result),
      };
    }
    return { ok: true, content: result.output };
  });

  s.setLocalTool("fcode_studio", async (ctx) => {
    const args = ctx.args;
    if (!args || typeof args !== "object") {
      return { ok: false, isError: true, content: "fcode_studio: args must be an object" };
    }
    const fields = args as Record<string, unknown>;
    const str = (key: string) => (fields[key] != null ? String(fields[key]) : undefined);
    const built = studioExpression({
      action: str("action") ?? "",
      app: str("app"),
      page: str("page"),
      target_app: str("target_app"),
    });
    if (!built.ok) return { ok: false, isError: true, content: `fcode_studio: ${built.error}` };
    const benchPath = benchSupervisor.activeBenchPath;
    if (!benchPath) return { ok: false, isError: true, content: "fcode_studio: no active bench" };
    const result = await benchSupervisor.runOneShot({
      benchPath,
      site: str("site") ?? benchSupervisor.activeSite,
      verb: "execute",
      args: [built.expression],
    });
    if (result.exitCode !== 0) {
      return {
        ok: false,
        isError: true,
        content: result.failure
          ? `${result.failure.problem}\n\nFix: ${result.failure.fix}`
          : result.output,
      };
    }
    return { ok: true, content: result.output.trim() || "OK" };
  });

  s.setLocalTool("fcode_canvas", async (ctx) => {
    if (!browserHost) {
      return { ok: false, isError: true, content: "fcode_canvas: Build canvas is not available" };
    }
    const args = ctx.args;
    if (!args || typeof args !== "object") {
      return { ok: false, isError: true, content: "fcode_canvas: args must be an object" };
    }
    const action = "action" in args ? String(args.action) : "";
    // Every fcode_canvas action mutates the shared canvas (navigate/reload/
    // click/fill/evaluate), so it force-acquires ownership for the call and
    // hands it back after — visible via the browserCanvasOwner banner (E13).
    return withAgentCanvasOwnership(browserHost, async () => {
      switch (action) {
        case "navigate": {
          const url = "url" in args ? String(args.url ?? "") : "";
          if (!url) return { ok: false, isError: true, content: "fcode_canvas navigate: url is required" };
          const state = await browserHost.navigate({ url });
          return { ok: true, content: state };
        }
        case "reload": {
          browserHost.action("reload");
          return { ok: true, content: null };
        }
        case "click": {
          const uid = "uid" in args ? String(args.uid ?? "") : "";
          if (!uid) return { ok: false, isError: true, content: "fcode_canvas click: uid is required" };
          await browserHost.click(uid);
          return { ok: true, content: null };
        }
        case "fill": {
          const uid = "uid" in args ? String(args.uid ?? "") : "";
          const text = "text" in args ? String(args.text ?? "") : "";
          if (!uid) return { ok: false, isError: true, content: "fcode_canvas fill: uid is required" };
          await browserHost.fill(uid, text);
          return { ok: true, content: null };
        }
        case "evaluate": {
          const expression = "expression" in args ? String(args.expression ?? "") : "";
          if (!expression) return { ok: false, isError: true, content: "fcode_canvas evaluate: expression is required" };
          const result = await browserHost.evaluate(expression);
          return { ok: true, content: result };
        }
        default:
          return {
            ok: false,
            isError: true,
            content: `fcode_canvas: unknown action '${action}'. Allowed: navigate, reload, click, fill, evaluate`,
          };
      }
    });
  });

  // fcode_canvas_read only inspects whatever is currently rendered (snapshot/
  // console/screenshot) — it never navigates or mutates the shared canvas, so
  // it does not force-acquire ownership (E13); only fcode_canvas's mutating
  // actions do.
  s.setLocalTool("fcode_canvas_read", async (ctx) => {
    if (!browserHost) {
      return { ok: false, isError: true, content: "fcode_canvas_read: Build canvas is not available" };
    }
    const args = ctx.args;
    if (!args || typeof args !== "object") {
      return { ok: false, isError: true, content: "fcode_canvas_read: args must be an object" };
    }
    const action = "action" in args ? String(args.action) : "";
    switch (action) {
      case "snapshot": {
        const result = await browserHost.snapshot();
        return { ok: true, content: result };
      }
      case "console": {
        const limit = "limit" in args && typeof args.limit === "number" ? args.limit : undefined;
        return { ok: true, content: browserHost.console(limit) };
      }
      case "screenshot": {
        const shot = await browserHost.screenshot({}, ctx.sessionId);
        return { ok: true, content: shot };
      }
      default:
        return {
          ok: false,
          isError: true,
          content: `fcode_canvas_read: unknown action '${action}'. Allowed: snapshot, console, screenshot`,
        };
    }
  });
  runtimeState.sidecar = s;
  if (runtimeState.host) s.setHost(runtimeState.host);
  await s.call("sidecar.configure", {
    hostBinary: runtimeState.host?.binaryPath,
    dataDir,
    networkProxy: currentNetworkProxy(),
  });
  logger.app("runtime", "info", "agent sidecar configured");
  };
  return { emitAgentEvent, wireSidecar, startSidecar };
}
