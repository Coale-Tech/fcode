/**
 * session-stats-format.test.mjs
 *
 * Boundary tests for the `formatSessionCost` helper in lib/context-usage.ts.
 * Uses the ts-import-hooks shim so we can import TypeScript directly.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

register(
  pathToFileURL(
    join(dirname(fileURLToPath(import.meta.url)), "helpers/ts-import-hooks.mjs"),
  ),
);

const { formatSessionCost } = await import(
  "../src/lib/context-usage.ts"
);

test("returns null for zero cost (local/uncounted model)", () => {
  assert.equal(formatSessionCost(0), null);
});

test("returns null for negative cost", () => {
  assert.equal(formatSessionCost(-1), null);
});

test("formats sub-cent cost with four decimal places", () => {
  assert.equal(formatSessionCost(0.005), "$0.0050");
  assert.equal(formatSessionCost(0.0001), "$0.0001");
});

test("formats cent-level cost at boundary (exactly $0.01) with two decimal places", () => {
  assert.equal(formatSessionCost(0.01), "$0.01");
});

test("formats larger costs with two decimal places", () => {
  assert.equal(formatSessionCost(1.5), "$1.50");
  assert.equal(formatSessionCost(12.3456), "$12.35");
});
