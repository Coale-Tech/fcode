import { mkdir } from "node:fs/promises";

import { AgentHost, type ApprovalPort } from "@pi-desktop/agent-host";
import {
  AgentSidecar,
  HostProcess,
  PlanExecutionDispatcher,
  RuntimeService,
  RuntimeSupervisor,
  createHeadlessLaunchResolver,
  createHostQueueStore,
  createHostSessionPort,
  listPendingToolRequests,
  ompProviderEnv,
  ompSidecarExtraEnv,
  runBenchOneShot,
  shouldAutoApproveVerb,
  ALLOWED_BENCH_VERBS,
  isReadOnlyBenchMethod,
  pythonLiteral,
  studioExpression,
  buildRunTestsArgs,
  runTestsReport,
  SITE_RE,
  loadBoard,
  saveBoard,
  addComment as kanbanAddComment,
  addLink as kanbanAddLink,
  agentCardCountForSession,
  createTask as kanbanCreateTask,
  completeTask as kanbanCompleteTask,
  blockTask as kanbanBlockTask,
  moveTask as kanbanMoveTask,
  recomputeReady as kanbanRecomputeReady,
  type HostProviderRecord,
  type KanbanBoard,
  type KanbanBlockKind,
} from "@pi-desktop/host-runtime";
import { DeviceTokenAuthenticator, RacpServer, bindRacpWebSocket, type RacpHostOperations, type WsBinding } from "@pi-desktop/racp";
import { APP_VERSION, type AgentEventEnvelope } from "@pi-desktop/shared";

import type { PiHostConfig } from "./config.js";
import { FileCredentialStore, loadOrCreateHostId } from "./credentials.js";
import { createHostOperations } from "./host-operations.js";
import { createLogger, type HostLogger } from "./logger.js";
import { TerminalService, loadPty } from "./terminal.js";

export type PiHostApp = {
  hostId: string;
  address: { host: string; port: number };
  agentHost: AgentHost;
  runtime: RuntimeService;
  authenticator: DeviceTokenAuthenticator;
  server: RacpServer;
  log: HostLogger;
  /** Mint a single-use pairing token for the bootstrap channel. */
  issuePairingToken(lifetimeMs: number): Promise<{ token: string; expiresAt: string }>;
  stop(): Promise<void>;
};

const APPROVAL_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Compose the headless Host: host-core and the sidecar under the shared
 * supervisor, the runtime service as the module's runtime port, the Agent
 * Host module, and the RACP server on loopback. Everything the desktop
 * would own for a local session — transcript, queue, approvals, tools,
 * workspace — lives here on this machine.
 */
