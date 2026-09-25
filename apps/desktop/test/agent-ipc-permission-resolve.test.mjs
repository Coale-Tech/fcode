import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { registerAgentIpc } = await import("../electron/main/ipc/agent-ipc.ts");
const { IPC } = await import("@pi-desktop/shared");

/** registerAgentIpc registers many channels; only toolResolvePermission is
 * exercised here, so every other dependency is a stub that throws if a test
 * accidentally reaches it. */
function mount({ host, agentHostBridge }) {
  const handlers = new Map();
  const registrar = {
    ipcMain: {},
    handle(channel, fn) {
      handlers.set(channel, fn);
    },
    handleWithEvent(channel, fn) {
      handlers.set(channel, fn);
    },
    assertMainWindowSender() {},
  };
  const unused = (name) => () => {
    throw new Error(`unexpected call: ${name}`);
  };
  registerAgentIpc({
    registrar,
    getHost: () => host,
    getSidecar: () => null,
    getAgentHostBridge: () => agentHostBridge,
    logger: { app: () => undefined },
    vendorOAuth: {},
    agentExtensions: {},
    cancelSessionTools: unused("cancelSessionTools"),
    persistenceOutbox: {},
    dataDir: "/tmp",
    activeTurns: new Map(),
    isTurnDispatchable: unused("isTurnDispatchable"),
    activeTurnUsages: new Map(),
    approvedExecutionIdsBySession: new Map(),
    claimedExecutionSessions: new Map(),
    resolveAgentRuntimeLaunch: unused("resolveAgentRuntimeLaunch"),
    acquireSessionOperation: unused("acquireSessionOperation"),
    finishTurn: unused("finishTurn"),
    lockAbortReason: unused("lockAbortReason"),
    finishApprovedExecution: unused("finishApprovedExecution"),
    dispatchApprovedPlan: unused("dispatchApprovedPlan"),
    dispatchExecutionForProposal: unused("dispatchExecutionForProposal"),
    emitAgentEvent: unused("emitAgentEvent"),
    setNotificationViewingSessionId: unused("setNotificationViewingSessionId"),
    optionalWorkspaceRoot: unused("optionalWorkspaceRoot"),
    composerCommandService: {},
    loadComposerTemplatesCached: unused("loadComposerTemplatesCached"),
  });
  return handlers.get(IPC.invoke.toolResolvePermission);
}

test("a bridge-origin permission resolves through the bridge alone when host-core is unavailable (E1)", async () => {
  const settled = [];
  const agentHostBridge = {
    agentHost: {
      approvals: {
        get: (id) => (id === "racp-1" ? { requestId: id } : undefined),
      },
    },
    settleApproval: (id, outcome) => settled.push({ id, outcome }),
  };
  const resolve = mount({ host: null, agentHostBridge });

  await assert.doesNotReject(resolve({ requestId: "racp-1", decision: "allow-once" }));
  assert.deepEqual(settled, [{ id: "racp-1", outcome: { decision: "allow-once" } }]);
});

test("a host-core-origin permission still routes through permissions.resolve (E1)", async () => {
  const settled = [];
  const hostCalls = [];
  const host = {
    async call(method, params) {
      hostCalls.push({ method, params });
      return { ok: true };
    },
  };
  const agentHostBridge = {
    agentHost: { approvals: { get: () => undefined } },
    settleApproval: (id, outcome) => settled.push({ id, outcome }),
  };
  const resolve = mount({ host, agentHostBridge });

  const result = await resolve({ requestId: "host-1", decision: "deny" });
  assert.deepEqual(result, { ok: true });
  assert.equal(hostCalls.length, 1);
  assert.equal(hostCalls[0].method, "permissions.resolve");
  assert.deepEqual(settled, [{ id: "host-1", outcome: { decision: "deny" } }]);
});

test("a host-core-origin permission still throws when host is unavailable (E1, unchanged behavior)", async () => {
  const agentHostBridge = {
    agentHost: { approvals: { get: () => undefined } },
    settleApproval: () => {},
  };
  const resolve = mount({ host: null, agentHostBridge });
  await assert.rejects(
    resolve({ requestId: "host-2", decision: "deny" }),
    /host unavailable/,
  );
});
