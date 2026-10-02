/**
 * T10 — Build tab canvas control strip. The precondition logic itself is
 * covered behaviourally in build-checks.test.mjs.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const buildPage = await readFile(
  new URL("../src/pages/BuildPage.tsx", import.meta.url),
  "utf8",
);

test("T10: BuildPage renders a control strip", () => {
  assert.match(buildPage, /build-control-strip|control.strip/i);
});

test("T10: BuildPage includes Studio/Builder switch", () => {
  assert.match(buildPage, /[Ss]tudio/);
  assert.match(buildPage, /[Bb]uilder/);
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
});

test("T6: Start-bench CTAs navigate to the Bench page instead of guessing a path", () => {
  // BuildPage has no bench-selection state and no access to activeBenchPath
  // while stopped, so it cannot supply the benchPath that IPC.invoke.benchStart
  // now requires. Calling it with {} used to be silently swallowed by
  // `void invoke(...)` (bench-ipc.ts rejects with INVALID_ARGUMENT). Both
  // CTAs must route to the Bench page instead, matching the existing
  // bench.start precedent in OnboardingChecklist.tsx.
  assert.match(buildPage, /setPage\("bench"\)/);
  assert.doesNotMatch(
    buildPage,
    /invoke\(IPC\.invoke\.benchStart/,
    "benchStart must no longer be called directly from BuildPage without a benchPath",
  );
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
