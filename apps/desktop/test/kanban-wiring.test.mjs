/**
 * Regression: the dispatcher prompted via host.call("agent.prompt"), a method
 * the host does not have, so every worker crashed with PROMPT_FAILED.
 *
 * Workers also each own an omp process started in the card's folder: omp's cwd
 * is fixed at spawn, so that is what enforces the folder and allows several
 * workers at once.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { createKanbanWiring } = await import("../electron/main/runtime/kanban-wiring.ts");
const { createTask, emptyBoard } = await import("../electron/main/runtime/kanban-core.ts");
const { loadBoard, saveBoard } = await import("../electron/main/runtime/kanban-store.ts");
const { writeKanbanSettings } = await import("../electron/main/runtime/kanban-settings.ts");
const { IPC } = await import("../../../packages/shared/src/protocol.ts");

async function setup({ maxInProgress, folders }) {
  const dataDir = mkdtempSync(join(tmpdir(), "kanban-wiring-"));
  await writeKanbanSettings(dataDir, { enabled: true, maxInProgress, maxRuntimeSeconds: 1800, maxAgentCardsPerSession: 20, maxDailySpawns: 20 });
  let board = emptyBoard();
  for (const projectPath of folders) {
    board = createTask(board, { title: projectPath, body: "do it", projectPath, status: "ready", createdBy: "user" }).board;
  }
  await saveBoard(dataDir, board);

  const hostCalls = [];
  let nextId = 0;
  const host = { call: async (method) => { hostCalls.push(method); return { session: { id: `s${++nextId}` } }; } };
  const ipcCalls = [];
  // Like the real one, starting a session's worker twice is a no-op.
  const started = new Map();
  const released = [];
  const wiring = createKanbanWiring({
    dataDir, getHost: () => host, sendToRenderer() {}, logError() {},
    getLabels: () => ({ kanban: { notify: { blocked: "", done: "", dailyCap: "" } } }),
  });
  wiring.bindInvoke(async (channel, args) => { ipcCalls.push([channel, args]); });
  wiring.bindWorkers({
    start: async (sessionId, cwd) => { if (!started.has(sessionId)) started.set(sessionId, cwd); },
    release: async (sessionId) => { released.push(sessionId); },
  });
  return { dataDir, wiring, hostCalls, ipcCalls, started, released };
}

test("a ready card is prompted through the agentPrompt IPC handler, not the host", async () => {
  const { dataDir, wiring, hostCalls, ipcCalls } = await setup({ maxInProgress: 2, folders: ["/tmp"] });

  await wiring.kanbanRunner.tick();

  assert.deepEqual(hostCalls, ["session.create"]);
  assert.equal(ipcCalls.length, 1);
  assert.equal(ipcCalls[0][0], IPC.invoke.agentPrompt);
  assert.equal(ipcCalls[0][1][0].sessionId, "s1");
  assert.equal(loadBoard(dataDir).tasks[0].status, "running");
});

test("each worker gets its own omp process in its card's folder, before it is prompted", async () => {
  const { wiring, ipcCalls, started } = await setup({ maxInProgress: 2, folders: ["/work/a", "/work/b"] });

  await wiring.kanbanRunner.tick();

  assert.deepEqual([...started.values()].sort(), ["/work/a", "/work/b"]);
  assert.equal(ipcCalls.length, 2);
});

test("Max in progress limits how many workers run at once", async () => {
  const { wiring, started } = await setup({ maxInProgress: 1, folders: ["/work/a", "/work/b"] });

  await wiring.kanbanRunner.tick();

  assert.equal(started.size, 1);
});

test("a worker whose process cannot start is not prompted", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "kanban-wiring-"));
  await writeKanbanSettings(dataDir, { enabled: true, maxInProgress: 2, maxRuntimeSeconds: 1800, maxAgentCardsPerSession: 20, maxDailySpawns: 20 });
  await saveBoard(dataDir, createTask(emptyBoard(), { title: "t", body: "x", projectPath: "/work/a", status: "ready", createdBy: "user" }).board);
  const errors = [];
  const ipcCalls = [];
  const wiring = createKanbanWiring({
    dataDir, getHost: () => ({ call: async () => ({ session: { id: "s1" } }) }), sendToRenderer() {}, logError: (e) => errors.push(e),
    getLabels: () => ({ kanban: { notify: { blocked: "", done: "", dailyCap: "" } } }),
  });
  wiring.bindInvoke(async (channel, args) => { ipcCalls.push([channel, args]); });
  wiring.bindWorkers({ start: async () => { throw new Error("spawn failed"); }, release: async () => {} });

  await wiring.kanbanRunner.tick();

  assert.deepEqual(ipcCalls, []);
  assert.equal(errors.length > 0, true);
});
