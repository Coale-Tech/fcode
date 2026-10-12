import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStyles, resolveThemeToken } from "./helpers/styles.mjs";

const styles = await loadStyles();
const globalsCss = readFileSync(new URL("../src/styles/globals.css", import.meta.url), "utf8");

test("work panel uses a quiet light-theme inset surface", () => {
  // The light inset and its raised strips are tokens, not literals pinned by a
  // `:root[data-theme="light"]` override, so a contributed theme can move them
  // (D418). A literal here would put the dock out of every theme's reach.
  const dock = resolveThemeToken(styles, "light", "--ds-bg-dock");
  const raised = resolveThemeToken(styles, "light", "--ds-bg-dock-raised");
  assert.match(dock ?? "", /^#[0-9a-f]{6}$/i, `light dock resolves to ${dock}`);
  assert.notEqual(dock, raised, "light dock inset must differ from its raised strips");
  assert.match(styles, /\.work-panel\s*\{[\s\S]*?background:\s*var\(--ds-bg-dock\)/);
  assert.match(
    styles,
    /\.work-panel-header\s*\{[\s\S]*?background:\s*var\(--ds-bg-dock-raised\)/,
  );
  assert.doesNotMatch(styles, /:root\[data-theme="light"\]\s+\.work-panel\s*\{/);
  assert.match(
    styles,
    /\.work-panel-tab-strip\s*\{[\s\S]*?display:\s*flex/,
  );
  assert.match(
    styles,
    /\.work-panel-launcher-row:hover\s*\{[\s\S]*?background:\s*var\(--ds-bg-hover\)/,
  );
});

test("work panel interactive rows ease hover fills with motion tokens", () => {
  for (const selector of [
    ".file-tree-row",
    ".review-change-card-header",
    ".work-panel-resize",
    ".work-browser-url input",
  ]) {
    const re = new RegExp(
      `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{[\\s\\S]*?transition:[\\s\\S]*?var\\(--motion-duration-fast\\)`,
    );
    assert.match(styles, re, `${selector} should transition with motion tokens`);
  }
});

test("interactive controls ease hover/focus transitions with motion tokens", () => {
  /* F03: .btn no longer has press-scale; test only the motion-token easing present. */
  for (const selector of [
    ".icon-btn",
    ".title-nav-btn",
    ".nav-item",
    ".copy-btn",
    ".sidebar-toolbar-button",
    ".sidebar-session-group-add",
  ]) {
    const escaped = selector.replace(".", "\\.");
    const re = new RegExp(
      `${escaped}\\s*\\{[\\s\\S]*?transform var\\(--motion-duration-fast\\)`,
    );
    assert.match(styles, re, `${selector} should ease pressed feedback`);
  }
  /* Composer send/stop still have press feedback (not button primitives) */
  assert.match(styles, /\.send-btn:active:not\(:disabled\)[\s\S]*?scale\(0\.94\)/);
  assert.match(styles, /\.stop-btn:active:not\(:disabled\)[\s\S]*?scale\(0\.94\)/);
});

test("settings and form controls use Direction D surfaces", () => {
  // F04: field focus uses accent border + 2px ring — verify tokens resolve correctly
  assert.doesNotMatch(styles, /:root\[data-theme="light"\]\s+\.field-input/);
  const da = resolveThemeToken(styles, "light", "--da");
  assert.match(da ?? "", /^#[0-9a-f]{6}$/i, `--da should be a hex colour, got ${da}`);
  const daBdr = resolveThemeToken(styles, "light", "--da-bdr");
  assert.match(daBdr ?? "", /^#[0-9a-f]{6}$/i, `--da-bdr should be a hex colour, got ${daBdr}`);
  // F06: toggle knob-on token used (not a per-theme literal override)
  assert.doesNotMatch(styles, /:root\[data-theme="light"\]\s+\.settings-toggle\.on\s+\.settings-toggle-thumb\s*\{[^}]*background:/);
  const knobOn = resolveThemeToken(styles, "light", "--ds-switch-knob-on");
  assert.match(knobOn ?? "", /^#[0-9a-f]{6}$/i, `--ds-switch-knob-on should resolve to hex, got ${knobOn}`);
  // F06: dark OFF track uses solid surface-gray-3 (not alpha)
  const offTrack = resolveThemeToken(styles, "dark", "--ds-switch-track-off");
  assert.match(offTrack ?? "", /^#[0-9a-f]{6}$/i, `dark --ds-switch-track-off should be a solid hex, got ${offTrack}`);
  // F05: segment active resolves to elevation-1 bg and blue ink
  const surfaceElev1 = resolveThemeToken(styles, "light", "--surface-elevation-1");
  assert.match(surfaceElev1 ?? "", /^#[0-9a-f]{6}$/i, `--surface-elevation-1 light should be hex, got ${surfaceElev1}`);
  assert.doesNotMatch(styles, /:root\[data-theme="light"\]\s+\.shortcut-keybinding\s+kbd/);
  assert.match(
    styles,
    /\.shortcut-keybinding kbd\s*\{[^}]*background:\s*var\(--ds-raised\)[^}]*box-shadow:\s*var\(--ds-raised-shadow\)/,
  );
  assert.doesNotMatch(styles, /\.shortcut-keybinding kbd\s*\{[^}]*border:/);
  // Dialog scrim is a token (issue #341).
  assert.match(styles, /:root\[data-theme="light"\]\s*\{[^}]*--ds-scrim:/);
  assert.match(styles, /\.overlay\s*\{[^}]*background:\s*var\(--ds-scrim\)/);
  assert.doesNotMatch(styles, /:root\[data-theme="light"\]\s+\.overlay\s*\{/);
});

test("switch on-track outranks the per-theme off-track", () => {
  /*
    A `:root[data-theme="light"] .settings-toggle` background declaration scores
    (0,3,0) and out-specifies `.settings-toggle.on` at (0,2,0), which strands the
    light theme on the pale off fill so only the knob slides. Off-track colours
    therefore live in the theme token blocks, not on this selector.
  */
  assert.doesNotMatch(
    styles,
    /:root\[data-theme="(light|dark)"\]\s+\.settings-toggle\s*\{[^}]*background:/,
  );
  assert.match(
    styles,
    /\.settings-toggle\.on\s*\{[^}]*background:\s*var\(--ds-accent\)/,
  );
  // D297: the off track is a fill alone; no inset ring on either state. Focus
  // is the only ring, and it sits outside the track.
  assert.doesNotMatch(styles, /\.settings-toggle(\.on)?\s*\{[^}]*inset 0 0 0 1px/);
  assert.match(
    styles,
    /\.settings-toggle:focus-visible,\n\.settings-toggle\.on:focus-visible\s*\{[^}]*box-shadow:\s*0 0 0 2px/,
  );
  // Both themes must define the switch tokens, or one falls back to nothing.
  for (const token of [
    "--ds-switch-track-off",
    "--ds-switch-track-off-hover",
    "--ds-switch-knob-off",
    "--ds-switch-knob-on",
  ]) {
    const defs = styles.match(new RegExp(`^\\s*${token}:`, "gm")) ?? [];
    assert.equal(defs.length, 2, `${token} should be defined in both themes`);
  }
});

test("F01: settings nav active resolves through blue tint and d-tokens loads before theme-overrides", () => {
  /* Active bg: --ds-settings-nav-active → --da-sub → --surface-violet-2 (blue tint, not gray) */
  const activeLight = resolveThemeToken(styles, "light", "--ds-settings-nav-active");
  assert.match(activeLight ?? "", /^#[0-9a-f]{6}$/i, `light nav-active should resolve to hex, got ${activeLight}`);
  /* Resolved color must differ from elevation-3 gray, proving it's the blue tint */
  const elev3Light = resolveThemeToken(styles, "light", "--surface-elevation-3");
  assert.notEqual(activeLight, elev3Light, "active nav bg should be blue tint, not elevation-3 gray");
  /* Active ink: --ds-settings-nav-label-active-ink → --da-txt (blue ink) */
  const activeInk = resolveThemeToken(styles, "light", "--ds-settings-nav-label-active-ink");
  assert.match(activeInk ?? "", /^#[0-9a-f]{6}$/i, `light nav-active-ink should resolve to hex, got ${activeInk}`);
  /* Plugin-theme precedence: d-tokens.css must load before theme-overrides.css in globals.css */
  const dTokensPos = globalsCss.indexOf("d-tokens.css");
  const themeOverridesPos = globalsCss.indexOf("theme-overrides.css");
  assert.ok(dTokensPos !== -1, "d-tokens.css must be imported in globals.css");
  assert.ok(themeOverridesPos !== -1, "theme-overrides.css must be imported in globals.css");
  assert.ok(dTokensPos < themeOverridesPos, "d-tokens.css must precede theme-overrides.css so plugin themes win");
});
