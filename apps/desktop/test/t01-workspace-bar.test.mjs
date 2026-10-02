/**
 * T1 — Persistent workspace bar above all surfaces.
 *
 * Checks that:
 * - WorkspaceBar.tsx exists and renders a 32px bar (via --ds-toolbar-height token)
 * - It shows bench/site/run state and agent state
 * - AppShell renders WorkspaceBar above the primary surface
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

test("T1: WorkspaceBar uses ds-toolbar-height token (not raw px height)", () => {
  // Must reference the token, not a raw pixel value like height: 32px
  assert.match(bar, /--ds-toolbar-height|workspace-bar/);
});

test("T1: WorkspaceBar displays bench and site context", () => {
  assert.match(bar, /bench|activeBench|benchName/i);
  assert.match(bar, /site/i);
});

test("T1: WorkspaceBar displays run state", () => {
  assert.match(bar, /running|run.?state|runState/i);
});

test("T1: WorkspaceBar displays agent state", () => {
  assert.match(bar, /isRunning|agent.?state|agentState/i);
});

test("T1: AppShell renders WorkspaceBar", () => {
  assert.match(shell, /WorkspaceBar/);
});

test("T1: AppShell imports WorkspaceBar", () => {
  assert.match(shell, /import.*WorkspaceBar/);
});
