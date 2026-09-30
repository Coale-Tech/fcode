/**
 * T1 — Persistent workspace bar above all surfaces (B8 fix).
 *
 * Checks that:
 * - WorkspaceBar.tsx exists and uses the workspace-bar CSS class
 * - It polls bench state via useBenchStatus (not static props)
 * - It shows bench name, site, run state and agent state
 * - AppShell renders WorkspaceBar with no manual bench-state props
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bar = await readFile(
  new URL("../src/components/WorkspaceBar.tsx", import.meta.url),
  "utf8",
);

const shell = await readFile(
  new URL("../src/features/app/AppShell.tsx", import.meta.url),
  "utf8",
);

test("T1: WorkspaceBar component exists", () => {
  assert.match(bar, /WorkspaceBar/);
});

test("T1: WorkspaceBar uses workspace-bar CSS class (not raw px height)", () => {
  assert.match(bar, /workspace-bar/);
});

test("T1: WorkspaceBar polls bench state via useBenchStatus hook (B8)", () => {
  assert.match(bar, /useBenchStatus/);
  assert.match(bar, /use-bench-status/);
});

test("T1: WorkspaceBar displays bench and site context", () => {
  assert.match(bar, /benchName|benchPath/i);
  assert.match(bar, /site/i);
});

test("T1: WorkspaceBar displays run state label and CSS class", () => {
  assert.match(bar, /benchStatusDisplay/);
  assert.match(bar, /workspace-bar-run-state/);
});

test("T1: WorkspaceBar displays agent state", () => {
  assert.match(bar, /isRunning/);
  assert.match(bar, /agent-state|agentState/i);
});

test("T1: WorkspaceBar has no manual activeBench/activeSite props (state from hook)", () => {
  // Props are gone — state comes from useBenchStatus, not callers.
  assert.doesNotMatch(bar, /WorkspaceBarProps/);
  assert.doesNotMatch(bar, /activeBench\s*[?:]/);
});

test("T1: AppShell renders WorkspaceBar", () => {
  assert.match(shell, /WorkspaceBar/);
});

test("T1: AppShell imports WorkspaceBar", () => {
  assert.match(shell, /import.*WorkspaceBar/);
});
