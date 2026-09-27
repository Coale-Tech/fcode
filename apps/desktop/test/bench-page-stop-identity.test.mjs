/**
 * BenchPage — Stop must target the bench it actually stops.
 *
 * BenchSupervisor runs one bench at a time; `benchStatus` polling is global.
 * Without gating by bench identity, selecting bench B while bench A is
 * running still shows A's "running"/Stop UI under B, and clicking Stop
 * sends no identity at all — killing A instead of B (cross-bench Stop bug).
 *
 * These assertions check that:
 * - the status shown for the selected bench is gated to the bench the
 *   supervisor is actually running (not the raw global poll value), and
 * - handleStop sends the selected bench's path so the main process can
 *   refuse a stale/mismatched stop.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/pages/BenchPage.tsx", import.meta.url),
  "utf8",
);

test("BenchPage tracks which bench path the supervisor is actually running", () => {
  assert.match(source, /activeBenchPath/);
  assert.match(
    source,
    /benchPath:\s*string\s*\|\s*null/,
    "poll response type must carry benchPath alongside status",
  );
});

test("BenchPage gates the displayed status to the selected bench's identity", () => {
  assert.match(
    source,
    /selectedBench\.path\s*===\s*activeBenchPath|activeBenchPath\s*===\s*selectedBench\.path/,
    "must compare the active bench path against the selected bench before treating it as running",
  );
  // The gated value — not the raw global poll status — must be what BenchDetail renders.
  assert.match(source, /status=\{displayStatus\}/);
});

test("BenchPage.handleStop sends the selected bench's path so a mismatched stop can be refused", () => {
  const handleStop = source.slice(
    source.indexOf("const handleStop"),
    source.indexOf("const handleStop") + 400,
  );
  assert.match(handleStop, /if\s*\(!selectedBench\)\s*return;/);
  assert.match(
    handleStop,
    /invoke\(IPC\.invoke\.benchStop,\s*\{\s*benchPath:\s*selectedBench\.path\s*\}\)/,
  );
});
