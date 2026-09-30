/**
 * T3 — navToFiles shortcut, profile migration, and saved-tab migration.
 *
 * Tests verify consumer-visible behavior: the shortcut id and default binding
 * are accessible, and old navToCode/pi.file-manager profiles migrate silently.
 */
import assert from "node:assert/strict";
import test from "node:test";

const {
  KEYBOARD_SHORTCUT_IDS,
  KEYBOARD_SHORTCUTS,
  migrateKeybindingOverrides,
} = await import("../../../packages/shared/src/keyboard-shortcuts.ts");

const {
  migrateWorkPanelTab,
  LEGACY_FILE_MANAGER_PLUGIN_TAB,
  FILE_MANAGER_PLUGIN_TAB,
  sanitizeWorkPanelTabsState,
} = await import("../src/lib/work-panel-tabs.ts");

test("T3: navToFiles is in KEYBOARD_SHORTCUT_IDS; navToCode is not", () => {
  assert.ok(KEYBOARD_SHORTCUT_IDS.includes("navToFiles"), "navToFiles missing");
  assert.ok(!KEYBOARD_SHORTCUT_IDS.includes("navToCode"), "retired navToCode still present");
});

test("T3: navToFiles defaults to Mod+2 and is in the navigation group", () => {
  const shortcut = KEYBOARD_SHORTCUTS.find((s) => s.id === "navToFiles");
  assert.ok(shortcut, "navToFiles not in KEYBOARD_SHORTCUTS");
  assert.equal(shortcut.defaultBinding, "Mod+2");
  assert.equal(shortcut.group, "navigation");
});

test("T3: migrateKeybindingOverrides carries a navToCode custom binding to navToFiles", () => {
  const result = migrateKeybindingOverrides({ navToCode: "Mod+Shift+2" });
  assert.equal(result?.navToFiles, "Mod+Shift+2");
  assert.ok(!("navToCode" in result), "retired id must not survive migration");
});

test("T3: migrateKeybindingOverrides does not overwrite an existing navToFiles override", () => {
  const result = migrateKeybindingOverrides({ navToCode: "Mod+Shift+2", navToFiles: "Mod+Alt+F" });
  assert.equal(result?.navToFiles, "Mod+Alt+F");
});

test("T3: migrateKeybindingOverrides with no navToCode leaves navToFiles unset", () => {
  const result = migrateKeybindingOverrides({ navToChat: "Mod+1" });
  assert.equal(result?.navToFiles, undefined);
});

test("T3: migrateWorkPanelTab upgrades pi.file-manager/manager to fcode.files/manager", () => {
  const legacy = `${LEGACY_FILE_MANAGER_PLUGIN_TAB.pluginId}/${LEGACY_FILE_MANAGER_PLUGIN_TAB.viewId}`;
  const current = `${FILE_MANAGER_PLUGIN_TAB.pluginId}/${FILE_MANAGER_PLUGIN_TAB.viewId}`;
  const old = { id: `plugin:${legacy}`, kind: "plugin", resource: legacy, location: "src/app.ts" };
  const upgraded = migrateWorkPanelTab(old);
  assert.equal(upgraded.id, `plugin:${current}`);
  assert.equal(upgraded.resource, current);
  assert.equal(upgraded.location, "src/app.ts");
});

test("T3: migrateWorkPanelTab returns same reference for non-file-manager and already-current tabs", () => {
  const browser = { id: "plugin:pi.browser/browser", kind: "plugin", resource: "pi.browser/browser" };
  assert.strictEqual(migrateWorkPanelTab(browser), browser);
  const current = `${FILE_MANAGER_PLUGIN_TAB.pluginId}/${FILE_MANAGER_PLUGIN_TAB.viewId}`;
  const alreadyCurrent = { id: `plugin:${current}`, kind: "plugin", resource: current };
  assert.strictEqual(migrateWorkPanelTab(alreadyCurrent), alreadyCurrent);
});

test("T3: sanitizeWorkPanelTabsState deduplicates after migration when both legacy and current tab saved", () => {
  const legacy = `${LEGACY_FILE_MANAGER_PLUGIN_TAB.pluginId}/${LEGACY_FILE_MANAGER_PLUGIN_TAB.viewId}`;
  const current = `${FILE_MANAGER_PLUGIN_TAB.pluginId}/${FILE_MANAGER_PLUGIN_TAB.viewId}`;
  const state = {
    tabs: [
      { id: `plugin:${legacy}`, kind: "plugin", resource: legacy },
      { id: `plugin:${current}`, kind: "plugin", resource: current },
    ],
    activeTabId: `plugin:${current}`,
  };
  const result = sanitizeWorkPanelTabsState(state);
  assert.equal(result.tabs.length, 1, "duplicate after migration must be removed");
  assert.equal(result.tabs[0].resource, current);
  assert.equal(result.activeTabId, `plugin:${current}`);
});
