/**
 * T14 — bench reveal IPC: benchReveal handler rejects non-bench paths,
 * accepts known bench roots, calls revealPath exactly once.
 *
 * Behavioral: all checks operate on handler return values and call counts;
 * no source-text pins.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { register } from "node:module";
import { dirname, join as pjoin } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(pjoin(here, "helpers/ts-import-hooks.mjs")));

// Build a minimal bench directory (needs a Procfile so discoverBenches finds it)
function makeBench(root, name = "my_bench") {
  const benchPath = join(root, name);
  mkdirSync(join(benchPath, "sites"), { recursive: true });
  mkdirSync(join(benchPath, "apps"), { recursive: true });
  writeFileSync(join(benchPath, "Procfile"), "web: gunicorn\n");
  return benchPath;
}

test("benchReveal returns ok=false for an unknown path", async () => {
  const root = mkdtempSync(join(tmpdir(), "bench-reveal-test-"));
  const revealCalls = [];
  try {
    // Register a bench but reveal a different path
    const knownPath = makeBench(root, "coale_v16");
    const { registerBenchIpc } = await import("../electron/main/ipc/bench-ipc.ts");
    const handlers = new Map();
    const registrar = { handle: (ch, fn) => handlers.set(ch, fn) };
    registerBenchIpc({
      registrar,
      mainWindow: () => null,
      discover: async () => ({ benches: [{ path: knownPath, id: "x", version: 16, sites: [], apps: [] }], failedRoots: [] }),
      revealPath: (p) => revealCalls.push(p),
    });
    const benchReveal = handlers.get("pi-desktop/bench/revealPath");
    assert.ok(benchReveal, "benchReveal handler registered");
    const result = await benchReveal({ benchPath: "/some/other/path" });
    assert.equal(result.ok, false);
    assert.equal(revealCalls.length, 0, "revealPath not called for unknown path");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("benchReveal returns ok=true and calls revealPath for a known bench root", async () => {
  const root = mkdtempSync(join(tmpdir(), "bench-reveal-test-"));
  const revealCalls = [];
  try {
    const knownPath = makeBench(root, "coale_v16");
    const { registerBenchIpc } = await import("../electron/main/ipc/bench-ipc.ts");
    const handlers = new Map();
    const registrar = { handle: (ch, fn) => handlers.set(ch, fn) };
    registerBenchIpc({
      registrar,
      mainWindow: () => null,
      discover: async () => ({ benches: [{ path: knownPath, id: "x", version: 16, sites: [], apps: [] }], failedRoots: [] }),
      revealPath: (p) => revealCalls.push(p),
    });
    const benchReveal = handlers.get("pi-desktop/bench/revealPath");
    const result = await benchReveal({ benchPath: knownPath });
    assert.equal(result.ok, true);
    assert.equal(revealCalls.length, 1);
    assert.equal(revealCalls[0], knownPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
