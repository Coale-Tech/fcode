import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { usePluginBrowseState } = await import("../src/features/plugins/browse-state.ts");

test("plugin browsing choices survive subscribers disconnecting without retaining dialogs or operations", () => {
  const before = usePluginBrowseState.getInitialState();
  try {
    const unsubscribe = usePluginBrowseState.subscribe(() => {});
    usePluginBrowseState.getState().setTab("market");
    usePluginBrowseState.getState().setQuery("browser");
    usePluginBrowseState.getState().setInstalledQuery("local");
    usePluginBrowseState.getState().setCategory("productivity");
    unsubscribe();
    const reopened = usePluginBrowseState.getState();
    assert.equal(reopened.tab, "market");
    assert.equal(reopened.query, "browser");
    assert.equal(reopened.installedQuery, "local");
    assert.equal(reopened.category, "productivity");
    assert.deepEqual(Object.keys(reopened).filter((key) => typeof reopened[key] !== "function").sort(),
      ["category", "installedQuery", "query", "tab"]);
  } finally { usePluginBrowseState.setState(before, true); }
});
