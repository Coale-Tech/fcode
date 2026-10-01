/**
 * BenchPage — Start identity and CONFLICT surfacing.
 *
 * BenchSupervisor runs one bench at a time, so a Start that still reaches the
 * backend while another bench runs (race between render and click) is refused
 * with CONFLICT. The page must surface that, scoped to the bench the click
 * targeted.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/pages/BenchPage.tsx", import.meta.url),
  "utf8",
);

// The "Start disabled while another bench runs" rule is behavior-tested in
// bench-view.test.mjs (startBlockedBy); the old regex pins on BenchPage JSX
// are gone with the sidebar layout.

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

test("StartFailureState carries the benchPath it belongs to", () => {
  const decl = source.slice(
    source.indexOf("type StartFailureState"),
    source.indexOf("type StartFailureState") + 200,
  );
  assert.match(decl, /benchPath:\s*string/);
});

test("Both startFailure writers (handleStart's catch and the benchFailure listener) set benchPath", () => {
  const startFn = source.slice(
    source.indexOf("const handleStart"),
    source.indexOf("const handleStop"),
  );
  assert.match(startFn, /setStartFailure\(\{\s*benchPath:\s*bench\.path/);

  const listenerFn = source.slice(
    source.indexOf("Gap 1 / T6: bench-start failure event"),
    source.indexOf("Gap 1 / T6: bench-start failure event") + 700,
  );
  assert.match(listenerFn, /const \{ failure, exitCode, logTail, benchPath \} = data as/);
  assert.match(listenerFn, /setStartFailure\(\{ failure, exitCode, logTail, benchPath \}\)/);
});

test("BenchDetail's startFailure prop is wired through selectVisibleStartFailure (cross-bench Start-failure leak)", () => {
  // The gating logic itself has a real behavioral test in
  // bench-page-start-failure-scoping.test.mjs; this proves BenchPage's JSX
  // actually calls it with the live state, not just any expression.
  assert.match(
    source,
    /startFailure=\{selectVisibleStartFailure\(startFailure, selectedBench\)\}/,
  );
});
