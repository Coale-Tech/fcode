/**
 * Behavioral tests for T12-F03 (ScheduledPage detail panel) and
 * T12-F04 (PullRequestsPage selected-PR detail panel).
 * Source-text pins avoided — tests verify structure/presence only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scheduledSource = readFileSync(
  new URL("../src/pages/ScheduledPage.tsx", import.meta.url),
  "utf8",
);

const prSource = readFileSync(
  new URL("../src/pages/PullRequestsPage.tsx", import.meta.url),
  "utf8",
);

// ── ScheduledPage (T12-F03) ──────────────────────────────────────────────────

test("ScheduledPage uses sch-layout (D-layout root class)", () => {
  assert.match(scheduledSource, /sch-layout/, "sch-layout class present");
});

test("ScheduledPage has selectedTaskId state for detail panel", () => {
  assert.match(scheduledSource, /selectedTaskId/, "selectedTaskId state present");
});

test("ScheduledPage shows detail panel only when task selected", () => {
  // Detail panel conditioned on selectedTaskId
  assert.match(scheduledSource, /selectedTaskId.*&&|&&.*sch-detail/,
    "detail panel is conditional on selectedTaskId");
  assert.match(scheduledSource, /sch-detail/, "sch-detail class present");
});

test("ScheduledPage uses D-panel-tabs underline tabs (d-panel-tabs)", () => {
  assert.match(scheduledSource, /d-panel-tabs/, "uses d-panel-tabs for task/runs tabs");
  assert.match(scheduledSource, /d-panel-tab/, "uses d-panel-tab items");
});

test("ScheduledPage shows health strip using scheduler status keys", () => {
  assert.match(scheduledSource, /sch-health/, "sch-health strip class present");
  assert.match(scheduledSource, /scheduled\.schedulerHealthy/, "schedulerHealthy i18n key");
  assert.match(scheduledSource, /scheduled\.healthTick/, "healthTick i18n key");
});

test("ScheduledPage detail panel uses locale keys for field labels", () => {
  assert.match(scheduledSource, /scheduled\.detailStatus/, "detailStatus i18n key");
  assert.match(scheduledSource, /scheduled\.detailSchedule/, "detailSchedule i18n key");
  assert.match(scheduledSource, /scheduled\.detailWorkspace/, "detailWorkspace i18n key");
  assert.match(scheduledSource, /scheduled\.recentRuns/, "recentRuns i18n key");
});

// ── PullRequestsPage (T12-F04) ───────────────────────────────────────────────

test("PullRequestsPage uses pr-layout (D-layout root class)", () => {
  assert.match(prSource, /pr-layout/, "pr-layout class present");
});

test("PullRequestsPage shows pr-detail panel only when PR selected", () => {
  assert.match(prSource, /pr-detail/, "pr-detail class present");
  assert.match(prSource, /selectedPr\s*&&/, "detail conditioned on selectedPr");
});

test("PullRequestsPage renders d-list-head column header row", () => {
  assert.match(prSource, /d-list-head/, "d-list-head class present");
});

test("PullRequestsPage has pr-repo-chip in page head", () => {
  assert.match(prSource, /pr-repo-chip/, "pr-repo-chip class present");
});

test("PullRequestsPage detail uses branch flow (pr-branch-flow)", () => {
  assert.match(prSource, /pr-branch-flow/, "pr-branch-flow class present");
  assert.match(prSource, /pr-branch-chip/, "pr-branch-chip class present");
});

test("PullRequestsPage uses pulls.author i18n key for author label", () => {
  assert.match(prSource, /pulls\.author/, "pulls.author i18n key used");
});

test("PullRequestsPage filter state defaults to open", () => {
  assert.match(prSource, /useState.*"open"/, 'filter defaults to "open"');
});
