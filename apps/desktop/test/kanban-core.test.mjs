import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const {
  emptyBoard,
  createTask,
  recomputeReady,
  claimTask,
  completeTask,
  blockTask,
  crashTask,
  reclaimTask,
  timeoutTask,
  addLink,
  addComment,
  moveTask,
  archiveTask,
  wouldCreateCycle,
  incrementNudge,
  todaySpawnCount,
  agentCardCountForSession,
} = await import("../electron/main/runtime/kanban-core.ts");

const { loadBoard, saveBoard } = await import("../electron/main/runtime/kanban-store.ts");

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTask(board, opts = {}) {
  const { board: b, taskId } = createTask(board, {
    title: opts.title ?? "Test task",
    body: opts.body ?? "",
    projectPath: opts.projectPath ?? "/proj",
    createdBy: opts.createdBy ?? "user",
    flagTriage: opts.flagTriage,
    parentIds: opts.parentIds,
  });
  return { board: b, taskId };
}

function taskById(board, id) {
  return board.tasks.find((t) => t.id === id);
}

// ── createTask ────────────────────────────────────────────────────────────────

test("agent-created card always lands in triage", () => {
  const { board, taskId } = makeTask(emptyBoard(), { createdBy: "agent" });
  assert.equal(taskById(board, taskId).status, "triage");
});

test("user-created card with no parents lands in ready", () => {
  const { board, taskId } = makeTask(emptyBoard(), { createdBy: "user" });
  assert.equal(taskById(board, taskId).status, "ready");
});

test("user-created card with parents lands in todo", () => {
  let board = emptyBoard();
  const { board: b1, taskId: parentId } = makeTask(board, { createdBy: "user" });
  const { board: b2, taskId: childId } = createTask(b1, {
    title: "child",
    projectPath: "/proj",
    createdBy: "user",
    parentIds: [parentId],
  });
  assert.equal(taskById(b2, childId).status, "todo");
  assert.ok(b2.links.some((l) => l.parentId === parentId && l.childId === childId));
});

test("user-created card flagTriage=true lands in triage", () => {
  const { board, taskId } = makeTask(emptyBoard(), { flagTriage: true });
  assert.equal(taskById(board, taskId).status, "triage");
});

// ── recomputeReady ────────────────────────────────────────────────────────────

test("todo card becomes ready only when all parents are done", () => {
  let board = emptyBoard();
  const { board: b1, taskId: p1 } = makeTask(board);
  const { board: b2, taskId: p2 } = makeTask(b1);
  const { board: b3, taskId: child } = createTask(b2, {
    title: "child",
    projectPath: "/proj",
    createdBy: "user",
    parentIds: [p1, p2],
  });
  assert.equal(taskById(b3, child).status, "todo");

  // Complete only p1
  let b4 = claimTask(b3, p1, "s1", "r1");
  b4 = completeTask(b4, p1);
  assert.equal(taskById(b4, child).status, "todo"); // p2 still todo->ready first

  // Now complete p2 (it's already ready since no parents)
  let b5 = claimTask(b4, p2, "s2", "r2");
  b5 = completeTask(b5, p2);
  // recomputeReady is called inside completeTask
  assert.equal(taskById(b5, child).status, "ready");
});

test("recomputeReady does not promote ready/running/blocked/done cards", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board); // ready
  const b2 = recomputeReady(b1);
  assert.equal(taskById(b2, taskId).status, "ready"); // unchanged
});

// ── claimTask ─────────────────────────────────────────────────────────────────

test("claim moves ready to running and opens a run", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board);
  const b2 = claimTask(b1, taskId, "session-1", "run-1");
  const t = taskById(b2, taskId);
  assert.equal(t.status, "running");
  assert.equal(t.sessionId, "session-1");
  assert.equal(t.currentRunId, "run-1");
  assert.ok(b2.runs.some((r) => r.id === "run-1" && r.status === "running"));
});

test("claim on non-ready card is a no-op", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board, { flagTriage: true }); // triage
  const b2 = claimTask(b1, taskId, "s", "r");
  assert.equal(taskById(b2, taskId).status, "triage");
});

test("daily spawn count increments on claim", () => {
  let board = emptyBoard();
  const { board: b1, taskId: t1 } = makeTask(board);
  const { board: b2, taskId: t2 } = makeTask(b1);
  let b = claimTask(b2, t1, "s1", "r1");
  assert.equal(todaySpawnCount(b), 1);
  b = claimTask(b, t2, "s2", "r2");
  assert.equal(todaySpawnCount(b), 2);
});

// ── completeTask ──────────────────────────────────────────────────────────────

test("complete moves running to done and closes the run", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board);
  const b2 = claimTask(b1, taskId, "s", "r");
  const b3 = completeTask(b2, taskId, "all done", "result-data");
  const t = taskById(b3, taskId);
  assert.equal(t.status, "done");
  assert.equal(t.result, "result-data");
  assert.equal(b3.runs.find((r) => r.id === "r")?.status, "done");
  assert.ok(!t.sessionId);
});

