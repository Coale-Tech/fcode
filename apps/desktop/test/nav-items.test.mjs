import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { navItems } = await import("../src/components/nav-items.ts");

test("Kanban and Raven appear only when enabled", () => {
  const ids = (f) => navItems(f).map((i) => i.id);
  assert.deepEqual(ids({ kanban: false, raven: false }), ["chat", "build", "bench", "scheduled", "filebird", "plugins"]);
  assert.ok(ids({ kanban: true, raven: true }).includes("kanban"));
  assert.ok(ids({ kanban: true, raven: true }).includes("raven"));
});

test("data-nav hooks used by e2e stay stable", () => {
  const byId = Object.fromEntries(navItems({ kanban: true, raven: true }).map((i) => [i.id, i.dataNav]));
  assert.equal(byId.build, "build-canvas");
  assert.equal(byId.chat, "chat");
  assert.equal(byId.filebird, "filebird");
});
