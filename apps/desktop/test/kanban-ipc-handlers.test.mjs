/**
 * Renderer↔main contract for kanban IPC: the shapes api.ts consumes.
 * Regression: settings toggle was a no-op (handler read the wrong envelope and
 * reset every unspecified field to defaults).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { registerKanbanIpc } = await import("../electron/main/ipc/kanban-ipc.ts");
const { emptyBoard } = await import("../electron/main/runtime/kanban-core.ts");
const { IPC } = await import("../../../packages/shared/src/protocol.ts");

function setup(initial) {
  const handlers = new Map();
  let settings = { enabled: false, maxInProgress: 2, maxRuntimeSeconds: 1800, maxAgentCardsPerSession: 20, maxDailySpawns: 20, ...initial };
  let board = emptyBoard();
  let paused = false;
  let changed = 0;
  registerKanbanIpc({
    registrar: { handle: (ch, fn) => handlers.set(ch, fn) },
    getBoard: () => board,
    saveBoard: (b) => { board = b; },
    getSettings: () => settings,
    saveSettings: (s) => { settings = s; },
    runner: { pause: (p) => { paused = p; }, isPaused: () => paused, tick: async () => {} },
    sendChanged: () => { changed++; },
  });
  return { call: (ch, arg) => handlers.get(ch)(arg), get: () => ({ settings, changed, paused }) };
}

test("settings get returns {settings}; enabling one field keeps the rest and notifies the renderer", async () => {
  const k = setup({ maxInProgress: 5 });
  assert.equal((await k.call(IPC.invoke.kanbanSettingsGet)).settings.enabled, false);
  const res = await k.call(IPC.invoke.kanbanSettingsSet, { settings: { enabled: true } });
  assert.equal(res.settings.enabled, true);
  assert.equal(res.settings.maxInProgress, 5);
  assert.equal(k.get().settings.enabled, true);
  assert.equal(k.get().changed, 1);
});

test("list returns {board, paused}; pause takes {paused}", async () => {
  const k = setup();
  await k.call(IPC.invoke.kanbanSetPaused, { paused: true });
  const res = await k.call(IPC.invoke.kanbanList);
  assert.deepEqual(res.board.tasks, []);
  assert.equal(res.paused, true);
});

test("create then move returns the updated board", async () => {
  const k = setup();
  const { taskId } = await k.call(IPC.invoke.kanbanCreate, { title: "t", body: "", projectPath: "/p" });
  const { board } = await k.call(IPC.invoke.kanbanMove, { taskId, status: "blocked" });
  assert.equal(board.tasks.find((t) => t.id === taskId).status, "blocked");
  const { runs } = await k.call(IPC.invoke.kanbanListRuns, { taskId });
  assert.deepEqual(runs, []);
});
