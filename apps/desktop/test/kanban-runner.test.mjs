import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const {
  emptyBoard,
  createTask,
  claimTask,
} = await import("../electron/main/runtime/kanban-core.ts");

const { createKanbanRunner } = await import("../electron/main/runtime/kanban-runner.ts");

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRunner(overrides = {}) {
  let board = emptyBoard();
  const sessions = [];
  const prompts = [];
  const toasts = [];
  let enabled = true;
  let paused = false;

  const defaults = {
    getSettings: () => ({
      enabled,
      maxInProgress: 2,
      maxRuntimeSeconds: 1800,
      maxAgentCardsPerSession: 20,
      maxDailySpawns: 20,
    }),
    getBoard: () => board,
    saveBoard: (b) => { board = b; },
    createSession: async (input) => {
      const id = `session-${sessions.length}`;
      sessions.push({ id, ...input });
      return id;
    },
    prompt: async (sessionId, content) => {
      prompts.push({ sessionId, content });
    },
    sendToast: (msg) => toasts.push(msg),
    sendChanged: () => {},
    report: (err) => { throw err; },
  };

  const runner = createKanbanRunner({ ...defaults, ...overrides });
  return { runner, get board() { return board; }, set board(b) { board = b; }, sessions, prompts, toasts, setEnabled: (v) => { enabled = v; }, };
}

function addReadyTask(state, opts = {}) {
  const { board: next, taskId } = createTask(state.board, {
    title: opts.title ?? "Test task",
    body: "",
    projectPath: opts.projectPath ?? "/proj",
    createdBy: "user",
  });
  state.board = next;
  return taskId;
}

// ── Dispatcher: disabled ──────────────────────────────────────────────────────

test("disabled dispatcher claims nothing", async () => {
  const state = makeRunner();
  state.setEnabled(false);
  addReadyTask(state);
  await state.runner.tick();
  assert.equal(state.sessions.length, 0);
});

// ── Dispatcher: paused ────────────────────────────────────────────────────────

test("paused dispatcher claims nothing", async () => {
  const state = makeRunner();
  addReadyTask(state);
  state.runner.pause(true);
  await state.runner.tick();
  assert.equal(state.sessions.length, 0);
});

test("resuming paused dispatcher triggers tick", async () => {
  const state = makeRunner();
  addReadyTask(state);
  state.runner.pause(true);
  state.runner.pause(false);
  // tick is called async; wait a tick
  await new Promise((r) => setImmediate(r));
  assert.equal(state.sessions.length, 1);
});

// ── Dispatcher: maxInProgress ─────────────────────────────────────────────────

test("respects maxInProgress cap", async () => {
  const state = makeRunner({
    getSettings: () => ({ enabled: true, maxInProgress: 1, maxRuntimeSeconds: 1800, maxAgentCardsPerSession: 20, maxDailySpawns: 20 }),
  });
  addReadyTask(state, { projectPath: "/proj1" });
  addReadyTask(state, { projectPath: "/proj2" });
  await state.runner.tick();
  assert.equal(state.sessions.length, 1); // only one claimed
});

// ── Dispatcher: one dir at a time ─────────────────────────────────────────────

test("only one task per projectPath at a time (dir mode)", async () => {
  const state = makeRunner({
    getSettings: () => ({ enabled: true, maxInProgress: 5, maxRuntimeSeconds: 1800, maxAgentCardsPerSession: 20, maxDailySpawns: 20 }),
  });
  addReadyTask(state, { projectPath: "/same-dir" });
  addReadyTask(state, { projectPath: "/same-dir" });
  await state.runner.tick();
  assert.equal(state.sessions.length, 1);
});

// ── Dispatcher: daily cap ─────────────────────────────────────────────────────

test("daily spawn cap fires a toast and stops claiming", async () => {
  const state = makeRunner({
    getSettings: () => ({ enabled: true, maxInProgress: 5, maxRuntimeSeconds: 1800, maxAgentCardsPerSession: 20, maxDailySpawns: 2 }),
  });
  addReadyTask(state, { projectPath: "/p1" });
  addReadyTask(state, { projectPath: "/p2" });
  addReadyTask(state, { projectPath: "/p3" });
  await state.runner.tick();
  assert.equal(state.sessions.length, 2);
  assert.equal(state.toasts.some((t) => t.includes("daily spawn cap")), true);
});

// ── Turn-end nudge ────────────────────────────────────────────────────────────

test("first turn-end without kanban_complete sends nudge", async () => {
  const state = makeRunner();
  const taskId = addReadyTask(state);
  await state.runner.tick();
  assert.equal(state.sessions.length, 1);
  const sessionId = state.sessions[0].id;

  // Simulate turn-end without close
  state.runner.onTurnEnd(sessionId);
  await new Promise((r) => setImmediate(r));
  // Should have sent nudge prompt
  const nudges = state.prompts.filter((p) => p.sessionId === sessionId && p.content.includes("kanban_complete"));
  assert.ok(nudges.length >= 1, "expected at least one nudge prompt");
});

test("third turn-end blocks the task as gave_up", async () => {
  const state = makeRunner();
  const taskId = addReadyTask(state);
  await state.runner.tick();
  const sessionId = state.sessions[0].id;

  state.runner.onTurnEnd(sessionId); // nudge 1
  await new Promise((r) => setImmediate(r));
  state.runner.onTurnEnd(sessionId); // nudge 2
  await new Promise((r) => setImmediate(r));
  state.runner.onTurnEnd(sessionId); // gave_up
  await new Promise((r) => setImmediate(r));

  const task = state.board.tasks.find((t) => t.id === taskId);
  assert.equal(task.status, "blocked");
  assert.equal(task.blockKind, "gave_up");
});

// ── sessionToCard guard ───────────────────────────────────────────────────────

test("onTurnEnd for unknown session is a no-op", () => {
  const state = makeRunner();
  state.runner.onTurnEnd("unknown-session"); // must not throw
  assert.equal(state.board.tasks.length, 0);
});

// ── reclaimZombies ────────────────────────────────────────────────────────────

test("reclaimZombies moves running tasks with dead sessions back to ready", () => {
  const state = makeRunner();
  const taskId = addReadyTask(state);
  // Manually claim the task (simulate runner had claimed it)
  state.board = claimTask(state.board, taskId, "dead-session", "run-1");
  assert.equal(state.board.tasks.find((t) => t.id === taskId).status, "running");

  // Reclaim: live sessions set does NOT include "dead-session"
  state.runner.reclaimZombies(new Set(["some-other-session"]));
  assert.equal(state.board.tasks.find((t) => t.id === taskId).status, "ready");
  assert.equal(state.board.runs.find((r) => r.id === "run-1").status, "reclaimed");
});

test("reclaimZombies leaves live sessions alone", () => {
  const state = makeRunner();
  const taskId = addReadyTask(state);
  state.board = claimTask(state.board, taskId, "live-session", "run-1");
  state.runner.reclaimZombies(new Set(["live-session"]));
  assert.equal(state.board.tasks.find((t) => t.id === taskId).status, "running");
});
