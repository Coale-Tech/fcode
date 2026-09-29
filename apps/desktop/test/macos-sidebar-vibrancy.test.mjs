import { readMainModule, readMainSource } from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const mainSource = await readMainSource();
const windowSource = await readMainModule("bootstrap/window.ts");
const lifecycleSource = await readMainModule("bootstrap/app-lifecycle.ts");
const stylesSource = await loadStyles();

const createWindowSource = windowSource.slice(windowSource.indexOf("export async function createWindow("));
const mainWindowBlock =
  createWindowSource.match(/mainWindow = new BrowserWindow\(\{[\s\S]*?\n  \}\);/)?.[0] ?? "";
const macOptions =
  mainWindowBlock.match(
    /\.\.\.\(process\.platform === "darwin"[\s\S]*?\n      : \{[\s\S]*?\n        \}\),/,
  )?.[0] ?? "";

function styleBlock(selector) {
  return stylesSource.match(new RegExp(`${selector}\\s*\\{[^}]*\\}`))?.[0] ?? "";
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `expected function ${name}`);
  const next = source.indexOf("\n  function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test("macOS main window enables native sidebar vibrancy only in its platform branch", () => {
  assert.match(macOptions, /titleBarStyle:\s*"hiddenInset"/);
  // The position itself lives in @pi-desktop/shared so the renderer's reserve
  // for it (styles/tokens.css) is derived from the same numbers.
  assert.match(macOptions, /trafficLightPosition:\s*MAC_TRAFFIC_LIGHT_POSITION/);
  assert.match(macOptions, /vibrancy:\s*"sidebar"/);
  assert.match(macOptions, /visualEffectState:\s*"followWindow"/);
  assert.match(macOptions, /transparent:\s*true/);
  assert.match(macOptions, /backgroundColor:\s*"#00000000"/);
  assert.doesNotMatch(
    mainWindowBlock,
    /vibrancy:\s*"under-window"/,
    "non-mac branch must not set under-window vibrancy",
  );

  // The shared opaque fallback remains in place for Windows/Linux, and comes
  // from the built-in theme table rather than a local literal.
  assert.match(
    mainWindowBlock,
    /backgroundColor:\s*builtinWindowBackground\(\s*nativeTheme\.shouldUseDarkColors \? "dark" : "light",?\s*\)/,
  );
  assert.match(mainWindowBlock, /frame: false/);
  assert.doesNotMatch(
    mainWindowBlock.replace(macOptions, ""),
    /vibrancy:\s*"sidebar"/,
    "sidebar vibrancy stays in the darwin branch",
  );
});

