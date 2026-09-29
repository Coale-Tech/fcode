/**
 * T13 — status tokens must stay legible: every --ds-{success,warning,error}
 * resolves to a colour with ≥ 4.5:1 WCAG 2.x contrast against
 * --ds-bg-primary, in both themes, through the Espresso var() chain.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { loadStyles, resolveThemeToken } from "./helpers/styles.mjs";

const styles = await loadStyles();

function luminance(hex) {
  const h = hex.replace("#", "").slice(0, 6);
  return [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

for (const theme of ["light", "dark"]) {
  const bg = resolveThemeToken(styles, theme, "--ds-bg-primary");
  for (const status of ["success", "warning", "error"]) {
    test(`T13: ${theme} --ds-${status} passes 4.5:1 on --ds-bg-primary`, () => {
      const ink = resolveThemeToken(styles, theme, `--ds-${status}`);
      assert.match(bg ?? "", /^#[0-9a-f]{6}$/i, `${theme} bg resolves to ${bg}`);
      assert.match(ink ?? "", /^#[0-9a-f]{6}$/i, `${theme} ${status} resolves to ${ink}`);
      const ratio = contrast(ink, bg);
      assert.ok(ratio >= 4.5, `${theme} ${status} ${ink} on ${bg} = ${ratio.toFixed(2)}:1`);
    });
  }
}
