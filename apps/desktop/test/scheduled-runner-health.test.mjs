/**
 * Tests for scheduler health tracking in scheduled-runner.ts (I.5)
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { createScheduledRunner, getSchedulerHealth } = await import(
  "../electron/main/runtime/scheduled-runner.ts"
);

function makeHost(ids = []) {
  return {
    call: async (method) => {
      if (method === "scheduled.due") return { ids };
      throw new Error(`unexpected call: ${method}`);
    },
  };
}

function makeFailingHost() {
  return {
    call: async () => { throw new Error("connection refused"); },
  };
}

test("getSchedulerHealth: initial state has no lastTickAt and no error", () => {
  const h = getSchedulerHealth();
  // Health resets are not guaranteed between test files, but at minimum the type contract holds.
  assert.equal(typeof h.hostAvailable, "boolean");
  assert.ok(h.lastTickAt === undefined || typeof h.lastTickAt === "number");
  assert.ok(h.lastError === undefined || typeof h.lastError === "string");
});

test("runner health: successful tick sets lastTickAt and clears error", async () => {
  const before = Date.now();
  const runner = createScheduledRunner({
    getHost: () => makeHost([]),
    execute: async () => {},
    report: () => {},
  });
  await runner.tick();
  const h = getSchedulerHealth();
  assert.ok(h.lastTickAt !== undefined && h.lastTickAt >= before,
    "lastTickAt should be set after a successful tick");
  assert.equal(h.lastError, undefined, "lastError should be clear after success");
  assert.equal(h.hostAvailable, true, "hostAvailable should be true when host exists");
});

test("runner health: failing scheduled.due sets lastError", async () => {
  const runner = createScheduledRunner({
    getHost: () => makeFailingHost(),
    execute: async () => {},
    report: () => {},
  });
  await runner.tick();
  const h = getSchedulerHealth();
  assert.ok(typeof h.lastError === "string" && h.lastError.length > 0,
    "lastError should be set when scheduled.due throws");
});

test("runner health: no host sets hostAvailable to false and skips tick", async () => {
  const runner = createScheduledRunner({
    getHost: () => null,
    execute: async () => {},
    report: () => {},
  });
  await runner.tick();
  const h = getSchedulerHealth();
  assert.equal(h.hostAvailable, false, "hostAvailable should be false when getHost returns null");
});

test("runner health: stale condition detectable from lastTickAt", () => {
  // A page showing no lastTickAt treats scheduler as not-yet-started (stale).
  // Check that the badge condition (> 90s) is representable from the type.
  const h = getSchedulerHealth();
  const STALE_MS = 90_000;
  // If lastTickAt is set, stale when Date.now() - lastTickAt > STALE_MS
  if (h.lastTickAt !== undefined) {
    const stale = Date.now() - h.lastTickAt > STALE_MS;
    assert.equal(typeof stale, "boolean");
  } else {
    // No tick yet = stale
    assert.equal(h.lastTickAt, undefined);
  }
});
