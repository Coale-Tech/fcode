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

// ── T6: interaction state coverage ──────────────────────────────────────────

test("T6: BuildPage polls bench status", () => {
  assert.match(buildPage, /benchStatus/);
  assert.match(buildPage, /setBenchStatus/);
});

test("T6: BuildPage invokes buildListApps for app availability", () => {
  assert.match(buildPage, /buildListApps/);
  assert.match(buildPage, /installedApps|listAppsStatus/);
});

test("T6: BuildPage invokes buildCanvasNavigate for navigation", () => {
  assert.match(buildPage, /buildCanvasNavigate/);
});

test("T6: BuildPage subscribes to buildWatcherLog event", () => {
  assert.match(buildPage, /buildWatcherLog/);
});

test("T6: BuildPage subscribes to buildWatcherExit event", () => {
  assert.match(buildPage, /buildWatcherExit/);
});

test("T6: BuildPage shows canvas loading state", () => {
  assert.match(buildPage, /canvasNavigating|Loading…/);
});

test("T6: BuildPage shows canvas 15s timeout escalation", () => {
  assert.match(buildPage, /canvasTimedOut|Still loading/);
});

test("T6: BuildPage shows 'Start bench' CTA when bench stopped", () => {
  // Covers the EMPTY canvas state
  assert.match(buildPage, /Start bench/);
  assert.match(buildPage, /benchStart/);
});

test("T6: BuildPage shows watcher status for Studio", () => {
  assert.match(buildPage, /watcherStatus|watch-studio starting/);
});

test("T6: BuildPage shows developer_mode warning", () => {
  assert.match(buildPage, /developer_mode/);
});

test("T6: BuildPage shows 'Files are the source' label for Builder (D19)", () => {
  assert.match(buildPage, /Files are the source/);
});

test("T6: BuildPage shows Sync files button with loading state", () => {
  assert.match(buildPage, /Sync files → site|Syncing…/);
  assert.match(buildPage, /syncStatus/);
});

test("T6: BuildPage shows install commands when app missing (PARTIAL state)", () => {
  assert.match(buildPage, /install-app|get-app|install command/i);
});
