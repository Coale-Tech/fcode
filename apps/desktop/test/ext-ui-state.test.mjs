/**
 * Boundary tests for ext-ui-state pure reducers (feat/ext-ui).
 *
 * applyExtStatus / applyExtWidget are the pure key-accumulate/clear functions
 * that drive ExtWidget and ConversationTopbar extension content areas.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { applyExtWidget, applyExtStatus } = await import(
  "../src/features/chat/composer/ext-ui-state.ts"
);

// ─── applyExtWidget ───────────────────────────────────────────────────────────

test("applyExtWidget: set new key", () => {
  const next = applyExtWidget({}, "w1", ["line a", "line b"]);
  assert.deepEqual(next, { w1: ["line a", "line b"] });
});

test("applyExtWidget: replace existing key", () => {
  const prev = { w1: ["old"] };
  const next = applyExtWidget(prev, "w1", ["new"]);
  assert.deepEqual(next, { w1: ["new"] });
});

test("applyExtWidget: clear key with empty array", () => {
  const prev = { w1: ["line"] };
  const next = applyExtWidget(prev, "w1", []);
  assert.deepEqual(next, {});
  assert.ok(!("w1" in next));
});

test("applyExtWidget: clear key with undefined", () => {
  const prev = { w1: ["line"] };
  const next = applyExtWidget(prev, "w1", undefined);
  assert.deepEqual(next, {});
});

test("applyExtWidget: clear non-existent key returns same reference", () => {
  const prev = { w2: ["x"] };
  const next = applyExtWidget(prev, "w1", []);
  assert.strictEqual(next, prev);
});

test("applyExtWidget: set preserves other keys", () => {
  const prev = { w1: ["a"], w2: ["b"] };
  const next = applyExtWidget(prev, "w1", ["c"]);
  assert.deepEqual(next, { w1: ["c"], w2: ["b"] });
});

test("applyExtWidget: clear removes only the specified key", () => {
  const prev = { w1: ["a"], w2: ["b"] };
  const next = applyExtWidget(prev, "w1", []);
  assert.deepEqual(next, { w2: ["b"] });
});

// ─── applyExtStatus ───────────────────────────────────────────────────────────

test("applyExtStatus: set new key", () => {
  const next = applyExtStatus({}, "s1", "running");
  assert.deepEqual(next, { s1: "running" });
});

test("applyExtStatus: replace existing key", () => {
  const prev = { s1: "idle" };
  const next = applyExtStatus(prev, "s1", "done");
  assert.deepEqual(next, { s1: "done" });
});

test("applyExtStatus: clear key with empty string", () => {
  const prev = { s1: "running" };
  const next = applyExtStatus(prev, "s1", "");
  assert.deepEqual(next, {});
});

test("applyExtStatus: clear key with undefined", () => {
  const prev = { s1: "running" };
  const next = applyExtStatus(prev, "s1", undefined);
  assert.deepEqual(next, {});
});

test("applyExtStatus: no-op when same value already set", () => {
  const prev = { s1: "running" };
  const next = applyExtStatus(prev, "s1", "running");
  assert.strictEqual(next, prev);
});

test("applyExtStatus: clear non-existent key returns same reference", () => {
  const prev = { s2: "x" };
  const next = applyExtStatus(prev, "s1", "");
  assert.strictEqual(next, prev);
});
