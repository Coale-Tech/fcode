/**
 * Scheduled tasks export/import: the round trip api.ts drives through the
 * save/open dialogs. Cancelled dialogs are null, a non-array file is refused
 * before it reaches the host, and the host receives the exported array as-is.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { registerScheduledIpc } = await import("../electron/main/ipc/scheduled-ipc.ts");
const { IPC } = await import("../../../packages/shared/src/protocol.ts");

function setup({ exportPath = null, importPath = null } = {}) {
  const handlers = new Map();
  const calls = [];
  const tasks = [{ id: "t1", title: "Nightly", prompt: "run tests", cadence: "daily" }];
  const host = {
    call: async (method, params) => {
      calls.push({ method, params });
      if (method === "scheduled.list") return { tasks };
      if (method === "scheduled.import") return { imported: params.tasks.length };
      throw new Error(`unexpected ${method}`);
    },
  };
  registerScheduledIpc({
    registrar: { handle: (ch, fn) => handlers.set(ch, fn) },
    getHost: () => host,
    scheduledRunsBySession: new Map(),
    invoke: async () => undefined,
    isQuitting: () => false,
    pickExportPath: async () => exportPath,
    pickImportPath: async () => importPath,
  });
  return { call: (ch) => handlers.get(ch)(), calls, tasks };
}

test("export writes every task to the picked file and reports the count", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "sched-")), "out.json");
  const s = setup({ exportPath: path });
  assert.deepEqual(await s.call(IPC.invoke.scheduledExport), { path, count: 1 });
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), s.tasks);
});

test("cancelled dialogs return null and never import", async () => {
  const s = setup();
  assert.equal(await s.call(IPC.invoke.scheduledExport), null);
  assert.equal(await s.call(IPC.invoke.scheduledImport), null);
  assert.equal(s.calls.some((c) => c.method === "scheduled.import"), false);
});

test("import forwards the exported array to the host, paused", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "sched-")), "in.json");
  writeFileSync(path, JSON.stringify([{ id: "t9", prompt: "p", enabled: true }]));
  const s = setup({ importPath: path });
  assert.deepEqual(await s.call(IPC.invoke.scheduledImport), { imported: 1 });
  assert.deepEqual(s.calls.at(-1), {
    method: "scheduled.import",
    params: { tasks: [{ id: "t9", prompt: "p", enabled: false }] },
  });
});

test("import refuses a file that is not a JSON array", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "sched-")), "bad.json");
  writeFileSync(path, JSON.stringify({ id: "t1" }));
  const s = setup({ importPath: path });
  await assert.rejects(s.call(IPC.invoke.scheduledImport), /JSON array/);
  assert.equal(s.calls.some((c) => c.method === "scheduled.import"), false);
});
