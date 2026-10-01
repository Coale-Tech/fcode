/**
 * Boundary tests for session-modes:
 *  1. event → system-line mapping (systemLineText + SYSTEM_LINE_EVENTS)
 *  2. mode enum validation in omp-ipc.ts handlers
 *  3. queue-modes yaml generation in makeOmpOverlay
 *  4. new IPC channels are declared in protocol.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register, registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Stub Electron so `import { shell } from "electron"` works in Node.js test env.
const electronStub = `data:text/javascript,${encodeURIComponent(`
  export const shell = { showItemInFolder: () => {} };
`)}`;
registerHooks({
  resolve(specifier, context, next) {
    return specifier === "electron"
      ? { url: electronStub, shortCircuit: true }
      : next(specifier, context);
  },
});
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { IPC } = await import("@pi-desktop/shared");
const { validateOmpSettings } = await import("../electron/main/omp-settings-config.ts");
const { makeOmpOverlay } = await import("../../../packages/omp-bridge/src/bridge.ts");
const { registerOmpIpc } = await import("../electron/main/ipc/omp-ipc.ts");

const BASE_OPTS = {
  dataDir: "/tmp/fcode-test",
  resourcesPath: "/tmp/resources",
  screenshotsDir: "/tmp/fcode-test/screenshots",
};

function setup(sidecar = null) {
  const handlers = new Map();
  registerOmpIpc({
    registrar: { handle: (ch, fn) => handlers.set(ch, fn) },
    getSidecar: () => sidecar,
  });
  return handlers;
}

// ── IPC channels are declared ───────────────────────────────────────────────

test("protocol declares all new session-mode channels", () => {
  const expected = [
    "ompModesSetSteeringMode",
    "ompModesSetFollowUpMode",
    "ompModesSetInterruptMode",
    "ompFastSet",
    "ompRetrySetAutoRetry",
    "ompRetryAbort",
    "agentFollowUp",
    "agentAbortAndPrompt",
    "ompCycleModel",
    "ompCycleThinkingLevel",
  ];
  for (const key of expected) {
    assert.ok(IPC.invoke[key], `IPC.invoke.${key} must be declared`);
  }
});

// ── Mode enum validation ────────────────────────────────────────────────────

test("ompModesSetSteeringMode rejects invalid mode", async () => {
  const handlers = setup({ call: async () => {} });
  await assert.rejects(
    handlers.get(IPC.invoke.ompModesSetSteeringMode)({ mode: "unknown" }),
    (err) => {
      assert.equal(err.errorCode, "INVALID_ARGUMENT");
      return true;
    },
  );
});

test("ompModesSetSteeringMode accepts 'all'", async () => {
  let calledWith;
  const handlers = setup({
    call: async (method, params) => { calledWith = { method, params }; },
  });
  await handlers.get(IPC.invoke.ompModesSetSteeringMode)({ mode: "all" });
  assert.equal(calledWith.method, "omp.modes.setSteeringMode");
  assert.equal(calledWith.params.mode, "all");
});

test("ompModesSetSteeringMode accepts 'one-at-a-time'", async () => {
  let calledWith;
  const handlers = setup({
    call: async (method, params) => { calledWith = { method, params }; },
  });
  await handlers.get(IPC.invoke.ompModesSetSteeringMode)({ mode: "one-at-a-time" });
  assert.equal(calledWith.params.mode, "one-at-a-time");
});

test("ompModesSetFollowUpMode rejects invalid mode", async () => {
  const handlers = setup({ call: async () => {} });
  await assert.rejects(
    handlers.get(IPC.invoke.ompModesSetFollowUpMode)({ mode: "bad" }),
    (err) => { assert.equal(err.errorCode, "INVALID_ARGUMENT"); return true; },
  );
});

test("ompModesSetInterruptMode rejects invalid mode", async () => {
  const handlers = setup({ call: async () => {} });
  await assert.rejects(
    handlers.get(IPC.invoke.ompModesSetInterruptMode)({ mode: "now" }),
    (err) => { assert.equal(err.errorCode, "INVALID_ARGUMENT"); return true; },
  );
});

test("ompModesSetInterruptMode accepts 'immediate' and 'wait'", async () => {
  const calls = [];
  const handlers = setup({
    call: async (method, params) => calls.push({ method, params }),
  });
  await handlers.get(IPC.invoke.ompModesSetInterruptMode)({ mode: "immediate" });
  await handlers.get(IPC.invoke.ompModesSetInterruptMode)({ mode: "wait" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].params.mode, "immediate");
  assert.equal(calls[1].params.mode, "wait");
});

test("ompFastSet rejects non-boolean", async () => {
  const handlers = setup({ call: async () => {} });
  await assert.rejects(
    handlers.get(IPC.invoke.ompFastSet)({ enabled: "yes" }),
    (err) => { assert.equal(err.errorCode, "INVALID_ARGUMENT"); return true; },
  );
});

test("agentFollowUp rejects missing sessionId", async () => {
  const handlers = setup({ call: async () => {} });
  await assert.rejects(
    handlers.get(IPC.invoke.agentFollowUp)({ content: "hello" }),
    (err) => { assert.equal(err.errorCode, "INVALID_ARGUMENT"); return true; },
  );
});

test("agentFollowUp rejects missing content", async () => {
  const handlers = setup({ call: async () => {} });
  await assert.rejects(
    handlers.get(IPC.invoke.agentFollowUp)({ sessionId: "s1", content: "" }),
    (err) => { assert.equal(err.errorCode, "INVALID_ARGUMENT"); return true; },
  );
});

// ── omp-settings schema: queue mode keys ───────────────────────────────────

test("validateOmpSettings accepts steeringMode 'all'", () => {
  const result = validateOmpSettings({ steeringMode: "all" });
  assert.equal(result.steeringMode, "all");
});

test("validateOmpSettings accepts steeringMode 'one-at-a-time'", () => {
  const result = validateOmpSettings({ steeringMode: "one-at-a-time" });
  assert.equal(result.steeringMode, "one-at-a-time");
});

test("validateOmpSettings rejects unknown steeringMode value", () => {
  assert.throws(
    () => validateOmpSettings({ steeringMode: "immediate" }),
    /invalid value/,
  );
});

test("validateOmpSettings accepts followUpMode 'one-at-a-time'", () => {
  const result = validateOmpSettings({ followUpMode: "one-at-a-time" });
  assert.equal(result.followUpMode, "one-at-a-time");
});

test("validateOmpSettings accepts interruptMode 'immediate'", () => {
  const result = validateOmpSettings({ interruptMode: "immediate" });
  assert.equal(result.interruptMode, "immediate");
});

test("validateOmpSettings accepts interruptMode 'wait'", () => {
  const result = validateOmpSettings({ interruptMode: "wait" });
  assert.equal(result.interruptMode, "wait");
});

test("validateOmpSettings rejects bad interruptMode", () => {
  assert.throws(
    () => validateOmpSettings({ interruptMode: "now" }),
    /invalid value/,
  );
});

test("validateOmpSettings accepts loop.mode 'compact'", () => {
  const result = validateOmpSettings({ "loop.mode": "compact" });
  assert.equal(result["loop.mode"], "compact");
});

test("validateOmpSettings rejects unknown loop.mode value", () => {
  assert.throws(
    () => validateOmpSettings({ "loop.mode": "auto" }),
    /invalid value/,
  );
});

// ── Overlay YAML generation for queue modes ─────────────────────────────────

test("makeOmpOverlay emits steeringMode in YAML", () => {
  const yaml = makeOmpOverlay({
    ...BASE_OPTS,
    ompSettings: { steeringMode: "all" },
  });
  assert.ok(yaml.includes("steeringMode: all"), `expected steeringMode in:\n${yaml}`);
});

test("makeOmpOverlay emits followUpMode in YAML", () => {
  const yaml = makeOmpOverlay({
    ...BASE_OPTS,
    ompSettings: { followUpMode: "all" },
  });
  assert.ok(yaml.includes("followUpMode: all"), `expected followUpMode in:\n${yaml}`);
});

test("makeOmpOverlay emits interruptMode in YAML", () => {
  const yaml = makeOmpOverlay({
    ...BASE_OPTS,
    ompSettings: { interruptMode: "wait" },
  });
  assert.ok(yaml.includes("interruptMode: wait"), `expected interruptMode in:\n${yaml}`);
});

test("makeOmpOverlay emits loop.mode under 'loop:' section in YAML", () => {
  const yaml = makeOmpOverlay({
    ...BASE_OPTS,
    ompSettings: { "loop.mode": "compact" },
  });
  assert.ok(yaml.includes("loop:"), `expected 'loop:' section in:\n${yaml}`);
  assert.ok(yaml.includes("  mode: compact"), `expected 'mode: compact' in:\n${yaml}`);
});

test("makeOmpOverlay omits queue-mode keys when not set", () => {
  const yaml = makeOmpOverlay({ ...BASE_OPTS, ompSettings: {} });
  assert.ok(!yaml.includes("steeringMode"), "should not emit steeringMode when unset");
  assert.ok(!yaml.includes("loop:"), "should not emit loop section when unset");
});
