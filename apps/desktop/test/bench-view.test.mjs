import assert from "node:assert/strict";
import { register } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));
const {
  groupForSwitcher,
  matchesChip,
  matchesQuery,
  oneshotKey,
  sortBenches,
  startBlockedBy,
  startBlockedCue,
  versionChips,
} = await import("../src/lib/bench-view.ts");

const bench = (name, version, sites = []) => ({
  id: name,
  path: `/b/${name}`,
  version,
  sites: sites.map((n) => ({ name: n, isDefault: false })),
});

test("startBlockedBy blocks only a DIFFERENT bench while one runs or starts", () => {
  // Supervisor rejects a second bench with CONFLICT; the same bench is a no-op.
  assert.equal(startBlockedBy("running", "/b/a", "/b/b"), "/b/a");
  assert.equal(startBlockedBy("starting", "/b/a", "/b/b"), "/b/a");
  assert.equal(startBlockedBy("running", "/b/a", "/b/a"), null);
  assert.equal(startBlockedBy("stopped", null, "/b/b"), null);
  assert.equal(startBlockedBy("failed", "/b/a", "/b/b"), null);
  // No target bench (the table): any running bench blocks.
  assert.equal(startBlockedBy("running", "/b/a", null), "/b/a");
  assert.equal(startBlockedCue("/b/coale_v16"), "Stop coale_v16 first");
});

test("sortBenches puts running, then failed first and keeps discovery order within a rank", () => {
  const list = [bench("a", 15), bench("b", 16), bench("c", 16), bench("d", 15)];
  const status = { a: "stopped", b: "failed", c: "running", d: "stopped" };
  const out = sortBenches(list, (x) => status[x.id]).map((x) => x.id);
  assert.deepEqual(out, ["c", "b", "a", "d"]);
});

test("matchesQuery searches name, site and version; blank matches all", () => {
  const b = bench("coale_v16", 16, ["erp.local"]);
  assert.ok(matchesQuery(b, "  "));
  assert.ok(matchesQuery(b, "COALE"));
  assert.ok(matchesQuery(b, "erp.loc"));
  assert.ok(matchesQuery(b, "v16"));
  assert.ok(!matchesQuery(b, "v15"));
  assert.ok(!matchesQuery(bench("x", null), "vnull"));
});

test("matchesChip: running includes starting; version chip never matches null versions", () => {
  assert.ok(matchesChip(bench("a", 16), "starting", "running"));
  assert.ok(!matchesChip(bench("a", 16), "stopped", "running"));
  assert.ok(matchesChip(bench("a", 16), "stopped", "v16"));
  assert.ok(!matchesChip(bench("a", null), "stopped", "v16"));
});

test("versionChips lists only versions present, newest first, with counts", () => {
  const out = versionChips([bench("a", 15), bench("b", 16), bench("c", 15), bench("d", null)]);
  assert.deepEqual(out, [
    { chip: "v16", count: 1 },
    { chip: "v15", count: 2 },
  ]);
});

test("groupForSwitcher places each matching bench in exactly one group", () => {
  const list = [bench("a", 16), bench("b", 16), bench("c", 15), bench("d", 15)];
  const status = { a: "running", b: "failed", c: "starting", d: "stopped" };
  const g = groupForSwitcher(list, "", (x) => status[x.id]);
  assert.deepEqual(g.running.map((x) => x.id), ["a", "c"]);
  assert.deepEqual(g.attention.map((x) => x.id), ["b"]);
  assert.deepEqual(g.rest.map((x) => x.id), ["d"]);
  const filtered = groupForSwitcher(list, "v15", (x) => status[x.id]);
  assert.deepEqual([...filtered.running, ...filtered.attention, ...filtered.rest].map((x) => x.id), ["c", "d"]);
});

test("oneshotKey separates the same verb on different benches and different verbs on one bench", () => {
  // A one-shot result stored by verb alone showed bench A's "✓ migrate" on bench B.
  assert.notEqual(oneshotKey("/b/a", "migrate"), oneshotKey("/b/b", "migrate"));
  assert.notEqual(oneshotKey("/b/a", "migrate"), oneshotKey("/b/a", "build"));
  assert.equal(oneshotKey("/b/a", "migrate"), oneshotKey("/b/a", "migrate"));
  // A path that ends like another bench's path + verb cannot collide.
  assert.notEqual(oneshotKey("/b/a", "x"), oneshotKey("/b/a\0x", ""));
});
