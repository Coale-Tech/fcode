/**
 * Tests for bench-ipc.ts's benchStart conflict guard.
 *
 * BenchSupervisor supervises exactly one bench at a time. Without a
 * conflict check, selecting bench B while bench A is running and clicking
 * Start silently reported { started: true } without starting B at all —
 * the renderer had no way to tell the user "stop A first" (cross-bench
 * Start bug). benchStart must surface CONFLICT when the supervisor reports
 * a different active bench, mirroring the benchStop identity guard.
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
  return handlers.get(IPC.invoke.benchStart);
}

test("benchStart refuses to start a different bench than the one active (cross-bench Start bug)", async () => {
  const start = registerAndCapture();

  benchSupervisor.activeBenchPath = "/benches/a";
  benchSupervisor.start = async () => ({ conflict: true });

  await assert.rejects(
    () => start({ benchPath: "/benches/b" }),
    (err) => err.errorCode === "CONFLICT",
  );
});

test("benchStart succeeds when the supervisor reports no conflict for the same active bench", async () => {
  const start = registerAndCapture();

  benchSupervisor.activeBenchPath = "/benches/a";
  benchSupervisor.start = async () => ({ conflict: false });

  const result = await start({ benchPath: "/benches/a" });
  assert.deepEqual(result, { started: true });
});

test("benchStart succeeds starting a fresh bench when none is active", async () => {
  const start = registerAndCapture();

  benchSupervisor.activeBenchPath = null;
  benchSupervisor.start = async () => ({ conflict: false });

  const result = await start({ benchPath: "/benches/a" });
  assert.deepEqual(result, { started: true });
});

test("benchStart requires benchPath", async () => {
  const start = registerAndCapture();

  await assert.rejects(
    () => start({}),
    (err) => err.errorCode === "INVALID_ARGUMENT",
  );
});
