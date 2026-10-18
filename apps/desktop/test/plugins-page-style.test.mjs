import assert from "node:assert/strict";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const stylesSource = await loadStyles();

function pluginsSection(source) {
  const start = source.indexOf("/* ---- Plugins marketplace");
  assert.ok(start >= 0, "plugins marketplace section missing");
  return source.slice(start);
}

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
