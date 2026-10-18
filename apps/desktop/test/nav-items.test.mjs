import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { navItems } = await import("../src/components/nav-items.ts");

test("Kanban and Raven appear only when enabled", () => {
  const ids = (f) => navItems(f).map((i) => i.id);
  assert.deepEqual(ids({ kanban: false, raven: false }), ["chat", "build", "bench", "scheduled", "filebird", "plugins", "pulls"]);
  assert.ok(ids({ kanban: true, raven: true }).includes("kanban"));
  assert.ok(ids({ kanban: true, raven: true }).includes("raven"));
});

test("data-nav hooks used by e2e stay stable", () => {
  const byId = Object.fromEntries(navItems({ kanban: true, raven: true }).map((i) => [i.id, i.dataNav]));
  assert.equal(byId.build, "build-canvas");
  assert.equal(byId.chat, "chat");
  assert.equal(byId.filebird, "filebird");
  assert.equal(byId.pulls, "pulls");
});

test("group semantics match D2 scroll structure", () => {
  const items = navItems({ kanban: true, raven: true });
  const g = (id) => items.find((i) => i.id === id).group;
  assert.equal(g("chat"), "primary");
  assert.equal(g("build"), "primary");
  assert.equal(g("bench"), "primary");
  assert.equal(g("scheduled"), "utility");
  assert.equal(g("filebird"), "utility");
  assert.equal(g("plugins"), "developer");
  assert.equal(g("pulls"), "developer");
});

test("each destination maps to a distinct page", () => {
  const pages = navItems({ kanban: true, raven: true }).map((i) => i.page);
  assert.equal(new Set(pages).size, pages.length);
});
