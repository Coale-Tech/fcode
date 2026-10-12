/**
 * D-accent contrast — accent fill, text, hover and switch-knob must be legible.
 * Text requirement: ≥4.5:1 (WCAG §1.4.3). Non-text/UI element: ≥3:1 (WCAG §1.4.11).
 *
 * Six text/fill/hover acceptance cases (C04):
 *   Light: accent fill → white label; accent text on white bg; hover fill → white label.
 *   Dark:  accent fill → dark foreground; accent text on dark bg; hover fill → dark foreground.
 *
 * Switch knob cases (existing + hover added):
 *   On-track: knob colour against accent fill in both themes (normal + hover).
 *   Approved deviation: dark on-accent glyph is #0a1f2e (R12) because white fails 3:1.
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

// ── Six text/fill/hover acceptance cases ──────────────────────────────────────

test("D-accent: light fill (#2578ab) passes 4.5:1 with white label", () => {
  const fill = resolveThemeToken(styles, "light", "--ds-accent");
  const fg   = resolveThemeToken(styles, "light", "--ds-accent-foreground");
  assert.match(fill ?? "", /^#[0-9a-f]{6}$/i, `light accent resolves to ${fill}`);
  assert.match(fg   ?? "", /^#[0-9a-f]{6}$/i, `light foreground resolves to ${fg}`);
  const ratio = contrast(fill, fg);
  assert.ok(ratio >= 4.5, `light fill ${fill} / fg ${fg} = ${ratio.toFixed(2)}:1 (need ≥4.5:1)`);
});

test("D-accent: light accent as text passes 4.5:1 on surface-base", () => {
  const ink  = resolveThemeToken(styles, "light", "--ds-accent");
  const base = resolveThemeToken(styles, "light", "--surface-base");
  assert.match(ink  ?? "", /^#[0-9a-f]{6}$/i, `light accent resolves to ${ink}`);
  assert.match(base ?? "", /^#[0-9a-f]{6}$/i, `light surface-base resolves to ${base}`);
  const ratio = contrast(ink, base);
  assert.ok(ratio >= 4.5, `light accent text ${ink} on ${base} = ${ratio.toFixed(2)}:1 (need ≥4.5:1)`);
});

test("D-accent: light hover fill passes 4.5:1 with white label", () => {
  const hover = resolveThemeToken(styles, "light", "--ds-accent-hover");
  const fg    = resolveThemeToken(styles, "light", "--ds-accent-foreground");
  assert.match(hover ?? "", /^#[0-9a-f]{6}$/i, `light accent-hover resolves to ${hover}`);
  const ratio = contrast(hover, fg);
  assert.ok(ratio >= 4.5, `light hover ${hover} / fg ${fg} = ${ratio.toFixed(2)}:1 (need ≥4.5:1)`);
});

test("D-accent: dark fill (#42a2d9) passes 4.5:1 with dark foreground (text, R12)", () => {
  const fill = resolveThemeToken(styles, "dark", "--ds-accent");
  const fg   = resolveThemeToken(styles, "dark", "--ds-accent-foreground");
  assert.match(fill ?? "", /^#[0-9a-f]{6}$/i, `dark accent resolves to ${fill}`);
  assert.match(fg   ?? "", /^#[0-9a-f]{6}$/i, `dark foreground resolves to ${fg}`);
  const ratio = contrast(fill, fg);
  assert.ok(ratio >= 4.5, `dark fill ${fill} / fg ${fg} = ${ratio.toFixed(2)}:1 (need ≥4.5:1 text)`);
});

test("D-accent: dark accent as text passes 4.5:1 on surface-base", () => {
  const ink  = resolveThemeToken(styles, "dark", "--ds-accent");
  const base = resolveThemeToken(styles, "dark", "--surface-base");
  assert.match(ink  ?? "", /^#[0-9a-f]{6}$/i, `dark accent resolves to ${ink}`);
  assert.match(base ?? "", /^#[0-9a-f]{6}$/i, `dark surface-base resolves to ${base}`);
  const ratio = contrast(ink, base);
  assert.ok(ratio >= 4.5, `dark accent text ${ink} on ${base} = ${ratio.toFixed(2)}:1 (need ≥4.5:1)`);
});

test("D-accent: dark hover fill passes 4.5:1 with dark foreground (text)", () => {
  const hover = resolveThemeToken(styles, "dark", "--ds-accent-hover");
  const fg    = resolveThemeToken(styles, "dark", "--ds-accent-foreground");
  assert.match(hover ?? "", /^#[0-9a-f]{6}$/i, `dark accent-hover resolves to ${hover}`);
  const ratio = contrast(hover, fg);
  assert.ok(ratio >= 4.5, `dark hover ${hover} / fg ${fg} = ${ratio.toFixed(2)}:1 (need ≥4.5:1 text)`);
});

// ── Switch knob cases (normal + hover, both themes) ───────────────────────────

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

  test(`D-accent: ${theme} switch knob-on passes 3:1 against hover-track (--ds-accent-hover)`, () => {
    const knob  = resolveThemeToken(styles, theme, "--ds-switch-knob-on");
    const hover = resolveThemeToken(styles, theme, "--ds-accent-hover");
    assert.match(knob  ?? "", /^#[0-9a-f]{6}$/i, `${theme} knob resolves to ${knob}`);
    assert.match(hover ?? "", /^#[0-9a-f]{6}$/i, `${theme} hover resolves to ${hover}`);
    const ratio = contrast(knob, hover);
    assert.ok(
      ratio >= 3,
      `${theme}: knob ${knob} on hover-track ${hover} = ${ratio.toFixed(2)}:1 (need ≥ 3:1)`,
    );
  });
}
