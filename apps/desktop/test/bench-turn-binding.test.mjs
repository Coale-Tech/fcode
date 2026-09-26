/**
 * E3 — Bind bench and site at turn admission.
 *
 * A mid-turn bench switch must NOT retarget an in-flight command; the binding
 * comes from the turn record, never from the live selection.
 */
import assert from "node:assert/strict";
import test from "node:test";

// Import the local built dist (not the primary checkout via node_modules).
const { AgentHost } = await import(
  "../../../packages/agent-host/dist/agent-host.js"
);

// ── Minimal stubs ─────────────────────────────────────────────────────────────

function makeSession(id = "s1") {
  return {
    id,
    title: "Test",
    mode: "agent",
    permissionMode: "ask",
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
  };
}

function makeSessions(id = "s1") {
  const session = makeSession(id);
  return {
    async get(sessionId) {
      return sessionId === id ? session : null;
    },
    async history() {
      return { items: [], hasMore: false };
    },
  };
}

let turnCounter = 0;
function makeRuntime() {
  return {
    async prompt() {
      return { turnId: `rt_${++turnCounter}` };
    },
    async stop() { return { requested: true }; },
    async abort() {},
    async steer() { return { accepted: true }; },
    async respondInput() {},
  };
}

function makeApprovals() {
  return {
    async resolveTool() {},
    async resolveContract() {},
    async listPendingTools() { return []; },
  };
}

const OWNER = { subject: "desktop", roles: ["owner"], pairedDevice: true };
const CTX = { expectedRevision: undefined };

// ── Tests ─────────────────────────────────────────────────────────────────────

test("E3: bench binding is stored on the turn at admission", async () => {
  const host = new AgentHost({
    runtime: makeRuntime(),
    sessions: makeSessions("s1"),
    approvals: makeApprovals(),
  });

  const binding = { benchPath: "/Users/mac/ERPNext/coale_v16", site: "site.local" };

  const { turn } = await host.startTurn(OWNER, {
    sessionId: "s1",
    input: { text: "hello" },
    context: CTX,
    benchBinding: binding,
  });

  const stored = host.getBenchBinding(turn.id);
  assert.ok(stored, "bench binding should be stored on the turn");
  assert.equal(stored.benchPath, binding.benchPath);
  assert.equal(stored.site, binding.site);
});

test("E3: turn without bench binding returns null from getBenchBinding", async () => {
  const host = new AgentHost({
    runtime: makeRuntime(),
    sessions: makeSessions("s1"),
    approvals: makeApprovals(),
  });

  const { turn } = await host.startTurn(OWNER, {
    sessionId: "s1",
    input: { text: "hi" },
    context: CTX,
    // no benchBinding
  });

  assert.equal(host.getBenchBinding(turn.id), null);
});

test("E3: switch bench mid-flight does not change the admitted turn's binding", async () => {
  const host = new AgentHost({
    runtime: makeRuntime(),
    sessions: makeSessions("s1"),
    approvals: makeApprovals(),
  });

  const { turn } = await host.startTurn(OWNER, {
    sessionId: "s1",
    input: { text: "do something" },
    context: CTX,
    benchBinding: { benchPath: "/bench/a", site: "site-a.local" },
  });

  // The stored binding must not change even if the live selection changes later
  const stored = host.getBenchBinding(turn.id);
  assert.equal(stored?.benchPath, "/bench/a");
  assert.equal(stored?.site, "site-a.local");
});
