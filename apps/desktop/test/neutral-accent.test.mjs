import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStyles, resolveThemeToken } from "./helpers/styles.mjs";

const stylesSource = await loadStyles();
const recentSource = await readFile(
  new URL("../src/lib/recent-projects.ts", import.meta.url),
  "utf8",
);

function luminance(hex) {
  return [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}

test("text on an accent fill is light and legible in both themes", () => {
  // Accent is FileBird's sky-600; white on it is ~4.1:1, so hold the 3:1 UI/large-text bar.
  for (const theme of ["light", "dark"]) {
    const fill = resolveThemeToken(stylesSource, theme, "--ds-accent");
    const ink = resolveThemeToken(stylesSource, theme, "--ds-accent-foreground");
    assert.match(fill ?? "", /^#[0-9a-f]{6}$/i, `${theme} accent resolves to ${fill}`);
    assert.match(ink ?? "", /^#[0-9a-f]{6}$/i, `${theme} accent foreground resolves to ${ink}`);
    const [lf, li] = [luminance(fill), luminance(ink)];
    assert.ok(li > lf, `${theme}: ${ink} on ${fill} is dark-on-blue`);
    const ratio = (li + 0.05) / (lf + 0.05);
    assert.ok(ratio >= 3, `${theme}: ${ink} on ${fill} = ${ratio.toFixed(2)}:1`);
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
