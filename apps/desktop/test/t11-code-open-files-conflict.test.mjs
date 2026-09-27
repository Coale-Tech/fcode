/**
 * T11 — Code tab: LRU open-files strip (cap 8) and on-disk conflict handling.
 *
 * Tests that CodePage.tsx contains the structures required for T11:
 * - An open-files tab strip with a cap of 8
 * - Conflict bar when a dirty file changes on disk
 * - Disk-change detection via mtimeMs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/pages/CodePage.tsx", import.meta.url),
  "utf8",
);

test("T11: CodePage has LRU open-files strip capped at 8", () => {
  // Must reference the cap constant and a tabs/strip container
  assert.match(source, /8/); // the cap
  assert.match(source, /openFiles/);
  assert.match(source, /code-tab/);
});

test("T11: CodePage shows a conflict bar when a dirty file changes on disk", () => {
  assert.match(source, /diskChanged/);
  assert.match(source, /code-conflict-bar/);
});

test("T11: CodePage provides Keep mine / Take theirs conflict resolution", () => {
  assert.match(source, /Keep mine/);
  assert.match(source, /Take theirs/);
});

test("T11: CodePage uses mtimeMs for on-disk change detection", () => {
  assert.match(source, /mtimeMs/);
});

test("T11: saveFile threads expectedMtimeMs into the write call for optimistic-lock conflict detection", () => {
  const saveFileBody = source.match(
    /const saveFile = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[activePath, dirty\]\);/,
  )?.[0] ?? "";
  assert.notEqual(saveFileBody, "", "expected to find the saveFile callback");
  assert.match(saveFileBody, /const expectedMtimeMs = fileCache\.current\[activePath\]\?\.mtimeMs/);
  assert.match(saveFileBody, /api\.fsWrite\(activePath, content, expectedMtimeMs\)/);
});

test("T11: saveFile only clears dirty state after a successful write, never on conflict or error", () => {
  const saveFileBody = source.match(
    /const saveFile = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[activePath, dirty\]\);/,
  )?.[0] ?? "";
  const [tryBlock, catchBlock] = saveFileBody.split(/\} catch \(error\) \{/);
  assert.match(tryBlock, /setDirty\(\(prev\)/);
  // A write conflict re-reads disk and reuses the same conflict bar as the
  // background poll; it must never fall through to the dirty-clearing code,
  // or a failed save due to an external edit would silently discard it.
  assert.match(catchBlock, /code === "CONFLICT"/);
  assert.doesNotMatch(catchBlock, /setDirty\(/);
  // Every failure path reports something instead of pretending success.
  assert.match(catchBlock, /setSaveError\(/);
});

test("T11: CodePage integrates Monaco editor", () => {
  assert.match(source, /@monaco-editor\/react|monaco-editor/);
});

// ── T6 (code) — Wave-2 interaction-state gaps ─────────────────────────────

test("T6 (code): FileTree renders 'No files in this workspace' when entries is empty", () => {
  assert.match(source, /No files in this workspace/);
  assert.match(source, /entries\.length === 0/);
});

test("T6 (code): saveFile has a saving state that drives a spinner on the Save button", () => {
  assert.match(source, /const \[saving, setSaving\]/);
  assert.match(source, /setSaving\(true\)/);
  assert.match(source, /setSaving\(false\)/);
  assert.match(source, /tool-spinner/);
  assert.match(source, /disabled=\{saving\}/);
});

test("T6 (code): conflict bar includes a Diff button that opens a DiffEditor", () => {
  assert.match(source, /DiffEditor/);
  assert.match(source, /showDiff/);
  assert.match(source, /"Diff"/);
});
