/** Board helpers behind the Kanban page: filters, progress, selection ranges. */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const m = await import("../src/features/kanban/kanban-model.ts");

const task = (id, over = {}) => ({
  id, title: id, body: "", status: "ready", archived: false, priority: 0,
  createdBy: "user", projectPath: "/work/alpha", consecutiveFailures: 0, createdAt: 1, ...over,
});

test("filter: archived hidden by default, project exact, search spans id/title/body/result", () => {
  const tasks = [
    task("aaaa1111-0000", { title: "Fix login", projectPath: "/work/alpha" }),
    task("bbbb2222-0000", { body: "rotate the JWT secret", projectPath: "/work/beta" }),
    task("cccc3333-0000", { archived: true, title: "Old" }),
    task("dddd4444-0000", { result: "shipped v2" }),
  ];
  const ids = (f) => m.filterTasks(tasks, { ...m.NO_FILTERS, ...f }).map((t) => t.id.slice(0, 4));
  assert.deepEqual(ids({}), ["aaaa", "bbbb", "dddd"]);
  assert.deepEqual(ids({ showArchived: true }), ["aaaa", "bbbb", "cccc", "dddd"]);
  assert.deepEqual(ids({ project: "/work/beta" }), ["bbbb"]);
  assert.deepEqual(ids({ search: "JWT" }), ["bbbb"]);
  assert.deepEqual(ids({ search: "shipped" }), ["dddd"]);
  assert.deepEqual(ids({ search: m.shortId("aaaa1111-0000").toLowerCase() }), ["aaaa"]);
  assert.deepEqual(ids({ search: "login", project: "/work/beta" }), []);
});

test("child progress counts done children; leaf cards have none", () => {
  const board = {
    tasks: [task("p"), task("c1", { status: "done" }), task("c2"), task("c3", { status: "done" })],
    links: [
      { parentId: "p", childId: "c1" }, { parentId: "p", childId: "c2" }, { parentId: "p", childId: "c3" },
    ],
    comments: [], runs: [], events: [], dailyStats: [],
  };
  assert.deepEqual(m.childProgress(board, "p"), { done: 2, total: 3 });
  assert.equal(m.childProgress(board, "c1"), null);
  assert.deepEqual(m.linkCounts(board, "c2"), { parents: 1, children: 0 });
});

test("running cards are not user-movable; no self-move", () => {
  assert.equal(m.canMoveTo({ status: "running" }, "done"), false);
  assert.equal(m.canMoveTo({ status: "ready" }, "ready"), false);
  assert.equal(m.canMoveTo({ status: "ready" }, "running"), false);
  assert.equal(m.canMoveTo({ status: "blocked" }, "ready"), true);
});

test("shift-click range runs either direction and falls back to the target", () => {
  const order = ["a", "b", "c", "d"];
  assert.deepEqual(m.rangeBetween(order, "b", "d"), ["b", "c", "d"]);
  assert.deepEqual(m.rangeBetween(order, "d", "b"), ["b", "c", "d"]);
  assert.deepEqual(m.rangeBetween(order, "gone", "c"), ["c"]);
});

test("worker session prefers the live one, else the newest run", () => {
  const runs = [
    { sessionId: "old", startedAt: 1 }, { sessionId: "new", startedAt: 9 },
  ];
  assert.equal(m.workerSessionId({ sessionId: "live" }, runs), "live");
  assert.equal(m.workerSessionId({}, runs), "new");
  assert.equal(m.workerSessionId({}, []), undefined);
});

test("card age buckets into now / minutes / hours / days, never negative", () => {
  const now = 10 * 86_400_000;
  assert.deepEqual(m.agoParts(now - 30_000, now), { key: "agoNow", count: 0 });
  assert.deepEqual(m.agoParts(now + 60_000, now), { key: "agoNow", count: 0 });
  assert.deepEqual(m.agoParts(now - 12 * 60_000, now), { key: "agoMinutes", count: 12 });
  assert.deepEqual(m.agoParts(now - 3 * 3_600_000 - 59 * 60_000, now), { key: "agoHours", count: 3 });
  assert.deepEqual(m.agoParts(now - 50 * 3_600_000, now), { key: "agoDays", count: 2 });
});

test("board summary counts live cards only; open is everything not done", () => {
  const summary = m.boardSummary([
    task("a", { status: "triage" }), task("b", { status: "running" }), task("c", { status: "running" }),
    task("d", { status: "blocked" }), task("e", { status: "done" }), task("f", { status: "done", archived: true }),
    task("g", { status: "blocked", archived: true }),
  ]);
  assert.deepEqual(summary, { open: 4, running: 2, blocked: 1, done: 1 });
});

test("columns list the newest card first without mutating the input", () => {
  const tasks = [task("old", { createdAt: 1 }), task("new", { createdAt: 3 }), task("mid", { createdAt: 2 })];
  assert.deepEqual(m.sortForColumn(tasks).map((x) => x.id), ["new", "mid", "old"]);
  assert.deepEqual(tasks.map((x) => x.id), ["old", "new", "mid"]);
});

test("event target reads moved/newStatus payloads and tone flags outcomes", () => {
  assert.equal(m.eventTarget({ from: "ready", to: "running" }), "running");
  assert.equal(m.eventTarget({ newStatus: "done" }), "done");
  assert.equal(m.eventTarget({ to: "nowhere" }), undefined);
  assert.equal(m.eventTarget(undefined), undefined);
  assert.equal(m.eventTone("moved", { to: "done" }), "ok");
  assert.equal(m.eventTone("completed", undefined), "ok");
  assert.equal(m.eventTone("crashed", undefined), "bad");
  assert.equal(m.eventTone("timed_out", undefined), "bad");
  assert.equal(m.eventTone("claimed", undefined), "neutral");
});
