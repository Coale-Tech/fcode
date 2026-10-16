/**
 * renderer-api null-settings behavioural contract.
 *
 * setNavLayout() and setTheme() previously silently no-op'd when
 * AppSettings was null (fresh app, no bench/provider configured). Both
 * now fall back to a minimal stub so the capture rig can switch layouts.
 */
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

const src = await readFile(
  new URL("../src/capture/renderer-api.ts", import.meta.url),
  "utf8",
);

const navbarSrc = await readFile(
  new URL("../src/components/ShellNavbar.tsx", import.meta.url),
  "utf8",
);

// Extract the surface object literal body (implementation, not interface).
// The surface object starts with `setPage:` and ends with `...stubs`.
const surfaceBlock = src.match(/const surface[\s\S]*?\.\.\.stubs/)?.[0] ?? "";

test("setNavLayout applies store update even when settings is null", () => {
  assert.ok(surfaceBlock.length > 0, "surface object not found in renderer-api.ts");
  // Extract just the setNavLayout implementation body
  const block = surfaceBlock.match(/setNavLayout:[\s\S]*?(?=,\s*\n\s*clearProject:)/)?.[0] ?? "";
  assert.ok(block.length > 0, "setNavLayout implementation not found in surface object");
  // Must use nullish coalescing fallback
  assert.match(block, /\?\?/, "setNavLayout must use ?? fallback when settings is null");
  // Must not guard setState behind a bare `if (s)` check
  assert.doesNotMatch(
    block,
    /if\s*\(\s*s\s*\)\s*\w+\.setState/,
    "setNavLayout must not guard setState behind bare `if (s)`",
  );
  // Must always set DOM dataset attribute
  assert.match(block, /dataset\.navLayout/, "setNavLayout must always set dataset.navLayout");
});

test("setTheme applies store update even when settings is null", () => {
  assert.ok(surfaceBlock.length > 0, "surface object not found in renderer-api.ts");
  const block = surfaceBlock.match(/setTheme:[\s\S]*?(?=,\s*\n\s*setNavLayout:)/)?.[0] ?? "";
  assert.ok(block.length > 0, "setTheme implementation not found in surface object");
  // Must use nullish coalescing fallback
  assert.match(block, /\?\?/, "setTheme must use ?? fallback when settings is null");
  // Must not guard setState behind a bare `if (s)` check
  assert.doesNotMatch(
    block,
    /if\s*\(\s*s\s*\)\s*\w+\.setState/,
    "setTheme must not guard setState behind bare `if (s)`",
  );
});

test("setNavLayout fallback stub contains required AppSettings fields", () => {
  const block = surfaceBlock.match(/setNavLayout:[\s\S]*?(?=,\s*\n\s*clearProject:)/)?.[0] ?? "";
  assert.ok(block.length > 0, "setNavLayout implementation not found");
  assert.match(block, /theme\s*:/, "stub must have theme field");
  assert.match(block, /defaultMode\s*:/, "stub must have defaultMode field");
  assert.match(block, /enterToSend\s*:/, "stub must have enterToSend field");
  assert.match(block, /onboardingDismissed\s*:/, "stub must have onboardingDismissed field");
});

test("ShellNavbar renders right cluster in all layouts without tabs guard", () => {
  const endIdx = navbarSrc.indexOf("shell-navbar-end");
  assert.ok(endIdx >= 0, "shell-navbar-end class not found in ShellNavbar.tsx");
  // 300 chars before shell-navbar-end must not gate it behind layout === "tabs"
  const before = navbarSrc.slice(Math.max(0, endIdx - 300), endIdx);
  assert.doesNotMatch(
    before,
    /layout\s*===\s*["']tabs["']/,
    "shell-navbar-end must not be gated behind layout === 'tabs'",
  );
});
