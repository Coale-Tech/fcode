/**
 * T10 — Build tab canvas control strip with precondition checklist.
 *
 * Checks that:
 * - PreconditionList.tsx exists and renders pass/fail items with remedies
 * - BuildPage renders a control strip (Studio/Builder switch + precondition list)
 * - Precondition items show selectable remedy commands
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const precList = await readFile(
  new URL("../src/components/PreconditionList.tsx", import.meta.url),
  "utf8",
);

const buildPage = await readFile(
  new URL("../src/pages/BuildPage.tsx", import.meta.url),
  "utf8",
);

test("T10: PreconditionList component exists", () => {
  assert.match(precList, /PreconditionList/);
});

test("T10: PreconditionList renders items with pass/fail state", () => {
  assert.match(precList, /pass|fail|ok|error/i);
  assert.match(precList, /precondition-item|prec-item/i);
});

test("T10: PreconditionList shows remedy command as selectable text", () => {
  assert.match(precList, /remedy|command|user-select/);
});

test("T10: BuildPage renders a control strip", () => {
  assert.match(buildPage, /build-control-strip|control.strip/i);
});

test("T10: BuildPage includes Studio/Builder switch", () => {
  assert.match(buildPage, /[Ss]tudio/);
  assert.match(buildPage, /[Bb]uilder/);
});

test("T10: BuildPage uses PreconditionList", () => {
  assert.match(buildPage, /PreconditionList/);
});

test("T10: BuildPage announces canvas focus entry (T14 a11y)", () => {
  assert.match(buildPage, /aria-live|aria.live/i);
});
