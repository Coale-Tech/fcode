/**
 * Bench list "Show in Finder": the reveal channel opens only discovered bench
 * roots and refuses everything else.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { IPC } = await import("@pi-desktop/shared");
const { registerBenchIpc } = await import("../electron/main/ipc/bench-ipc.ts");

test("benchReveal reveals discovered benches, refuses other paths", async (t) => {
  const savedEnv = process.env.FCODE_BENCH_ROOTS;
  const root = mkdtempSync(join(tmpdir(), "bench-reveal-root-"));
  const outside = mkdtempSync(join(tmpdir(), "bench-reveal-outside-"));
  process.env.FCODE_BENCH_ROOTS = root;
  t.after(() => {
    if (savedEnv === undefined) delete process.env.FCODE_BENCH_ROOTS;
    else process.env.FCODE_BENCH_ROOTS = savedEnv;
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  const bench = join(root, "coale_v16");
  mkdirSync(join(bench, "apps"), { recursive: true });
  mkdirSync(join(bench, "sites"), { recursive: true });

  const revealed = [];
  const handlers = new Map();
  registerBenchIpc({
    registrar: { handle: (channel, fn) => handlers.set(channel, fn) },
    mainWindow: () => null,
    revealPath: (path) => revealed.push(path),
  });
  const reveal = handlers.get(IPC.invoke.benchReveal);

  assert.deepEqual(await reveal({ benchPath: bench }), { ok: true });
  assert.deepEqual(revealed, [bench]);

  for (const benchPath of [root, outside, `${bench}-sibling`, ""]) {
    assert.equal((await reveal({ benchPath })).ok, false);
  }
  assert.equal(revealed.length, 1);
});
