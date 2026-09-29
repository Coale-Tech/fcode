import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

const sharedSource = await read("../../../packages/shared/src/window-chrome.ts");
const windowSource = await read("../electron/main/bootstrap/window.ts");
const entrySource = await read("../src/main.tsx");
const tokensSource = await read("../src/styles/tokens.css");
const chromeSource = await read("../src/styles/chrome.css");
const workPanelSource = await read("../src/styles/work-panel.css");
const globalStyles = await loadStyles();

test("the macOS traffic lights have one geometry owner across processes", () => {
  // The renderer reserves space for these buttons, so a second literal for
  // where they sit is exactly the drift the shared constant exists to prevent.
  assert.match(
    windowSource,
    /trafficLightPosition:\s*MAC_TRAFFIC_LIGHT_POSITION/,
  );
  assert.doesNotMatch(windowSource, /trafficLightPosition:\s*\{\s*x:/);
  assert.match(
    sharedSource,
    /export const MAC_TRAFFIC_LIGHT_POSITION = \{ x: 16, y: 16 \}/,
  );
  // The footprint the renderer reserves is derived from the position the main
  // process applies, so moving the buttons moves the reserve with them.
  assert.match(
    sharedSource,
    /export const MAC_TRAFFIC_LIGHT_EDGE_DIP =\s*MAC_TRAFFIC_LIGHT_POSITION\.x \+ MAC_TRAFFIC_LIGHT_CLUSTER_WIDTH_DIP;/,
  );
});

test("the renderer publishes the native footprint before first paint", () => {
  assert.match(
    entrySource,
    /import \{ MAC_TRAFFIC_LIGHT_EDGE_DIP \} from "@pi-desktop\/shared";/,
  );
  const bootstrap = entrySource.slice(
    0,
    entrySource.indexOf("installScrollbarReveal(document)"),
  );
  const platform = bootstrap.indexOf("dataset.platform");
  const publish = bootstrap.indexOf('"--ds-traffic-light-edge"');
  assert.ok(
    platform !== -1 && publish > platform,
    "the inset is published after the platform attribute that gates it",
  );
  assert.match(
    bootstrap,
    /if \(document\.documentElement\.dataset\.platform === "darwin"\) \{\s*document\.documentElement\.style\.setProperty\(\s*"--ds-traffic-light-edge",\s*`\$\{MAC_TRAFFIC_LIGHT_EDGE_DIP\}px`,\s*\);\s*\}/,
  );
});

test("every shell surface reserves the shared lead inset", () => {
  // Comments may quote the old footprint while explaining the geometry; only
  // declarations can drift.
  const declarationsOnly = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [name, source] of [
    ["chrome.css", chromeSource],
    ["work-panel.css", workPanelSource],
    ["tokens.css", tokensSource],
  ]) {
    assert.doesNotMatch(
      declarationsOnly(source),
      /(?:padding-left|margin-left|left|--[\w-]+):[^;]*\b76px\b/,
      `${name} must not restate the traffic-light footprint`,
    );
  }
  // One composition, on the platform that has the buttons.
  assert.match(
    chromeSource,
    /:root\[data-platform="darwin"\] \{\s*--ds-window-lead-inset: calc\(\s*var\(--ds-traffic-light-edge\) \+ var\(--ds-traffic-light-gap\)\s*\);/,
  );
  assert.equal(
    [...globalStyles.matchAll(/--ds-window-lead-inset:\s*calc\(/g)].length,
    1,
    "the reserve is composed in exactly one place",
  );
  // The nav rail owns the window's left edge: it drops its buttons below the
  // lights, and surfaces beside it consume only what the rail leaves over.
  assert.match(
    chromeSource,
    /:root\[data-platform="darwin"\]:not\(\[data-fullscreen="true"\]\) \.nav-rail \{\s*padding-top:\s*var\(--ds-toolbar-height\);/,
  );
  assert.match(
    chromeSource,
    /--ds-pane-lead-inset:\s*max\(\s*8px,\s*calc\(var\(--ds-window-lead-inset\) - var\(--nav-rail-width\)\)\s*\);/,
  );
  assert.match(
    chromeSource,
    /:root\[data-platform="darwin"\] \.sidebar-header \{[\s\S]*?padding-left:\s*var\(--ds-pane-lead-inset\);/,
  );
  assert.match(
    chromeSource,
    /:root\[data-platform="darwin"\] \.app-shell\.work-panel-maximized\.sidebar-collapsed \{[^}]*--preview-chrome-inset:\s*var\(--ds-pane-lead-inset\);/,
  );
  assert.match(
    chromeSource,
    /\.window-chrome-row \{[^}]*left:\s*var\(--nav-rail-width\);[^}]*padding-left:\s*var\(--preview-chrome-inset\);/,
  );
  assert.match(
    chromeSource,
    /:root\[data-platform="darwin"\] \.conversation-topbar\.ct-collapsed \{[\s\S]*?--ct-lead-inset:\s*var\(--ds-pane-lead-inset\)/,
  );
  // The titlebar row already pads 12px, so its title adds only the difference,
  // clamped so a platform without native lights never goes negative.
  assert.match(
    chromeSource,
    /\.main-titlebar-left \{[\s\S]*?padding-left:\s*max\(0px, calc\(var\(--ds-pane-lead-inset\) - 12px\)\);/,
  );
  assert.match(
    workPanelSource,
    /\.work-panel-header \{[^}]*margin-left: calc\(var\(--preview-chrome-inset\) \+ var\(--preview-chrome-action-lane\)\);/,
  );
});

test("the reserve collapses where there are no native traffic lights", () => {
  assert.match(tokensSource, /--ds-traffic-light-edge: 0px/);
  assert.match(tokensSource, /--ds-traffic-light-gap: 12px/);
  assert.match(tokensSource, /--ds-window-lead-inset: 0px/);
  // Fullscreen hides the buttons: the reserve becomes the ordinary gutter.
  assert.match(
    chromeSource,
    /:root\[data-platform="darwin"\]\[data-fullscreen="true"\] \{\s*--ds-window-lead-inset: 8px;/,
  );
  // Windows/Linux draw their own controls on the right and reserve nothing on
  // the left.
  for (const rule of globalStyles.matchAll(
    /:root\[data-platform="(?:win32|linux)"\][^{]*\{([^}]*)\}/g,
  )) {
    assert.doesNotMatch(
      rule[1],
      /--ds-window-lead-inset/,
      "only macOS reserves space for native traffic lights",
    );
  }
});
