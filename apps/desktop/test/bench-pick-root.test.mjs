/**
 * The Bench page's "Choose bench folder…": a new install has no ~/ERPNext,
 * so the user points Fcode at the folder holding their benches. The choice
 * must survive a restart and be the folder benchStart validates against.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { IPC } = await import("@pi-desktop/shared");
const { registerBenchIpc } = await import("../electron/main/ipc/bench-ipc.ts");
const { benchSupervisor } = await import("../electron/main/bench/supervisor.ts");

function makeBench(root, name) {
  const bench = join(root, name);
  mkdirSync(join(bench, "apps", "frappe", "frappe"), { recursive: true });
  writeFileSync(join(bench, "apps", "frappe", "frappe", "__init__.py"), '__version__ = "16.1.0"\n');
  mkdirSync(join(bench, "sites", "s.local"), { recursive: true });
  writeFileSync(join(bench, "sites", "s.local", "site_config.json"), "{}");
  return bench;
}

function registerWith(dataDir, picked) {
  const handlers = new Map();
  registerBenchIpc({
    registrar: { handle: (channel, fn) => handlers.set(channel, fn) },
    mainWindow: () => null,
    dataDir,
    pickDirectory: async () => picked,
  });
  return (channel, ...args) => handlers.get(channel)(...args);
}

test("a picked bench folder is saved, rediscovered after restart, and startable", async (t) => {
  const savedEnv = process.env.FCODE_BENCH_ROOTS;
  delete process.env.FCODE_BENCH_ROOTS;
  const dataDir = mkdtempSync(join(tmpdir(), "bench-pick-data-"));
  const benchesDir = mkdtempSync(join(tmpdir(), "bench-pick-root-"));
  t.after(() => {
    if (savedEnv !== undefined) process.env.FCODE_BENCH_ROOTS = savedEnv;
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(benchesDir, { recursive: true, force: true });
  });
  const bench = makeBench(benchesDir, "mybench");

  // Cancelling the picker changes nothing.
  const cancelled = await registerWith(dataDir, null)(IPC.invoke.benchPickRoot);
  assert.deepEqual(cancelled, { canceled: true });

  const picked = await registerWith(dataDir, benchesDir)(IPC.invoke.benchPickRoot);
  assert.equal(picked.canceled, false);
  assert.deepEqual(picked.roots, [benchesDir]);
  assert.deepEqual(picked.benches.map((b) => b.path), [bench]);

  // A fresh registration (app restart) reads the saved folder.
  const call = registerWith(dataDir, null);
  const listed = await call(IPC.invoke.benchList);
  assert.deepEqual(listed.roots, [benchesDir]);
  assert.deepEqual(listed.benches.map((b) => b.path), [bench]);

  benchSupervisor.activeBenchPath = null;
  benchSupervisor.start = async () => ({ conflict: false });
  assert.deepEqual(await call(IPC.invoke.benchStart, { benchPath: bench }), { started: true });
});
