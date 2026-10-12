/**
 * D-accent contrast — switch knob must be legible against its track.
 * Non-text UI element requirement: ≥ 3:1 (WCAG 2 §1.4.11).
 *
 * In dark theme the on-track is --ds-accent (#42a2d9). The prior white knob
 * was 2.84:1 (fail); the fix routes --ds-switch-knob-on to --ds-accent-foreground
 * (#0a1f2e = 5.63:1, pass).  Both themes are checked here so a future token
 * change that breaks contrast is caught automatically.
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

for (const theme of ["dark", "light"]) {
  test(`D-accent: ${theme} switch knob-on passes 3:1 against on-track (--ds-accent)`, () => {
    const knob  = resolveThemeToken(styles, theme, "--ds-switch-knob-on");
    const track = resolveThemeToken(styles, theme, "--ds-accent");
    assert.match(knob  ?? "", /^#[0-9a-f]{6}$/i, `${theme} knob  resolves to ${knob}`);
    assert.match(track ?? "", /^#[0-9a-f]{6}$/i, `${theme} track resolves to ${track}`);
    const ratio = contrast(knob, track);
    assert.ok(
      ratio >= 3,
      `${theme}: knob ${knob} on track ${track} = ${ratio.toFixed(2)}:1 (need ≥ 3:1)`,
    );
  });
}
