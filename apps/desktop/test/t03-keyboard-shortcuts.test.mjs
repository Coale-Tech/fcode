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

const source = await readFile(
  new URL("../../../packages/shared/src/keyboard-shortcuts.ts", import.meta.url),
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
