import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const recentSource = await readFile(
  new URL("../src/lib/recent-projects.ts", import.meta.url),
  "utf8",
);

test("project color dots stay on the gray ladder", () => {
  assert.doesNotMatch(recentSource, /#0285ff/i);
  assert.doesNotMatch(recentSource, /#7c5cff/i);
  const match = recentSource.match(/const COLORS = \[([^\]]+)\]/);
  assert.ok(match, "COLORS array missing");
  const hexes = match[1].match(/#[0-9a-fA-F]{6}/g) ?? [];
  assert.equal(hexes.length, 6);
  for (const hex of hexes) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // Near-gray: channels stay close and out of the blue brand range.
    assert.ok(Math.abs(r - g) <= 8 && Math.abs(g - b) <= 8, hex);
    assert.ok(b <= r + 8, `blue-leaning ${hex}`);
  }
});
