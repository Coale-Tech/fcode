/**
 * BenchPage — Start must be disabled for a bench that isn't the one running.
 *
 * `displayStatus` gates the shown status to the selected bench's identity,
 * which means a non-active bench always displays "stopped" even while a
 * DIFFERENT bench is actually running/starting. Without a separate guard,
 * that "stopped" look renders the Start button enabled, and clicking it
 * either no-ops or (after the bench-ipc.ts fix) throws a CONFLICT the user
 * never asked for (cross-bench Start bug). BenchPage must compute whether
 * another bench is running and disable Start for the selected bench while
 * that holds.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/pages/BenchPage.tsx", import.meta.url),
  "utf8",
);

test("BenchPage derives anotherBenchRunning from the raw status and active bench identity", () => {
  const decl = source.slice(
    source.indexOf("const anotherBenchRunning"),
    source.indexOf("const anotherBenchRunning") + 300,
  );
  assert.match(decl, /status === "running" \|\| status === "starting"/);
  assert.match(decl, /activeBenchPath !== null/);
  assert.match(
    decl,
    /selectedBench\.path !== activeBenchPath/,
    "must compare the selected bench's identity against the actually-active bench",
  );
});

test("BenchPage passes anotherBenchRunning down to BenchDetail and ProcessPanel", () => {
  assert.match(source, /<BenchDetail[\s\S]{0,200}anotherBenchRunning=\{anotherBenchRunning\}/);
  assert.match(source, /<ProcessPanel[\s\S]{0,200}anotherBenchRunning=\{anotherBenchRunning\}/);
});

test("ProcessPanel disables both Start-triggering buttons while another bench runs", () => {
  const panel = source.slice(
    source.indexOf("function ProcessPanel"),
    source.indexOf("function VersionBadge"),
  );
  const startButtons = panel.match(/onClick=\{onStart\}[^>]*>/g) ?? [];
  assert.ok(startButtons.length >= 2, "expected both the Start bench and Retry buttons");
  for (const button of startButtons) {
    assert.match(button, /disabled=\{anotherBenchRunning\}/);
  }
});

test("BenchPage's invoke() preserves errorCode from a rejected IPC result", () => {
  // Without this, handleStart's catch has no way to tell a CONFLICT apart
  // from any other rejection — the errorCode set by bench-ipc.ts's
  // Object.assign(new Error(...), { errorCode }) would be silently dropped.
  const fn = source.slice(
    source.indexOf("async function invoke"),
    source.indexOf("async function invoke") + 400,
  );
  assert.match(fn, /Object\.assign\(new Error\(result\.error\.message/);
  assert.match(fn, /errorCode:\s*result\.error\.code/);
});

test("handleStart surfaces a CONFLICT rejection via startFailure instead of only logging", () => {
  // A stray Start click that still reaches the backend (race between render
  // and click) must not be silently swallowed by console.error: the user
  // sees nothing in that case even though the backend correctly refused.
  const fn = source.slice(
    source.indexOf("const handleStart"),
    source.indexOf("const handleStop"),
  );
  assert.match(fn, /errorCode === ErrorCodes\.CONFLICT/);
  assert.match(fn, /setStartFailure\(\{/);
  // Genuinely unexpected errors still fall back to logging.
  assert.match(fn, /console\.error\("\[BenchPage\] start failed"/);
});
