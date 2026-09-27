/**
 * Tests for bench-ipc.ts's benchStop identity guard.
 *
 * BenchSupervisor supervises exactly one bench at a time. Without an
 * identity check, a renderer that has bench B selected while bench A is
 * still running would send a bare benchStop and kill A instead of B
 * (cross-bench Stop bug). benchStop must require the caller's expected
 * benchPath and refuse when it does not match the supervisor's actual
 * active bench.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { IPC } = await import("@pi-desktop/shared");
const { registerBenchIpc } = await import("../electron/main/ipc/bench-ipc.ts");
const { benchSupervisor } = await import("../electron/main/bench/supervisor.ts");

function registerAndCapture() {
  const handlers = new Map();
  const registrar = { handle: (channel, fn) => handlers.set(channel, fn) };
  registerBenchIpc({ registrar, mainWindow: () => null });
  return handlers.get(IPC.invoke.benchStop);
}

test("benchStop refuses to stop a different bench than the one active (cross-bench Stop bug)", async () => {
  const stop = registerAndCapture();

  benchSupervisor.activeBenchPath = "/benches/a";
  let stopCalled = false;
  benchSupervisor.stop = () => {
    stopCalled = true;
  };

  await assert.rejects(
    () => stop({ benchPath: "/benches/b" }),
    (err) => err.errorCode === "CONFLICT",
  );
  assert.equal(stopCalled, false, "must not stop bench A while trying to stop B");
  assert.equal(benchSupervisor.activeBenchPath, "/benches/a", "bench A is still active");
});

test("benchStop stops the bench when benchPath matches the active bench", async () => {
  const stop = registerAndCapture();

  benchSupervisor.activeBenchPath = "/benches/a";
  let stopCalled = false;
  benchSupervisor.stop = () => {
    stopCalled = true;
  };

  const result = await stop({ benchPath: "/benches/a" });
  assert.equal(stopCalled, true);
  assert.deepEqual(result, { stopped: true });
});

test("benchStop requires benchPath", async () => {
  const stop = registerAndCapture();

  await assert.rejects(
    () => stop({}),
    (err) => err.errorCode === "INVALID_ARGUMENT",
  );
});
