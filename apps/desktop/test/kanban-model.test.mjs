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
