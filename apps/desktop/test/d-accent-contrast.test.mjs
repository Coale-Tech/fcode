/**
 * Direction D accent: the FileBird blue must stay legible as (a) text/focus
 * ring on the page background and (b) a button fill carrying its label.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { loadStyles, resolveThemeToken } from "./helpers/styles.mjs";

const styles = await loadStyles();
const lum = (hex) =>
  [0, 2, 4]
    .map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

for (const theme of ["light", "dark"]) {
  const tok = (n) => resolveThemeToken(styles, theme, n);
  test(`D accent: ${theme} accent is text-legible on the page background`, () => {
    assert.ok(ratio(tok("--ds-accent"), tok("--ds-bg-primary")) >= 4.5);
  });
  test(`D accent: ${theme} accent fill carries its foreground label`, () => {
    assert.ok(ratio(tok("--ds-accent"), tok("--ds-accent-foreground")) >= 4.5);
  });
  test(`D accent: ${theme} hover keeps the label legible`, () => {
    assert.ok(ratio(tok("--ds-accent-hover"), tok("--ds-accent-foreground")) >= 4.5);
  });
}