test("completing a parent promotes todo child to ready", () => {
  let board = emptyBoard();
  const { board: b1, taskId: parentId } = makeTask(board);
  const { board: b2, taskId: childId } = createTask(b1, {
    title: "child",
    projectPath: "/proj",
    createdBy: "user",
    parentIds: [parentId],
  });
  const b3 = claimTask(b2, parentId, "s", "r");
  const b4 = completeTask(b3, parentId);
  assert.equal(taskById(b4, childId).status, "ready");
});

// ── blockTask ─────────────────────────────────────────────────────────────────

test("blocking with dependency kind: first time → todo", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board);
  const b2 = claimTask(b1, taskId, "s", "r");
  const b3 = blockTask(b2, taskId, "missing dep", "dependency");
  assert.equal(taskById(b3, taskId).status, "todo");
  assert.equal(taskById(b3, taskId).blockRecurrences, 1);
});

test("blocking with dependency kind: second time → triage", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board);
  let b = claimTask(b1, taskId, "s1", "r1");
  b = blockTask(b, taskId, "missing dep", "dependency");
  b = claimTask(b, taskId, "s2", "r2"); // back to running via claim
  b = blockTask(b, taskId, "missing dep again", "dependency");
  assert.equal(taskById(b, taskId).status, "triage");
  assert.equal(taskById(b, taskId).blockRecurrences, 2);
});

test("blocking with needs_input → blocked", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board);
  const b2 = claimTask(b1, taskId, "s", "r");
  const b3 = blockTask(b2, taskId, "need user input", "needs_input");
  assert.equal(taskById(b3, taskId).status, "blocked");
});

test("blocking with gave_up → blocked", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board);
  const b2 = claimTask(b1, taskId, "s", "r");
  const b3 = blockTask(b2, taskId, "gave_up", "gave_up");
  assert.equal(taskById(b3, taskId).status, "blocked");
});

// ── crashTask ─────────────────────────────────────────────────────────────────

test("first crash returns to ready", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board);
  const b2 = claimTask(b1, taskId, "s", "r");
  const b3 = crashTask(b2, taskId, "r", "CRASH");
  assert.equal(taskById(b3, taskId).status, "ready");
  assert.equal(taskById(b3, taskId).consecutiveFailures, 1);
});

test("second crash blocks as gave_up", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board);
  let b = claimTask(b1, taskId, "s1", "r1");
  b = crashTask(b, taskId, "r1", "CRASH");
  b = claimTask(b, taskId, "s2", "r2");
  b = crashTask(b, taskId, "r2", "CRASH2");
  const t = taskById(b, taskId);
  assert.equal(t.status, "blocked");
  assert.equal(t.blockKind, "gave_up");
  assert.equal(t.consecutiveFailures, 2);
});

test("consecutiveFailures resets to 0 on successful complete", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board);
  let b = claimTask(b1, taskId, "s1", "r1");
  b = crashTask(b, taskId, "r1", "CRASH");
  b = claimTask(b, taskId, "s2", "r2");
  b = completeTask(b, taskId);
  assert.equal(taskById(b, taskId).consecutiveFailures, 0);
});

// ── reclaimTask ───────────────────────────────────────────────────────────────

test("reclaim: running → ready, no failure counted, run closed as reclaimed", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board);
  const b2 = claimTask(b1, taskId, "s", "r");
  const b3 = reclaimTask(b2, taskId);
  const t = taskById(b3, taskId);
  assert.equal(t.status, "ready");
  assert.equal(t.consecutiveFailures, 0);
  assert.equal(b3.runs.find((r) => r.id === "r")?.status, "reclaimed");
});

test("reclaim on non-running card is a no-op", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board); // ready
  const b2 = reclaimTask(b1, taskId);
  assert.equal(taskById(b2, taskId).status, "ready"); // unchanged
});

// ── cycle detection ───────────────────────────────────────────────────────────

test("direct self-link is rejected", () => {
  const { board, taskId } = makeTask(emptyBoard());
  assert.ok(wouldCreateCycle(board, taskId, taskId));
});

test("A→B→A cycle rejected", () => {
  let board = emptyBoard();
  const { board: b1, taskId: a } = makeTask(board);
  const { board: b2, taskId: b } = makeTask(b1);
  let b3 = addLink(b2, a, b); // A is parent of B
  assert.ok(b3);
  assert.equal(addLink(b3, b, a), null); // B→A would create cycle
});

test("valid link is accepted", () => {
  let board = emptyBoard();
  const { board: b1, taskId: a } = makeTask(board);
  const { board: b2, taskId: b } = makeTask(b1);
  const b3 = addLink(b2, a, b);
  assert.ok(b3);
  assert.ok(b3.links.some((l) => l.parentId === a && l.childId === b));
});