test("native theme source maps preferences and only resets vibrancy on change", () => {
  const applyNative = functionSource(lifecycleSource, "applyNativeThemeSource");
  const applyMenu = functionSource(lifecycleSource, "applyApplicationMenuSettings");
  const send = functionSource(mainSource, "sendToRenderer");

  assert.match(applyNative, /let next: "system" \| "light" \| "dark" = "system"/);
  assert.match(
    applyNative,
    /if \(isThemeColorScheme\(preference\)\) \{\s*next = preference;/,
  );
  assert.match(applyNative, /preference\.startsWith\("plugin:"\)/);
  assert.match(
    applyNative,
    /pluginTheme\?\.base === "light" \|\| pluginTheme\?\.base === "dark"/,
  );
  assert.match(applyNative, /next = pluginTheme\.base/);
  assert.doesNotMatch(
    applyNative,
    /next = pluginTheme\?\.base \?\?/,
    "a missing plugin theme must keep the system default, not a guessed base",
  );
  assert.match(applyNative, /if \(nativeTheme\.themeSource === next\) return;/);
  assert.match(
    applyNative,
    /nativeTheme\.themeSource = next;\s*if \(process\.platform === "darwin" && state\.mainWindow && !state\.mainWindow\.isDestroyed\(\)\) \{\s*state\.mainWindow\.setVibrancy\("sidebar"\);/,
  );

  // The theme mapping lives in `applyAppThemePreference` so the narrow plugin
  // `setTheme` path can never re-derive locale, keybindings, or dev-mode menu
  // state (ADR 0260). The full-settings path delegates to the same function.
  const applyTheme = functionSource(lifecycleSource, "applyAppThemePreference");
  assert.match(applyTheme, /applyNativeThemeSource\(\{\s*theme: preference \}\)/);
  assert.match(applyMenu, /applyAppThemePreference\(settings\?\.theme\)/);
  assert.match(
    send,
    /if \(channel === IPC\.event\.pluginChanged\) \{\s*applicationLifecycle\?\.applyNativeThemeSource\(\{\s*theme: applicationAppearanceState\.appThemePreference,/,
  );
});

test("the macOS startup splash shares the sidebar glass tint and sheen", () => {
  const macGlassBlock =
    stylesSource.match(
      /:root\[data-platform="darwin"\] \.startup-splash,\n:root\[data-platform="darwin"\] \.sidebar-surface,\n:root\[data-platform="darwin"\] \.sidebar-rail\s*\{[^}]*\}/,
    )?.[0] ?? "";
  assert.match(macGlassBlock, /background-color:\s*var\(--ds-sidebar-glass-tint\)/);
  assert.match(macGlassBlock, /var\(--ds-sidebar-glass-sheen-top\)/);
  assert.match(macGlassBlock, /var\(--ds-sidebar-glass-sheen-bottom\)/);
  assert.doesNotMatch(macGlassBlock, /var\(--ds-bg-primary\)/);
  // Keep splash `position: fixed`; relative is only for the dock surfaces.
  assert.doesNotMatch(macGlassBlock, /position:\s*relative/);

  // Other platforms keep the opaque boot surface; the glass is darwin-only.
  const baseSplashBlock = stylesSource.match(/\n\.startup-splash\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(baseSplashBlock, /background:\s*var\(--ds-bg-primary\)/);
  assert.doesNotMatch(baseSplashBlock, /glass/);

  assert.match(
    stylesSource,
    /:root\[data-platform="darwin"\] \.app-shell\.is-booting:has\(\.startup-splash:not\(\.is-exiting\)\)\s*>\s*:not\(\.startup-splash\)\s*\{\s*visibility:\s*hidden;/,
  );
  assert.match(
    stylesSource,
    /:root\[data-platform="darwin"\] \.app-shell\.is-booting:has\(\.startup-splash\.is-exiting\)\s*>\s*:not\(\.startup-splash\)\s*\{\s*opacity:\s*1;\s*transition:\s*opacity/,
  );
});

test("only macOS sidebar and splash surfaces receive the translucent glass treatment", () => {
  const macGlassBlock =
    stylesSource.match(
      /:root\[data-platform="darwin"\] \.startup-splash,\n:root\[data-platform="darwin"\] \.sidebar-surface,\n:root\[data-platform="darwin"\] \.sidebar-rail\s*\{[^}]*\}/,
    )?.[0] ?? "";
  assert.match(macGlassBlock, /background-color:\s*var\(--ds-sidebar-glass-tint\)/);
  // Sheen, not a flat tint — this is what keeps the material reading as glass.
  assert.match(macGlassBlock, /var\(--ds-sidebar-glass-sheen-top\)/);
  assert.match(macGlassBlock, /var\(--ds-sidebar-glass-sheen-bottom\)/);
  // No dock seam on any platform (D297): neither the macOS glass rule nor the
  // base `.sidebar` rule draws a right edge, so the glass meets the opaque main
  // pane flush and no transparent override is needed.
  assert.doesNotMatch(macGlassBlock, /border-right/);
  const baseSidebarBlock = stylesSource.match(/\n\.sidebar\s*\{[^}]*\}/)?.[0] ?? "";
  assert.doesNotMatch(baseSidebarBlock, /border-right/);

  const macAncestorBlock =
    stylesSource.match(
      /:root\[data-platform="darwin"\],\n:root\[data-platform="darwin"\] body,\n:root\[data-platform="darwin"\] #root,\n:root\[data-platform="darwin"\] \.app-shell,\n:root\[data-platform="darwin"\] \.settings-shell\s*\{[^}]*\}/,
    )?.[0] ?? "";
  assert.match(macAncestorBlock, /background:\s*transparent/);

  const mainPaneBlock = styleBlock("\\.main-pane");
  const mainTitlebarBlock = styleBlock("\\.main-titlebar");
  const conversationTopbarBlock = styleBlock("\\.conversation-topbar");
  for (const block of [mainPaneBlock, mainTitlebarBlock, conversationTopbarBlock]) {
    assert.match(block, /background:\s*var\(--ds-bg-primary\)/);
    assert.doesNotMatch(block, /transparent/);
  }
});

test("the sidebar glass tint stays thin enough to reveal the vibrancy material", () => {
  // Both theme blocks must define the glass tokens. The Espresso migration adds
  // @theme {} blocks early in the CSS cascade (before the :root[data-theme]
  // blocks), so the old pre-@theme slice is no longer a reliable boundary.
  // Instead we verify that each token appears exactly twice (once per theme) and
  // that the tint formula uses --ds-bg-sidebar with ≤60% opacity.
  for (const token of [
    "--ds-sidebar-glass-tint",
    "--ds-sidebar-glass-sheen-top",
    "--ds-sidebar-glass-sheen-bottom",
  ]) {
    const defs = (stylesSource.match(new RegExp(`^\\s*${token}:`, "gm")) ?? []);
    assert.equal(defs.length, 2, `${token} must be defined in both themes (found ${defs.length})`);
  }

  const tints = [
    ...stylesSource.matchAll(
      /--ds-sidebar-glass-tint:\s*color-mix\(in oklab,\s*var\(--ds-bg-sidebar\)\s*(\d+)%,\s*transparent\)/g,
    ),
  ];
  assert.equal(tints.length, 2, "tint must be defined in both themes");
  for (const [, pct] of tints) {
    assert.ok(
      Number(pct) <= 60,
      `tint ${pct}% is too opaque for the vibrancy material to show through`,
    );
  }

  // Both themes must define the tint so the contract is explicit: light theme
  // uses a 40% veil so the vibrancy grain is still visible through it.
  // Use regex to find a bare :root[data-theme="X"] { block (not a compound selector).
  for (const theme of ["dark", "light"]) {
    const re = new RegExp(`:root\\[data-theme="${theme}"\\]\\s*\\{`, "g");
    let m, idx = -1;
    while ((m = re.exec(stylesSource)) !== null) idx = m.index;
    assert.ok(idx >= 0, `expected :root[data-theme="${theme}"] { block in styles`);
    const block = stylesSource.slice(idx, stylesSource.indexOf("\n}", idx) + 2);
    assert.match(block, /--ds-sidebar-glass-tint:/, `${theme} must define --ds-sidebar-glass-tint`);
  }
});
