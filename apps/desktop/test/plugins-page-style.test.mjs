import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const stylesSource = await loadStyles();

function pluginsSection(source) {
  const start = source.indexOf("/* ---- Plugins marketplace");
  assert.ok(start >= 0, "plugins marketplace section missing");
  return source.slice(start);
}

test("plugins page styles use design tokens in both themes", () => {
  const section = pluginsSection(stylesSource);

  // No blue-slate hardcodes / non-ds fallbacks from the old market CSS.
  for (const bad of [
    "#4f7cff",
    "#2a3144",
    "#9aa6bf",
    "#e8eefc",
    "#121826",
    "#0b1020",
    "#8df0c2",
    "var(--accent",
    "var(--text-primary",
    "var(--border-subtle",
    "var(--bg-elevated",
    "color-mix(in srgb",
  ]) {
    assert.equal(section.includes(bad), false, `leftover ${bad}`);
  }

  assert.match(section, /\.plugins-segment-btn\.active\s*\{[\s\S]*?--ds-text-primary/);
  assert.match(section, /\.plugins-header-menu\s*\{[^}]*background:\s*var\(--plugins-tile\)/);
  assert.match(section, /\.plugins-search\s*\{[\s\S]*?--ds-text-primary/);
  assert.match(section, /\.plugins-modal\s*\{[\s\S]*?--ds-bg-elevated-opaque/);
  assert.match(section, /\.plugins-installed-mark\s*\{[\s\S]*?--ds-success/);
  // The permission-review veil is a token now (issue #341): light's 32% ink sits
  // in the light token block instead of a literal `:root[data-theme]` override,
  // and dark reads the same token from the base rule.
  assert.match(
    section,
    /\.plugins-modal-backdrop\s*\{[^}]*background:\s*var\(--ds-modal-veil\)/,
  );
  assert.equal((stylesSource.match(/^\s*--ds-modal-veil:/gm) ?? []).length, 2);
  assert.doesNotMatch(stylesSource, /:root\[data-theme="light"\] \.plugins-modal-backdrop/);
  // D296: the header, title glyph and segmented control carry tone, not rules.
  assert.doesNotMatch(section, /\.plugins-page-header\s*\{[^}]*border-bottom/);
  assert.match(section, /\.plugins-title-icon\s*\{[^}]*background:\s*var\(--plugins-tile-deep\)/);
  assert.doesNotMatch(section, /\.plugins-title-icon\s*\{[^}]*border:/);
  assert.match(section, /\.plugins-segment\s*\{[^}]*border-radius:\s*var\(--radius-full\)/);
  assert.doesNotMatch(section, /\.plugins-segment\s*\{[^}]*(border:|box-shadow:)/);
  assert.match(section, /\.plugins-segment-btn\.active\s*\{[^}]*box-shadow:\s*var\(--plugins-raised-shadow\)/);

  // Structural/metric pins (lines 57-59) removed per C06 test policy:
  // source-text CSS-regex pins that lock superseded design are deleted, not repinned.
  // Accent button fill/hover/text contrast is covered by d-accent-contrast.test.mjs;
  // primary/secondary button styling is verified by visual smoke.
});

test("plugins page styles tier permission risk with semantic tokens", () => {
  const section = pluginsSection(stylesSource);

  assert.match(section, /\.plugins-perm-chip\.risk-high\s*\{[\s\S]*?--ds-warning/);
  assert.match(section, /\.plugins-risk-group\.risk-high\s*\{[\s\S]*?--ds-error/);
  assert.doesNotMatch(section, /\.plugins-hero|\.plugins-stat/);
  assert.match(section, /\.plugins-sheet\s*\{/);
  assert.match(section, /@media \(prefers-reduced-motion: reduce\)/);
});


test("installed rows default to a calm summary with accessible details", () => {
  const section = pluginsSection(stylesSource);

  assert.match(section, /\.plugins-row\s*\{[^}]*align-items:\s*center[^}]*padding:\s*13px 16px/);
  assert.match(section, /\.plugins-row-details\s*\{/);
  assert.match(section, /\.plugins-row-details-body\s*\{[^}]*background:\s*var\(--plugins-raised\)[^}]*box-shadow:\s*var\(--plugins-raised-shadow\)/);
  assert.match(section, /\.plugins-row-details-toggle:focus-visible\s*\{/);
  assert.match(section, /\.plugins-row-details\[open\] \.plugins-row-details-toggle > svg/);
});

test("installed row controls share one aligned rail and explain icon actions", () => {
  const section = pluginsSection(stylesSource);

  assert.match(section, /\.plugins-row-controls\s*\{[\s\S]*?margin-left:\s*auto/);
  assert.match(section, /\.plugins-row-actions\s*\{[\s\S]*?opacity:\s*1/);
  assert.doesNotMatch(section, /\.plugins-row:hover \.plugins-row-actions/);
  assert.match(section, /\.plugins-icon-btn\s*\{[\s\S]*?position:\s*relative/);
  assert.match(section, /\.plugins-icon-btn\s*\{/);
});

// The 46px titlebar band floats over the destination pages on every platform: it
// is an opaque absolute .main-titlebar and a native drag rectangle, and on
// Windows/Linux the renderer-drawn window controls own the conversation pane's
// rightmost 120px. The page header lives in that band, so the frame must reserve
// it on macOS too or the title row paints underneath. The plugins page is the one
// destination page with controls in that corner (header actions, detail-sheet
// close), so both must clear the band. The sheet's fixed layer stacks inside the
// route surface (its entry animation leaves a transform behind), so the band
// paints over the sheet on every platform and the sheet reserves it everywhere.
test("plugins page keeps its header clear of the titlebar band on every platform", () => {
  assert.match(
    stylesSource,
    /:root\[data-platform="win32"\] \.page-frame,\s*:root\[data-platform="linux"\] \.page-frame,\s*:root\[data-platform="darwin"\] \.page-frame\s*\{[^}]*padding-top:\s*calc\(var\(--ds-toolbar-height\) \+ 8px\)/,
  );

  const section = pluginsSection(stylesSource);

  assert.match(section, /\.plugins-sheet\s*\{[^}]*padding-top:\s*var\(--ds-toolbar-height\)/);
  for (const selector of ["\\.plugins-header-actions", "\\.plugins-sheet-head"]) {
    assert.match(
      section,
      new RegExp(`${selector}\\s*\\{[^}]*-webkit-app-region:\\s*no-drag`),
      `${selector} must opt out of the titlebar drag rectangle`,
    );
  }
});