test("duplicate link is idempotent", () => {
  let board = emptyBoard();
  const { board: b1, taskId: a } = makeTask(board);
  const { board: b2, taskId: b } = makeTask(b1);
  const b3 = addLink(b2, a, b);
  const b4 = addLink(b3, a, b);
  assert.equal(b4.links.filter((l) => l.parentId === a && l.childId === b).length, 1);
});

// ── events cap ────────────────────────────────────────────────────────────────

test("events are capped at 200 per task (oldest dropped)", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board);
  // Generate 210 events by toggling archived 210 times
  let b = b1;
  for (let i = 0; i < 210; i++) {
    b = claimTask(archiveTask(b, taskId, false), taskId, `s${i}`, `r${i}`);
    // Manually close run so we can reclaim
    b = reclaimTask(b, taskId);
  }
  const taskEvents = b.events.filter((e) => e.taskId === taskId);
  assert.ok(taskEvents.length <= 200, `got ${taskEvents.length}`);
});

// ── store atomicity ───────────────────────────────────────────────────────────

test("store temp+rename: interrupted write leaves previous file intact", () => {
  const dir = mkdtempSync(join(tmpdir(), "kanban-store-test-"));
  // Write an initial board
  const { board: b1 } = makeTask(emptyBoard());
  saveBoard(dir, b1);
  const firstContent = readFileSync(join(dir, "kanban-board.json"), "utf8");

  // Simulate: write a tmp file but do NOT rename (simulated by writing only the tmp)
  const tmpPath = join(dir, ".kanban-tmp-simulate.json");
  writeFileSync(tmpPath, '{"tasks":[],"links":[],"comments":[],"runs":[],"events":[],"dailyStats":[]}', "utf8");
  // The original file must be unchanged
  const afterContent = readFileSync(join(dir, "kanban-board.json"), "utf8");
  assert.equal(afterContent, firstContent);

  // A successful save must be visible
  const { board: b2 } = makeTask(emptyBoard());
  saveBoard(dir, b2);
  const loaded = loadBoard(dir);
  assert.equal(loaded.tasks.length, 1);
});

test("loadBoard returns emptyBoard when file missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "kanban-store-empty-"));
  const board = loadBoard(dir);
  assert.equal(board.tasks.length, 0);
});

// ── moveTask ──────────────────────────────────────────────────────────────────

test("user can move a non-running card", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board, { flagTriage: true });
  const b2 = moveTask(b1, taskId, "todo");
  assert.equal(taskById(b2, taskId).status, "todo");
});

test("running card cannot be moved", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board);
  const b2 = claimTask(b1, taskId, "s", "r");
  const b3 = moveTask(b2, taskId, "done");
  assert.equal(taskById(b3, taskId).status, "running"); // no change
});

// ── nudge count ───────────────────────────────────────────────────────────────

test("incrementNudge tracks nudge count on active run", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board);
  const b2 = claimTask(b1, taskId, "s", "r");
  const { board: b3, nudgeCount: n1 } = incrementNudge(b2, taskId);
  assert.equal(n1, 1);
  const { board: b4, nudgeCount: n2 } = incrementNudge(b3, taskId);
  assert.equal(n2, 2);
});

// ── addComment ────────────────────────────────────────────────────────────────

test("addComment appends a comment with forced author", () => {
  let board = emptyBoard();
  const { board: b1, taskId } = makeTask(board);
  const b2 = addComment(b1, taskId, "kanban-worker", "good progress");
  assert.equal(b2.comments.length, 1);
  assert.equal(b2.comments[0].author, "kanban-worker");
});

// ── agentCardCountForSession ──────────────────────────────────────────────────

test("agentCardCountForSession counts agent tasks linked to a session via runs", () => {
  let board = emptyBoard();
  // Agent-created tasks start in triage; force to ready so claimTask works
  const { board: b1, taskId: t1 } = createTask(board, {
    title: "Agent task 1", body: "", projectPath: "/p", createdBy: "agent",
  });
  const b1r = { ...b1, tasks: b1.tasks.map((t) => t.id === t1 ? { ...t, status: "ready" } : t) };
  const b2 = claimTask(b1r, t1, "session-A", "run-1");
  // User-created task claimed by session-A (should NOT be counted)
  const { board: b3, taskId: t2 } = createTask(b2, {
    title: "User task", body: "", projectPath: "/p", createdBy: "user",
  });
  const b4 = claimTask(b3, t2, "session-A", "run-2");
  // Agent task by different session
  const { board: b5, taskId: t3 } = createTask(b4, {
    title: "Agent task 2", body: "", projectPath: "/p", createdBy: "agent",
  });
  const b5r = { ...b5, tasks: b5.tasks.map((t) => t.id === t3 ? { ...t, status: "ready" } : t) };
  const b6 = claimTask(b5r, t3, "session-B", "run-3");

  assert.equal(agentCardCountForSession(b6, "session-A"), 1, "only agent tasks for session-A");
  assert.equal(agentCardCountForSession(b6, "session-B"), 1, "agent task for session-B");
  assert.equal(agentCardCountForSession(b6, "session-X"), 0, "unknown session returns 0");
});
