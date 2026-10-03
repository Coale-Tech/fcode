import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { SETTINGS_NAV, searchSettings } = await import("../src/lib/settings-search.ts");
const en = (await import("../../../packages/i18n/src/locales/en/index.ts")).default;
const t = (key) => key.split(".").reduce((o, k) => o?.[k], en) ?? key;

test("AI is a rail group holding the split pages, not one long tab", () => {
  const ai = SETTINGS_NAV.filter((e) => e.group === "ai").map((e) => e.id);
  for (const id of ["ai", "agent", "instructions", "memory", "aiAgents", "aiTools", "aiExtensions"]) {
    assert.ok(ai.includes(id), `${id} should sit in the AI group`);
  }
});

test("a settings row is searchable from exactly one tab", () => {
  const seen = new Map();
  for (const entry of SETTINGS_NAV) {
    for (const key of entry.keywordKeys) {
      if (seen.has(key)) assert.fail(`${key} is indexed in ${seen.get(key)} and ${entry.id}`);
      seen.set(key, entry.id);
    }
  }
});

test("search lands omp rows on the page that renders them", () => {
  const tabFor = (q) => searchSettings(q, t, { developerMode: true }).map((h) => h.tab);
  assert.ok(tabFor("LSP").includes("aiTools"));
  assert.ok(tabFor("Worktree").includes("aiAgents"));
  assert.ok(tabFor("Hindsight").includes("memory"));
});
