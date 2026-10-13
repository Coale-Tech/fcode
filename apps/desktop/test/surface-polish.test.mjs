import assert from "node:assert/strict";
import test from "node:test";
import { loadStyles, resolveThemeToken } from "./helpers/styles.mjs";

const styles = await loadStyles();

test("work panel uses a quiet light-theme inset surface", () => {
  // The light inset and its raised strips are tokens, not literals pinned by a
  // `:root[data-theme="light"]` override, so a contributed theme can move them
  // (D418). A literal here would put the dock out of every theme's reach.
  const dock = resolveThemeToken(styles, "light", "--ds-bg-dock");
  const raised = resolveThemeToken(styles, "light", "--ds-bg-dock-raised");
  assert.match(dock ?? "", /^#[0-9a-f]{6}$/i, `light dock resolves to ${dock}`);
  assert.notEqual(dock, raised, "light dock inset must differ from its raised strips");
});


test("settings and form controls use Direction D surfaces", () => {
  // F04: field focus uses accent border + 2px ring — verify tokens resolve correctly
  const da = resolveThemeToken(styles, "light", "--da");
  assert.match(da ?? "", /^#[0-9a-f]{6}$/i, `--da should be a hex colour, got ${da}`);
  const daBdr = resolveThemeToken(styles, "light", "--da-bdr");
  assert.match(daBdr ?? "", /^#[0-9a-f]{6}$/i, `--da-bdr should be a hex colour, got ${daBdr}`);
  // F06: toggle knob-on token used (not a per-theme literal override)
  const knobOn = resolveThemeToken(styles, "light", "--ds-switch-knob-on");
  assert.match(knobOn ?? "", /^#[0-9a-f]{6}$/i, `--ds-switch-knob-on should resolve to hex, got ${knobOn}`);
  // F06: dark OFF track uses solid surface-gray-3 (not alpha)
  const offTrack = resolveThemeToken(styles, "dark", "--ds-switch-track-off");
  assert.match(offTrack ?? "", /^#[0-9a-f]{6}$/i, `dark --ds-switch-track-off should be a solid hex, got ${offTrack}`);
  // F05: segment active resolves to elevation-1 bg and blue ink
  const surfaceElev1 = resolveThemeToken(styles, "light", "--surface-elevation-1");
  assert.match(surfaceElev1 ?? "", /^#[0-9a-f]{6}$/i, `--surface-elevation-1 light should be hex, got ${surfaceElev1}`);
});

test("switch on-track outranks the per-theme off-track", () => {
  /*
    A `:root[data-theme="light"] .settings-toggle` background declaration scores
    (0,3,0) and out-specifies `.settings-toggle.on` at (0,2,0), which strands the
    light theme on the pale off fill so only the knob slides. Off-track colours
    therefore live in the theme token blocks, not on this selector.
  */
  for (const token of [
    "--ds-switch-track-off",
    "--ds-switch-track-off-hover",
    "--ds-switch-knob-off",
    "--ds-switch-knob-on",
  ]) {
    const light = resolveThemeToken(styles, "light", token);
    const dark = resolveThemeToken(styles, "dark", token);
    assert.match(light ?? "", /^#[0-9a-f]{6}$/i, `${token} light should resolve to hex, got ${light}`);
    assert.match(dark ?? "", /^#[0-9a-f]{6}$/i, `${token} dark should resolve to hex, got ${dark}`);
  }
});

test("F01: settings nav active resolves through blue tint", () => {
  /* Active bg: --ds-settings-nav-active → --da-sub → --surface-violet-2 (blue tint, not gray) */
  const activeLight = resolveThemeToken(styles, "light", "--ds-settings-nav-active");
  assert.match(activeLight ?? "", /^#[0-9a-f]{6}$/i, `light nav-active should resolve to hex, got ${activeLight}`);
  /* Resolved color must differ from elevation-3 gray, proving it's the blue tint */
  const elev3Light = resolveThemeToken(styles, "light", "--surface-elevation-3");
  assert.notEqual(activeLight, elev3Light, "active nav bg should be blue tint, not elevation-3 gray");
  /* Active ink: --ds-settings-nav-label-active-ink → --da-txt (blue ink) */
  const activeInk = resolveThemeToken(styles, "light", "--ds-settings-nav-label-active-ink");
  assert.match(activeInk ?? "", /^#[0-9a-f]{6}$/i, `light nav-active-ink should resolve to hex, got ${activeInk}`);
});
