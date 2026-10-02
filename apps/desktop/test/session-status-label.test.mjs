/**
 * Behavioural tests for the session status label decision function.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { sessionStatusLabel } from "../src/lib/session-status-label.ts";

test("running → 'Running'", () => {
  assert.equal(sessionStatusLabel("running"), "Running");
});

test("permission → 'Needs approval'", () => {
  assert.equal(sessionStatusLabel("permission"), "Needs approval");
});

test("null → null (no label for absent status)", () => {
  assert.equal(sessionStatusLabel(null), null);
});

test("idle/terminal statuses → null", () => {
  assert.equal(sessionStatusLabel("selected"), null);
  assert.equal(sessionStatusLabel("completed"), null);
  assert.equal(sessionStatusLabel("failed"), null);
});
