/**
 * Bench list "Show in Finder" / "Browse all in Finder": the reveal channel
 * opens paths at or under a bench root and refuses anything else.
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

test("benchReveal reveals bench roots and benches, refuses other paths", async (t) => {
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
  mkdirSync(bench);

  const revealed = [];
  const handlers = new Map();
  registerBenchIpc({
    registrar: { handle: (channel, fn) => handlers.set(channel, fn) },
    mainWindow: () => null,
    revealPath: (path) => revealed.push(path),
  });
  const reveal = handlers.get(IPC.invoke.benchReveal);

  assert.deepEqual(await reveal({ path: bench }), { ok: true });
  assert.deepEqual(await reveal({ path: root }), { ok: true });
  assert.deepEqual(revealed, [bench, root]);

  await assert.rejects(reveal({ path: outside }), /not under a bench root/);
  await assert.rejects(reveal({ path: `${root}-sibling` }), /not under a bench root/);
  await assert.rejects(reveal({ path: "" }), /not under a bench root/);
  assert.equal(revealed.length, 2);
});
