/**
 * bench-shell-state — exercises pure derivation helpers in use-bench-status.ts (B8 fix).
 *
 * Imports the actual exported functions (not source-text regexes) so a wrong
 * mapping is caught by the test, not just the type-checker.
 *
 * benchStatusDisplay: status → { label, cls }
 * deriveBenchOnboarding: (status, benchPath, workspace) → { select, start }
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { benchStatusDisplay, deriveBenchOnboarding } = await import(
  "../src/lib/use-bench-status.ts"
);

// ── benchStatusDisplay ─────────────────────────────────────────────────────────

test("benchStatusDisplay: running → is-running + 'running'", () => {
  const { label, cls } = benchStatusDisplay("running");
  assert.equal(label, "running");
  assert.equal(cls, "is-running");
});

test("benchStatusDisplay: stopped → is-stopped + 'stopped'", () => {
  const { label, cls } = benchStatusDisplay("stopped");
  assert.equal(label, "stopped");
  assert.equal(cls, "is-stopped");
});

test("benchStatusDisplay: starting → is-stopped + 'starting…'", () => {
  // No is-starting CSS class in workspace-bar; maps to is-stopped visually.
  const { label, cls } = benchStatusDisplay("starting");
  assert.equal(label, "starting…");
  assert.equal(cls, "is-stopped");
});

test("benchStatusDisplay: failed → is-stopped + 'failed'", () => {
  // No is-failed CSS class in workspace-bar; maps to is-stopped visually.
  const { label, cls } = benchStatusDisplay("failed");
  assert.equal(label, "failed");
  assert.equal(cls, "is-stopped");
});

test("benchStatusDisplay: every status returns a non-empty label and cls", () => {
  for (const status of ["running", "stopped", "starting", "failed"]) {
    const { label, cls } = benchStatusDisplay(status);
    assert.ok(label.length > 0, `label non-empty for ${status}`);
    assert.ok(cls.length > 0, `cls non-empty for ${status}`);
  }
});

// ── deriveBenchOnboarding ──────────────────────────────────────────────────────

test("deriveBenchOnboarding: select is done when benchPath is set", () => {
  const { select } = deriveBenchOnboarding("stopped", "/home/user/bench1", null);
  assert.equal(select, true);
});

test("deriveBenchOnboarding: select is done when workspace is set (original condition)", () => {
  const { select } = deriveBenchOnboarding("stopped", null, "/home/user/project");
  assert.equal(select, true);
});

test("deriveBenchOnboarding: select is done when both benchPath and workspace are set", () => {
  const { select } = deriveBenchOnboarding("running", "/bench", "/ws");
  assert.equal(select, true);
});

test("deriveBenchOnboarding: select is NOT done when both are null", () => {
  const { select } = deriveBenchOnboarding("stopped", null, null);
  assert.equal(select, false);
});

test("deriveBenchOnboarding: start is done when status is running", () => {
  const { start } = deriveBenchOnboarding("running", "/bench", null);
  assert.equal(start, true);
});

test("deriveBenchOnboarding: start is NOT done when status is starting", () => {
  const { start } = deriveBenchOnboarding("starting", "/bench", null);
  assert.equal(start, false);
});

test("deriveBenchOnboarding: start is NOT done when status is stopped", () => {
  const { start } = deriveBenchOnboarding("stopped", null, null);
  assert.equal(start, false);
});

test("deriveBenchOnboarding: start is NOT done when status is failed", () => {
  const { start } = deriveBenchOnboarding("failed", "/bench", null);
  assert.equal(start, false);
});

test("deriveBenchOnboarding: both select and start are true when bench is running", () => {
  const { select, start } = deriveBenchOnboarding("running", "/some/bench", null);
  assert.equal(select, true);
  assert.equal(start, true);
});
