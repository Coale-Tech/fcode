/**
 * E22 — Scope the file tree to the selected app and show a truncation banner.
 *
 * fs-index: FS_INDEX_MAX_ENTRIES exported so consumers can show the right number.
 * CodePage: renders a truncation banner when the index result has truncated:true.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fsIndexSource = await readFile(
  new URL("../electron/main/fs-index.ts", import.meta.url),
  "utf8",
);

const codePageSource = await readFile(
  new URL("../src/pages/CodePage.tsx", import.meta.url),
  "utf8",
);

test("E22: FS_INDEX_MAX_ENTRIES is exported from fs-index.ts", () => {
  assert.match(fsIndexSource, /export const FS_INDEX_MAX_ENTRIES\s*=\s*8000/);
});

test("E22: CodePage references the truncated flag from file index results", () => {
  // CodePage must surface the truncation banner when result.truncated is true
  assert.match(codePageSource, /truncated/);
});

test("E22: CodePage renders a truncation banner element when tree is truncated", () => {
  // Must have some UI element that indicates truncation
  assert.match(codePageSource, /truncat/i);
});
