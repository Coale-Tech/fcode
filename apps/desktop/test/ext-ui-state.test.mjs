/**
 * Unit tests for the ext-ui-state reducer (request → state boundary).
 * Covers: clear on empty/undefined, replace by key.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { register } from "node:module";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { applyExtStatus, applyExtWidget } = await import(
  "../src/features/chat/composer/ext-ui-state.ts"
);

describe("applyExtStatus — request→state reducer", () => {
  it("adds a new status entry", () => {
    const result = applyExtStatus({}, "key1", "Working…");
    assert.deepEqual(result, { key1: "Working…" });
  });

  it("replaces an existing entry by key", () => {
    const result = applyExtStatus({ key1: "old" }, "key1", "new");
    assert.equal(result["key1"], "new");
  });

  it("clears on undefined text", () => {
    const result = applyExtStatus({ key1: "some text" }, "key1", undefined);
    assert.equal("key1" in result, false);
  });

  it("clears on empty string text", () => {
    const result = applyExtStatus({ key1: "some text" }, "key1", "");
    assert.equal("key1" in result, false);
  });

  it("returns same reference when key absent and text is empty", () => {
    const prev = {};
    assert.equal(applyExtStatus(prev, "missing", undefined), prev);
  });

  it("does not mutate input state", () => {
    const prev = { key1: "old" };
    applyExtStatus(prev, "key1", "new");
    assert.equal(prev["key1"], "old");
  });
});

describe("applyExtWidget — request→state reducer", () => {
  it("adds a new widget entry", () => {
    const result = applyExtWidget({}, "w1", ["line1", "line2"]);
    assert.deepEqual(result, { w1: ["line1", "line2"] });
  });

  it("replaces an existing entry by key", () => {
    const result = applyExtWidget({ w1: ["old"] }, "w1", ["new"]);
    assert.deepEqual(result["w1"], ["new"]);
  });

  it("clears on undefined lines", () => {
    const result = applyExtWidget({ w1: ["line"] }, "w1", undefined);
    assert.equal("w1" in result, false);
  });

  it("clears on empty lines array", () => {
    const result = applyExtWidget({ w1: ["line"] }, "w1", []);
    assert.equal("w1" in result, false);
  });

  it("returns same reference when key absent and lines empty", () => {
    const prev = {};
    assert.equal(applyExtWidget(prev, "missing", []), prev);
  });
});
