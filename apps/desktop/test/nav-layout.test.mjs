import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { NAV_LAYOUTS, DEFAULT_NAV_LAYOUT } = await import("@pi-desktop/shared");
const { resolveNavLayout, shellChromeWidth, nextNavLayout } = await import("../src/lib/nav-layout.ts");

test("an absent or corrupt saved layout resolves to the default, never a broken shell", () => {
  for (const v of [undefined, null, "", "dock", 2, {}, "TABS"]) {
    assert.equal(resolveNavLayout(v), DEFAULT_NAV_LAYOUT);
  }
  assert.equal(DEFAULT_NAV_LAYOUT, "rail");
  for (const v of NAV_LAYOUTS) assert.equal(resolveNavLayout(v), v);
});

test("column budget reserves the layout's rail plus the 12px canvas gap on both sides", () => {
  assert.equal(shellChromeWidth("tabs"), 24);
  assert.equal(shellChromeWidth("rail"), 74);
  assert.equal(shellChromeWidth("island"), 84);
});

test("column budget accounts for D2 expanded rail width", () => {
  assert.equal(shellChromeWidth("rail", true), 244);   // 220 + 12*2
  assert.equal(shellChromeWidth("rail", false), 74);   // 50 + 12*2 (same as collapsed)
  // other layouts ignore the rail-expanded flag
  assert.equal(shellChromeWidth("tabs", true), 24);
  assert.equal(shellChromeWidth("island", true), 84);
});

test("settings writes reject an unknown navLayout and keep other preferences", async () => {
  const { validateSettingsWrite } = await import("../src/lib/api.ts");
  const base = { defaultMode: "agent", theme: "dark", enterToSend: true, onboardingDismissed: false };
  for (const navLayout of NAV_LAYOUTS) {
    const next = { ...base, navLayout };
    assert.equal(validateSettingsWrite(next), next);
  }
  assert.equal(validateSettingsWrite(base), base);
  assert.throws(() => validateSettingsWrite({ ...base, navLayout: "dock" }), /navLayout is invalid/);
});

test("nextNavLayout cycles through all layouts in both directions and returns null for non-arrow keys", () => {
  // forward
  assert.equal(nextNavLayout("tabs", "ArrowRight"), "rail");
  assert.equal(nextNavLayout("rail", "ArrowRight"), "island");
  assert.equal(nextNavLayout("island", "ArrowRight"), "tabs");   // wrap-around
  assert.equal(nextNavLayout("tabs", "ArrowDown"), "rail");
  // backward
  assert.equal(nextNavLayout("rail", "ArrowLeft"), "tabs");
  assert.equal(nextNavLayout("tabs", "ArrowLeft"), "island");    // wrap-around
  assert.equal(nextNavLayout("island", "ArrowUp"), "rail");
  assert.equal(nextNavLayout("tabs", "ArrowUp"), "island");      // wrap-around
  // non-arrow → null
  assert.equal(nextNavLayout("rail", "Enter"), null);
  assert.equal(nextNavLayout("rail", " "), null);
  assert.equal(nextNavLayout("tabs", "Tab"), null);
});
