/**
 * T3 — Register Mod+1..4 and Mod+Shift+B in the shared shortcut table.
 *
 * These shortcuts navigate between the four top-level surfaces and toggle
 * bench log follow-tail, passing the existing conflict-detection logic and
 * remaining user-overridable through KeyboardShortcutsSection.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readStoreSourceSync } from "./helpers/store-source.mjs";

const source = await readFile(
  new URL("../../../packages/shared/src/keyboard-shortcuts.ts", import.meta.url),
  "utf8",
);
const runtimeSource = await readFile(
  new URL("../src/features/app/useAppShellRuntime.tsx", import.meta.url),
  "utf8",
);
const storeSource = readStoreSourceSync();
const benchPageSource = await readFile(
  new URL("../src/pages/BenchPage.tsx", import.meta.url),
  "utf8",
);

test("T3: KEYBOARD_SHORTCUT_IDS includes the five new navigation shortcuts", () => {
  assert.match(source, /"navToChat"/);
  assert.match(source, /"navToCode"/);
  assert.match(source, /"navToBuild"/);
  assert.match(source, /"navToBench"/);
  assert.match(source, /"toggleFollowLog"/);
});

test("T3: new shortcuts map to Mod+1 through Mod+4 and Mod+Shift+B", () => {
  assert.match(source, /id: "navToChat",[\s\S]*?defaultBinding: "Mod\+1"/);
  assert.match(source, /id: "navToCode",[\s\S]*?defaultBinding: "Mod\+2"/);
  assert.match(source, /id: "navToBuild",[\s\S]*?defaultBinding: "Mod\+3"/);
  assert.match(source, /id: "navToBench",[\s\S]*?defaultBinding: "Mod\+4"/);
  assert.match(source, /id: "toggleFollowLog",[\s\S]*?defaultBinding: "Mod\+Shift\+B"/);
});

test("T3: new shortcuts are in the navigation group", () => {
  assert.match(source, /id: "navToChat",\s*group: "navigation"/);
  assert.match(source, /id: "navToCode",\s*group: "navigation"/);
  assert.match(source, /id: "navToBuild",\s*group: "navigation"/);
  assert.match(source, /id: "navToBench",\s*group: "navigation"/);
  assert.match(source, /id: "toggleFollowLog",\s*group: "navigation"/);
});

test("T3: runShortcut dispatches the four nav shortcuts to setPage", () => {
  assert.match(runtimeSource, /case "navToChat":\s*\n\s*useAppStore\.getState\(\)\.setPage\("chat"\);\s*\n\s*break;/);
  assert.match(runtimeSource, /case "navToCode":\s*\n\s*useAppStore\.getState\(\)\.setPage\("code"\);\s*\n\s*break;/);
  assert.match(runtimeSource, /case "navToBuild":\s*\n\s*useAppStore\.getState\(\)\.setPage\("build"\);\s*\n\s*break;/);
  assert.match(runtimeSource, /case "navToBench":\s*\n\s*useAppStore\.getState\(\)\.setPage\("bench"\);\s*\n\s*break;/);
});

test("T3: runShortcut dispatches toggleFollowLog to toggleBenchLogFollowTail", () => {
  assert.match(
    runtimeSource,
    /case "toggleFollowLog":\s*\n\s*useAppStore\.getState\(\)\.toggleBenchLogFollowTail\(\);\s*\n\s*break;/,
  );
});

test("T3: benchLogFollowTail is a store field with set/toggle actions", () => {
  assert.match(storeSource, /benchLogFollowTail: boolean;/);
  assert.match(storeSource, /setBenchLogFollowTail: \(follow: boolean\) => void;/);
  assert.match(storeSource, /toggleBenchLogFollowTail: \(\) => void;/);
  assert.match(storeSource, /benchLogFollowTail: true,/);
  assert.match(storeSource, /setBenchLogFollowTail: \(benchLogFollowTail\) => set\(\{ benchLogFollowTail \}\)/);
  assert.match(
    storeSource,
    /toggleBenchLogFollowTail: \(\) =>\s*set\(\(state\) => \(\{ benchLogFollowTail: !state\.benchLogFollowTail \}\)\)/,
  );
});

test("T3: BenchPage reads follow-tail from the shell-global store, not local state", () => {
  assert.match(benchPageSource, /const followTail = useAppStore\(\(s\) => s\.benchLogFollowTail\);/);
  assert.match(benchPageSource, /const setFollowTail = useAppStore\(\(s\) => s\.setBenchLogFollowTail\);/);
});
