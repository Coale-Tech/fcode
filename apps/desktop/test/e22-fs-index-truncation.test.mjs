/**
 * E22 — fs-index exports FS_INDEX_MAX_ENTRIES so consumers can show the right number.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fsIndexSource = await readFile(
  new URL("../electron/main/fs-index.ts", import.meta.url),
  "utf8",
);

test("E22: FS_INDEX_MAX_ENTRIES is exported from fs-index.ts", () => {
  assert.match(fsIndexSource, /export const FS_INDEX_MAX_ENTRIES\s*=\s*8000/);
});