export async function startPiHost(config: PiHostConfig, options: { log?: HostLogger } = {}): Promise<PiHostApp> {
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  const log = options.log ?? createLogger({ dataDir: config.dataDir, minLevel: config.logLevel });
  const hostId = await loadOrCreateHostId(config.dataDir);
  const store = new FileCredentialStore(config.dataDir);
  const authenticator = new DeviceTokenAuthenticator(store);

  const state: { host: HostProcess | null; sidecar: AgentSidecar | null; stopping: boolean } = { host: null, sidecar: null, stopping: false };
  const getHost = () => state.host;
  const getSidecar = () => state.sidecar;

  const launch = createHeadlessLaunchResolver({ getHost, dataDir: config.dataDir, log: (level, message, data) => log(level, message, data) });
  const runtime = new RuntimeService({ getHost, getSidecar, launch, log });

  const approvals: ApprovalPort = {
    async resolveTool(requestId, decision) {
      // omp asks for approval itself, so host-core has no record of the request:
      // the sidecar answers when it owns the id, host-core otherwise.
      const viaSidecar = await getSidecar()
        ?.call<{ handled?: boolean }>("tool_permission.resolve", { requestId, decision })
        .catch(() => undefined);
      if (viaSidecar?.handled) return;
      const host = getHost();
      if (!host) throw new Error("host unavailable");
      await host.call("permissions.resolve", { requestId, decision });
    },
    async resolveContract(input) {
      const host = getHost();
      if (!host) throw new Error("host unavailable");
      const pending = await host.call<{ plans?: Array<{ id: string; turnId?: string; toolCallId?: string }> }>("plans.pending", { sessionId: input.sessionId });
      const proposal = (pending.plans ?? []).find((candidate) => candidate.id === input.proposalId);
      if (!proposal) throw Object.assign(new Error(`proposal ${input.proposalId} is not pending`), { errorCode: "NOT_FOUND" });
      const result = await host.call("plans.resolve", {
        proposalId: input.proposalId,
        sessionId: input.sessionId,
        turnId: proposal.turnId ?? "",
        toolCallId: proposal.toolCallId ?? "",
        action: input.action,
        ...(input.version !== undefined ? { version: input.version } : {}),
        ...(input.permissionMode ? { targetPermissionMode: input.permissionMode } : {}),
      });
      if (input.action === "approve") void plans.dispatchExecutionForProposal(input.proposalId);
      return void result;
    },
    listPendingTools: (sessionId) => listPendingToolRequests(getHost, sessionId),
  };
  const agentHost = new AgentHost({
    runtime,
    sessions: createHostSessionPort(getHost),
    approvals,
    queueStore: createHostQueueStore(getHost),
    localApprovalLifetimeMs: APPROVAL_REQUEST_TIMEOUT_MS,
  });
  const plans = new PlanExecutionDispatcher({ getHost, getSidecar, launch, runtime, log });

  // Every runtime event feeds the module; a settled turn closes it there too.
  const abortingSessions = new Set<string>();
  runtime.onEvent((envelope: AgentEventEnvelope) => {
    const interrupted = envelope.event.type === "agent_end" && abortingSessions.has(envelope.sessionId);
    if (envelope.event.type === "agent_end" || envelope.event.type === "error") abortingSessions.delete(envelope.sessionId);
    try {
      agentHost.ingest(envelope, { interrupted });
    } catch (error) {
      log("warn", "agent host ingest failed", { sessionId: envelope.sessionId, type: envelope.event.type, error: String(error) });
    }
  });
  runtime.onTurnEnded((info) => {
    abortingSessions.delete(info.sessionId);
    const status = info.reason === "aborted" ? "interrupted" : info.reason === "error" ? "failed" : "completed";
    try {
      agentHost.endTurn(info.sessionId, info.turnId, status, info.errorCode ? { error: { code: info.errorCode, message: info.errorCode, retriable: false, traceId: "" } } : {});
      agentHost.kick(info.sessionId);
    } catch (error) {
      log("warn", "agent host end turn failed", { sessionId: info.sessionId, turnId: info.turnId, error: String(error) });
    }
  });
  const originalAbort = runtime.abort.bind(runtime);
  runtime.abort = async (sessionId, turnId) => {
    abortingSessions.add(sessionId);
    try {
      await originalAbort(sessionId, turnId);
    } catch (error) {
      abortingSessions.delete(sessionId);
      throw error;
    }
  };

  const startHost = async () => {
    const host = new HostProcess({ binaryPath: config.hostCoreBinary, dataDir: config.dataDir, onStderr: log.child("host") });
    host.onExit(({ intentional }) => {
      if (state.host !== host) return;
      state.host = null;
      if (intentional || state.stopping) return;
      log("error", "host-core exited unexpectedly");
      void supervisor.superviseRestart("host");
    });
    state.host = host;
    try {
      await host.handshake();
      await host.call("session.recoverInflightMessages").catch((error: unknown) => log("warn", "in-flight recovery failed", { error: String(error) }));
    } catch (error) {
      if (state.host === host) state.host = null;
      await host.dispose();
      throw error;
    }
    runtime.attachHost(host);
    state.sidecar?.setHost(host);
    log("info", "host-core handshake ok", { generation: host.generation });
  };
  const startSidecar = async () => {
    // omp-bridge reaches the user's providers through env: keys never touch disk.
    const host = getHost();
    const providerEnv = host
      ? await host
          .call<{ providers: HostProviderRecord[] }>("providers.list", { includeDisabled: false })
          .then(({ providers }) => ompProviderEnv(host, providers, config.dataDir))
          .catch((error: unknown) => {
            log("warn", "provider injection failed; omp starts without Fcode providers", { error: String(error) });
            return {};
          })
      : {};
    if (!config.resourcesPath) log("warn", "no resources directory found; omp binary and fcode agents are unavailable (set --resources or PI_HOST_RESOURCES)");
    const sidecar = new AgentSidecar({
      launch: {
        command: config.nodeBinary,
        args: [config.sidecarEntry],
        env: {
          ...process.env,
          FCODE_DATA_DIR: config.dataDir,
          ...(config.resourcesPath ? { FCODE_RESOURCES_PATH: config.resourcesPath } : {}),
          ...providerEnv,
          // omp settings, approval mode, memory backend — parity with desktop sidecar
          ...ompSidecarExtraEnv(config.dataDir),
        },
      },
      onStderr: log.child("agent"),
    });
    sidecar.onExit(({ intentional, code, signal, stderrTail }) => {
      if (state.sidecar !== sidecar) return;
      state.sidecar = null;
      if (intentional || state.stopping) return;
      log("error", "agent sidecar exited unexpectedly", { exitCode: code, signal, stderrTail });
      void supervisor.superviseRestart("sidecar");
    });
    sidecar.setProjectInstructionResolver(async ({ projectPath, path }) => {
      const { loadInstructionChain } = await import("@pi-desktop/agent-runtime");
      return loadInstructionChain(projectPath, path);
    });
    sidecar.setLocalTool("Skill", async ({ args, sessionId }) => {
      const id = String((args as { id?: unknown })?.id ?? "").trim();
      const host = getHost();
      if (!id || !host) return { ok: false, isError: true, content: "Skill: `id` is required." };
      const session = await host.call<{ session?: { projectPath?: string } | null }>("session.get", { id: sessionId, messageLimit: 1 }).catch(() => null);
      const result = await host.call<{ skill: { id: string; name: string } | null; body: string | null }>("skills.read", { id, projectPath: session?.session?.projectPath ?? null }).catch(() => null);
      if (!result?.skill || typeof result.body !== "string") return { ok: false, isError: true, content: `Skill: "${id}" is not available on this Host.` };
      return { ok: true, content: `# Skill: ${result.skill.name} (${result.skill.id})\n\n${result.body}` };
    });
    sidecar.setSessionBridge({
      queuePush: async (params) =>
        agentHost.startTurn({ subject: "extension", roles: ["controller"] }, {
          sessionId: String(params.sessionId ?? ""),
          admission: "queue",
          input: { text: String(params.content ?? "") },
          context: { requestId: `ext-${Date.now().toString(36)}`, ...(typeof params.idempotencyKey === "string" ? { idempotencyKey: params.idempotencyKey } : {}) },
        }),
      queuePrioritize: async (params) => agentHost.prioritizeTurn({ subject: "extension", roles: ["controller"] }, String(params.id ?? "")),
    });

    // ── Bench host tools — headless-portable ───────────────────────────────
    // fcode_bench_path: process env (user sets FCODE_BENCH_PATH before starting pi-host).
    // fcode_bench_site: process env (user sets FCODE_BENCH_SITE, or pass site in tool args).
    const getBenchPath = () => process.env.FCODE_BENCH_PATH ?? null;
    const getBenchSite = () => process.env.FCODE_BENCH_SITE ?? null;
    const noBench = (name: string) => ({ ok: false as const, isError: true, content: `${name}: no active bench (set FCODE_BENCH_PATH)` });
    const failText = (r: { exitCode: number; output: string }) => r.output.trim() || `bench exited with code ${r.exitCode}`;

    sidecar.setLocalTool("fcode_bench_execute", async ({ args }) => {
      const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
      const method = typeof a.method === "string" ? a.method : "";
      if (!method) return { ok: false, isError: true, content: "fcode_bench_execute: method is required" };
      const bp = getBenchPath();
      if (!bp) return noBench("fcode_bench_execute");
      const site = a.site != null ? String(a.site) : getBenchSite();
      const result = await runBenchOneShot(bp, site, "execute", [method, "--kwargs", pythonLiteral(a.kwargs ?? {})]);
      return result.exitCode !== 0 ? { ok: false, isError: true, content: failText(result) } : { ok: true, content: result.output };
    });

    sidecar.setLocalTool("fcode_bench_execute_read", async ({ args }) => {
      const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
      const method = typeof a.method === "string" ? a.method : "";
      if (!method) return { ok: false, isError: true, content: "fcode_bench_execute_read: method is required" };
      if (!isReadOnlyBenchMethod(method)) return { ok: false, isError: true, content: `fcode_bench_execute_read: '${method}' is not a read-only method. Use fcode_bench_execute for mutating calls.` };
      const bp = getBenchPath();
      if (!bp) return noBench("fcode_bench_execute_read");
      const site = a.site != null ? String(a.site) : getBenchSite();
      const result = await runBenchOneShot(bp, site, "execute", [method, "--kwargs", pythonLiteral(a.kwargs ?? {})]);
      return result.exitCode !== 0 ? { ok: false, isError: true, content: failText(result) } : { ok: true, content: result.output };
    });

    sidecar.setLocalTool("fcode_bench_run", async ({ args }) => {
      const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
      const command = typeof a.command === "string" ? a.command : "";
      if (!command) return { ok: false, isError: true, content: "fcode_bench_run: command is required" };
      if (command !== "run-tests" && !shouldAutoApproveVerb(command)) {
        return { ok: false, isError: true, content: `fcode_bench_run: '${command}' is not allowed. Allowed verbs: ${[...ALLOWED_BENCH_VERBS, "run-tests"].join(", ")}` };
      }
      const bp = getBenchPath();
      if (!bp) return noBench("fcode_bench_run");
      if (command === "run-tests") {
        const site = a.site != null ? String(a.site) : getBenchSite();
        if (!site || !SITE_RE.test(site)) return { ok: false, isError: true, content: `fcode_bench_run: run-tests needs a valid site (got ${JSON.stringify(site ?? null)})` };
        const built = buildRunTestsArgs(a as Record<string, unknown>);
        if (!built.ok) return { ok: false, isError: true, content: `fcode_bench_run: ${built.error}` };
        const result = await runBenchOneShot(bp, site, "run-tests", built.args);
        const { summary, content } = runTestsReport(result.output, result.exitCode);
        return { ok: summary.status === "passed" || summary.status === "no_tests", isError: summary.status !== "passed" && summary.status !== "no_tests", content };
      }
      const site = a.site != null ? String(a.site) : getBenchSite();
      const extraArgs = Array.isArray(a.args) ? a.args.map(String) : [];
      const result = await runBenchOneShot(bp, site, command, extraArgs);
      return result.exitCode !== 0 ? { ok: false, isError: true, content: failText(result) } : { ok: true, content: result.output };
    });

    sidecar.setLocalTool("fcode_studio", async ({ args }) => {
      const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
      const str = (k: string) => (a[k] != null ? String(a[k]) : undefined);
      const built = studioExpression({ action: str("action") ?? "", app: str("app"), page: str("page"), target_app: str("target_app") });
      if (!built.ok) return { ok: false, isError: true, content: `fcode_studio: ${built.error}` };
      const bp = getBenchPath();
      if (!bp) return noBench("fcode_studio");
      const result = await runBenchOneShot(bp, str("site") ?? getBenchSite(), "execute", [built.expression]);
      return result.exitCode !== 0 ? { ok: false, isError: true, content: failText(result) } : { ok: true, content: result.output.trim() || "OK" };
    });

    // ── Kanban host tools — headless-portable (file-backed board) ──────────
    // Board is loaded from disk on startup and kept in memory; each mutation
    // is written back atomically. sessionToCard is derived from the board's
    // running runs (no separate KanbanRunner needed for headless mode).
    let kanbanBoard: KanbanBoard = loadBoard(config.dataDir);
    const updateKb = (next: KanbanBoard) => { kanbanBoard = next; saveBoard(config.dataDir, next); };
    const kbErr = (msg: string) => ({ ok: false as const, isError: true, content: msg });
    // Find the task a session is currently running (via an open run row).
    const sessionTaskId = (sessionId: string) =>
      kanbanBoard.runs.find((r) => r.sessionId === sessionId && r.status === "running")?.taskId;

    sidecar.setLocalTool("kanban_show", async ({ sessionId, args }) => {
      const own = sessionTaskId(sessionId);
      if (!own) return kbErr("kanban_show: only callable from a kanban worker session");
      const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
      const taskId = String(a.taskId ?? "").trim() || own;
      const task = kanbanBoard.tasks.find((t) => t.id === taskId);
      if (!task) return kbErr("kanban_show: task not found");
      const comments = kanbanBoard.comments.filter((c) => c.taskId === taskId);
      if (taskId !== own) return { ok: true, content: JSON.stringify({ task, comments }) };
      const parents = kanbanBoard.links.filter((l) => l.childId === taskId).map((l) => kanbanBoard.tasks.find((t) => t.id === l.parentId)).filter((t) => t != null);
      return { ok: true, content: JSON.stringify({ task, parents, comments }) };
    });

    sidecar.setLocalTool("kanban_complete", async ({ sessionId, args }) => {
      const taskId = sessionTaskId(sessionId);
      if (!taskId) return kbErr("kanban_complete: only callable from a kanban worker session");
      const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
      updateKb(kanbanCompleteTask(kanbanBoard, taskId, a.summary != null ? String(a.summary) : undefined, a.result != null ? String(a.result) : undefined));
      return { ok: true, content: "Task marked complete." };
    });

    sidecar.setLocalTool("kanban_block", async ({ sessionId, args }) => {
      const taskId = sessionTaskId(sessionId);
      if (!taskId) return kbErr("kanban_block: only callable from a kanban worker session");
      const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
      const reason = String(a.reason ?? "blocked");
      const validKinds: Record<string, true> = { dependency: true, needs_input: true, capability: true, transient: true, gave_up: true };
      const kind = (typeof a.kind === "string" && validKinds[a.kind] ? a.kind : "needs_input") as KanbanBlockKind;
      updateKb(kanbanBlockTask(kanbanBoard, taskId, reason, kind));
      return { ok: true, content: "Task blocked." };
    });

    sidecar.setLocalTool("kanban_comment", async ({ sessionId, args }) => {
      const own = sessionTaskId(sessionId);
      if (!own) return kbErr("kanban_comment: only callable from a kanban worker session");
      const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
      const taskId = String(a.taskId ?? "").trim() || own;
      const body = String(a.body ?? "").trim();
      if (!body) return kbErr("kanban_comment: body required");
      if (!kanbanBoard.tasks.some((t) => t.id === taskId && !t.archived)) return kbErr("kanban_comment: task not found");
      updateKb(kanbanAddComment(kanbanBoard, taskId, `worker:${sessionId.slice(0, 8)}`, body));
      return { ok: true, content: "Comment added." };
    });

    sidecar.setLocalTool("kanban_create", async ({ sessionId, args }) => {
      const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
      const title = String(a.title ?? "").trim();
      const projectPath = String(a.projectPath ?? "").trim();
      if (!title || !projectPath) return kbErr("kanban_create: title and projectPath required");
      if (agentCardCountForSession(kanbanBoard, sessionId) >= 20) return kbErr("kanban_create: per-session card limit reached (20)");
      const { board: next, taskId } = kanbanCreateTask(kanbanBoard, {
        title, body: String(a.body ?? ""),
        projectPath, createdBy: "agent",
        modelOverride: a.modelOverride != null ? String(a.modelOverride) : undefined,
        parentIds: Array.isArray(a.parentIds) ? a.parentIds.map(String) : [],
      });
      updateKb(next);
      return { ok: true, content: JSON.stringify({ taskId }) };
    });

    sidecar.setLocalTool("kanban_link", async ({ args }) => {
      const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
      const parentId = String(a.parentId ?? "").trim();
      const childId = String(a.childId ?? "").trim();
      if (!parentId || !childId) return kbErr("kanban_link: parentId and childId required");
      const next = kanbanAddLink(kanbanBoard, parentId, childId);
      if (!next) return kbErr("kanban_link: cycle detected or invalid task ids");
      updateKb(kanbanRecomputeReady(next));
      return { ok: true, content: "Link added." };
    });

    sidecar.setLocalTool("kanban_list", async () => {
      return { ok: true, content: JSON.stringify(kanbanBoard.tasks.filter((t) => !t.archived)) };
    });

    sidecar.setLocalTool("kanban_unblock", async ({ sessionId, args }) => {
      if (sessionTaskId(sessionId)) return kbErr("kanban_unblock: not callable from a worker session");
      const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
      const taskId = String(a.taskId ?? "").trim();
      if (!taskId) return kbErr("kanban_unblock: taskId required");
      const task = kanbanBoard.tasks.find((t) => t.id === taskId);
      if (!task || task.status !== "blocked") return kbErr("kanban_unblock: task not found or not blocked");
      updateKb(kanbanMoveTask(kanbanBoard, taskId, "ready"));
      return { ok: true, content: "Task unblocked." };
    });
    state.sidecar = sidecar;
    runtime.attachSidecar(sidecar);
    if (state.host) sidecar.setHost(state.host);
    await sidecar.call("sidecar.configure", { hostBinary: config.hostCoreBinary, dataDir: config.dataDir, resourcesPath: config.resourcesPath });
    log("info", "agent sidecar configured");
  };
  const supervisor = new RuntimeSupervisor({
    start: { host: startHost, sidecar: startSidecar },
    afterRestart: () => plans.drainApprovedPlanExecutions(),
    isShuttingDown: () => state.stopping,
    onEvent: (event) => {
      if (event.phase === "fatal") log("error", `${event.kind} restart gave up`, { reason: event.reason, error: event.error ? String(event.error) : undefined });
      else if (event.phase === "restarted") log("warn", `${event.kind} restarted after crash`, { attempt: event.attempt });
      else if (event.phase === "restart_failed") log("error", `${event.kind} restart failed`, { attempt: event.attempt, error: String(event.error) });
    },
  });

  await startHost();
  await startSidecar();
  await agentHost.start();
  await plans.drainApprovedPlanExecutions().catch((error: unknown) => log("warn", "queued approved plan drain failed", { error: String(error) }));

  const pty = loadPty();
  const terminal = pty
    ? new TerminalService({
        pty,
        log,
        sessionRoot: async (sessionId) => {
          const host = getHost();
          if (!host) throw new Error("host unavailable");
          const result = await host.call<{ session?: { projectPath?: string } | null }>("session.get", { id: sessionId, messageLimit: 1 });
          const root = result.session?.projectPath?.trim();
          if (!root) throw Object.assign(new Error("the session has no project root"), { errorCode: "CONFLICT" });
          return root;
        },
      })
    : undefined;
  if (!pty) log("warn", "node-pty is not installed; terminals are disabled");

  const operations: RacpHostOperations = {
    ...createHostOperations({
      getHost,
      runtime,
      browseRoot: config.browseRoot,
      disposeSession: async (sessionId) => {
        const sidecar = getSidecar();
        if (!sidecar) return;
        sidecar.clearProjectInstructionRoot(sessionId);
        await sidecar.call("agent.disposeSession", { sessionId }).catch(() => undefined);
      },
      revokeDevice: (deviceId) => store.revokeDevice(deviceId, new Date().toISOString()),
    }),
    ...(terminal ? { terminal } : {}),
  };
  const server = new RacpServer({ agentHost, operations, authenticator, hostId, serverVersion: APP_VERSION, log });
  let binding: WsBinding;
  try {
    binding = await bindRacpWebSocket({ server: server, authenticator, host: config.host, port: config.port, log });
  } catch (error) {
    state.stopping = true;
    await state.sidecar?.dispose();
    await state.host?.dispose();
    throw error;
  }
  log("info", "pi-host ready", { hostId, host: binding.address.host, port: binding.address.port, version: APP_VERSION, terminal: Boolean(terminal) });

  return {
    hostId,
    address: binding.address,
    agentHost,
    runtime,
    authenticator,
    server,
    log,
    issuePairingToken: (lifetimeMs) => authenticator.issuePairingToken(lifetimeMs),
    async stop() {
      if (state.stopping) return;
      state.stopping = true;
      log("info", "pi-host stopping");
      server.close();
      await binding.close();
      await terminal?.closeAll();
      plans.dispose();
      await runtime.dispose();
      await state.sidecar?.dispose();
      await state.host?.dispose();
      state.sidecar = null;
      state.host = null;
    },
  };
}
