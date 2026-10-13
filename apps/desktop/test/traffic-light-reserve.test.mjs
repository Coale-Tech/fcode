import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

const sharedSource = await read("../../../packages/shared/src/window-chrome.ts");
const windowSource = await read("../electron/main/bootstrap/window.ts");
const tokensSource = await read("../src/styles/tokens.css");
const chromeSource = await read("../src/styles/chrome.css");
const workPanelSource = await read("../src/styles/work-panel.css");
const globalStyles = await loadStyles();



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
});

test("the reserve collapses where there are no native traffic lights", () => {
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
