import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStyles, resolveThemeToken } from "./helpers/styles.mjs";

const stylesSource = await loadStyles();
const recentSource = await readFile(
  new URL("../src/lib/recent-projects.ts", import.meta.url),
  "utf8",
);

test("design accent tokens resolve to neutral gray in both themes", () => {
  // Espresso ships --blue-N primitives for status/info; only the accent must stay gray.
  for (const theme of ["light", "dark"]) {
    for (const name of ["--ds-accent", "--ds-accent-hover", "--ds-accent-soft"]) {
      const hex = resolveThemeToken(stylesSource, theme, name);
      assert.match(hex ?? "", /^#[0-9a-f]{6}$/i, `${theme} ${name} resolves to ${hex}`);
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 8, `${theme} ${name} ${hex} is not gray`);
    }
  }
});

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
