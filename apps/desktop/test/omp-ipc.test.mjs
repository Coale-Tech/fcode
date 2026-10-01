/**
 * Boundary tests for omp-ipc.ts IPC handlers (DX14 / plan §9).
 *
 * Covers only the trust-boundary behaviours that can break for consumers:
 *  - AGENT_UNAVAILABLE when the sidecar is null (sidecar not started yet)
 *  - INVALID_ARGUMENT rejection of bad params; sidecar must NOT be reached
 *
 * Pattern follows build-ipc.test.mjs:
 *   register ts-import-hooks → import TS sources → drive handlers directly.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { IPC } = await import("@pi-desktop/shared");
const { registerOmpIpc } = await import("../electron/main/ipc/omp-ipc.ts");

/** Fake sidecar that fails if called (proves the handler rejected before reaching the sidecar). */
function unreachableSidecar() {
  return {
    call: async () => { assert.fail("sidecar must not be reached on bad input"); },
  };
}

function setup(sidecar = null) {
  const handlers = new Map();
  registerOmpIpc({
    registrar: { handle: (ch, fn) => handlers.set(ch, fn) },
    getSidecar: () => sidecar,
  });
  return handlers;
}

// ── AGENT_UNAVAILABLE ─────────────────────────────────────────────────────────

test("no-input handlers throw AGENT_UNAVAILABLE when sidecar is null", async () => {
  const handlers = setup(null);
  const nullInputChannels = [
    IPC.invoke.ompModelsList,
    IPC.invoke.ompThinkingLevels,
    IPC.invoke.ompCommandsList,
    IPC.invoke.ompState,
    IPC.invoke.ompLoginProviders,
  ];
  for (const ch of nullInputChannels) {
    await assert.rejects(handlers.get(ch)(), (err) => {
      assert.equal(err.errorCode, "AGENT_UNAVAILABLE", `${ch} must throw AGENT_UNAVAILABLE`);
      return true;
    });
  }
});

test("input-required handlers throw AGENT_UNAVAILABLE when sidecar is null (valid input supplied)", async () => {
  const handlers = setup(null);
  const cases = [
    [IPC.invoke.ompModelsSet, { provider: "anthropic", modelId: "claude-sonnet-4-5" }],
    [IPC.invoke.ompThinkingSet, { level: "high" }],
    [IPC.invoke.ompLoginStart, { providerId: "anthropic" }],
    [IPC.invoke.ompSessionBranch, { entryId: "entry-1" }],
    [IPC.invoke.ompSessionRename, { name: "Renamed" }],
    [IPC.invoke.ompAutoCompactionSet, { enabled: true }],
  ];
  for (const [ch, input] of cases) {
    await assert.rejects(handlers.get(ch)(input), (err) => {
      assert.equal(err.errorCode, "AGENT_UNAVAILABLE", `${ch} must throw AGENT_UNAVAILABLE`);
      return true;
    });
  }
});

// ── INVALID_ARGUMENT — sidecar must not be reached ───────────────────────────

test("ompModelsSet rejects missing provider without calling sidecar", async () => {
  const handlers = setup(unreachableSidecar());
  await assert.rejects(
    handlers.get(IPC.invoke.ompModelsSet)({ modelId: "claude-sonnet-4-5" }),
    (err) => { assert.equal(err.errorCode, "INVALID_ARGUMENT"); return true; },
  );
});

test("ompModelsSet rejects missing modelId without calling sidecar", async () => {
  const handlers = setup(unreachableSidecar());
  await assert.rejects(
    handlers.get(IPC.invoke.ompModelsSet)({ provider: "anthropic" }),
    (err) => { assert.equal(err.errorCode, "INVALID_ARGUMENT"); return true; },
  );
});

test("ompThinkingSet rejects missing level without calling sidecar", async () => {
  const handlers = setup(unreachableSidecar());
  await assert.rejects(
    handlers.get(IPC.invoke.ompThinkingSet)({}),
    (err) => { assert.equal(err.errorCode, "INVALID_ARGUMENT"); return true; },
  );
});

test("ompLoginStart rejects missing providerId without calling sidecar", async () => {
  const handlers = setup(unreachableSidecar());
  await assert.rejects(
    handlers.get(IPC.invoke.ompLoginStart)({}),
    (err) => { assert.equal(err.errorCode, "INVALID_ARGUMENT"); return true; },
  );
});

test("ompSessionBranch rejects missing entryId without calling sidecar", async () => {
  const handlers = setup(unreachableSidecar());
  await assert.rejects(
    handlers.get(IPC.invoke.ompSessionBranch)({}),
    (err) => { assert.equal(err.errorCode, "INVALID_ARGUMENT"); return true; },
  );
});

test("ompSessionRename rejects missing name without calling sidecar", async () => {
  const handlers = setup(unreachableSidecar());
  await assert.rejects(
    handlers.get(IPC.invoke.ompSessionRename)({}),
    (err) => { assert.equal(err.errorCode, "INVALID_ARGUMENT"); return true; },
  );
});

test("ompAutoCompactionSet rejects non-boolean enabled without calling sidecar", async () => {
  const handlers = setup(unreachableSidecar());
  for (const bad of [{}, { enabled: "true" }, { enabled: 1 }, { enabled: null }]) {
    await assert.rejects(
      handlers.get(IPC.invoke.ompAutoCompactionSet)(bad),
      (err) => { assert.equal(err.errorCode, "INVALID_ARGUMENT"); return true; },
    );
  }
});
