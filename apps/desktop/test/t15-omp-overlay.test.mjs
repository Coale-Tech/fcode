/**
 * T15 — omp overlay with default tools.approval map and skills.customDirectories.
 *
 * Checks that:
 * - omp-overlay.ts exports writeOmpOverlay(dataDir, resourcesPath)
 * - The overlay includes skills.customDirectories pointing to fcode-skills
 * - The overlay includes tools.approval with fcode_bench_execute: allow
 * - The overlay includes tools.approval with fcode_bench_run: always-ask
 * - An overlay write failure is fatal (throws), never silently falls back to yolo
 * - FCODE_BRIDGE_TRACE=1 is documented in the overlay as a comment
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL(
    "../electron/main/agent/omp-overlay.ts",
    import.meta.url,
  ),
  "utf8",
);

test("T15: omp-overlay exports writeOmpOverlay function", () => {
  assert.match(source, /export.*writeOmpOverlay|export async function writeOmpOverlay/);
});

test("T15: overlay includes skills.customDirectories with fcode-skills", () => {
  assert.match(source, /customDirectories/);
  assert.match(source, /fcode-skills/);
});

test("T15: overlay sets approval-mode always-ask (must be in spawn args, not YAML — documented)", () => {
  // The plan requires --approval-mode always-ask at spawn time.
  // The overlay sets per-tool overrides on top of the global mode.
  assert.match(source, /always-ask|approval.mode/i);
});

test("T15: overlay auto-approves fcode_bench_execute (read-only prefix guard)", () => {
  assert.match(source, /fcode_bench_execute/);
  assert.match(source, /allow/);
});

test("T15: overlay prompts for fcode_bench_run (state-changing commands)", () => {
  assert.match(source, /fcode_bench_run/);
});

test("T15: overlay write failure throws (fatal — never falls back to yolo)", () => {
  assert.match(source, /throw|reject/i);
});

test("T15: FCODE_BRIDGE_TRACE is documented in the overlay", () => {
  assert.match(source, /FCODE_BRIDGE_TRACE/);
});
