import { readSettingsSourceSync, readPluginsSourceSync, readMainSourceSync } from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadStyles } from "./helpers/styles.mjs";
import { en } from "../../../packages/i18n/src/locales/en/index.ts";
import { zhCN } from "../../../packages/i18n/src/locales/zh-CN/index.ts";
import { tr } from "../../../packages/i18n/src/locales/tr/index.ts";

const catalogs = { en, "zh-CN": zhCN, tr };

const here = dirname(fileURLToPath(import.meta.url));
const extDir = join(here, "../src/components/extensions");
const components = new Map(
  readdirSync(extDir)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => [name, readFileSync(join(extDir, name), "utf8")]),
);
const settingsDir = join(here, "../src/components/settings");
const settingsComponents = new Map(
  readdirSync(settingsDir)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => [name, readFileSync(join(settingsDir, name), "utf8")]),
);
const pageSrc = readPluginsSourceSync();
const marketSettingsSrc = readFileSync(
  join(here, "../src/components/plugins/MarketplaceSourceSettings.tsx"),
  "utf8",
);
const settingsPageSrc = readSettingsSourceSync();
const electronMainSrc = readMainSourceSync();
const hostCapabilitySources = [
  readFileSync(join(here, "../../../crates/host-core/src/agent_capabilities.rs"), "utf8"),
  readFileSync(join(here, "../../../crates/host-core/src/user_skills.rs"), "utf8"),
  readFileSync(join(here, "../../../crates/host-core/src/mcp_servers.rs"), "utf8"),
  readFileSync(join(here, "../../../crates/host-core/src/user_subagents.rs"), "utf8"),
].join("\n");
const styles = await loadStyles();
const allSources = [
  ...components.values(),
  ...settingsComponents.values(),
  pageSrc,
  settingsPageSrc,
].join("\n");

function lookup(catalog, key) {
  return key.split(".").reduce((node, part) => (node == null ? undefined : node[part]), catalog);
}

function translationKeys(source) {
  const keys = new Set();
  for (const match of source.matchAll(/\bt\(\s*"((?:extensions|common)\.[^"]+)"/g)) {
    keys.add(match[1]);
  }
  for (const match of source.matchAll(/"((?:extensions|common)\.[A-Za-z0-9_.]+)"/g)) {
    keys.add(match[1]);
  }
  return keys;
}

test("every active extensions key exists in both catalogs", () => {
  const keys = translationKeys(allSources);
  assert.ok(keys.size > 40, `expected many extensions keys, saw ${keys.size}`);
  const missing = Object.fromEntries(Object.keys(catalogs).map((id) => [id, []]));
  for (const key of keys) {
    for (const [id, catalog] of Object.entries(catalogs)) {
      if (typeof lookup(catalog, key) !== "string") missing[id].push(key);
    }
  }
  assert.deepEqual(
    missing,
    Object.fromEntries(Object.keys(catalogs).map((id) => [id, []])),
  );
});

test("count interpolations carry plural forms in both catalogs", () => {
  const counted = new Set();
  for (const match of allSources.matchAll(
    /\bt\(\s*"((?:extensions|common)\.[^"]+)",\s*\{[^)]*?\bcount\b/gs,
  )) {
    counted.add(match[1]);
  }
  assert.ok(counted.size >= 2, `expected counted keys, saw ${counted.size}`);
  for (const key of counted) {
    for (const [name, catalog] of Object.entries(catalogs)) {
      assert.equal(typeof lookup(catalog, `${key}_one`), "string", `${name} ${key}_one`);
      assert.equal(typeof lookup(catalog, `${key}_other`), "string", `${name} ${key}_other`);
    }
  }
});

test("the extensions page keeps only installed and market tabs", () => {
  assert.match(pageSrc, /type TabId = "installed" \| "market"/);
  for (const id of [
    "plugins-tab-installed",
    "plugins-tab-market",
    "plugins-panel-installed",
    "plugins-panel-market",
  ]) {
    assert.ok(pageSrc.includes(id), `missing extension surface ${id}`);
  }
  for (const id of ["mcp", "skills", "subagents"]) {
    assert.doesNotMatch(pageSrc, new RegExp(`plugins-(?:tab|panel)-${id}`));
  }
});

test("the extensions page uses tabs instead of the removed capability overview", () => {
  assert.doesNotMatch(pageSrc, /plugins-hero|plugins-stat|const summary\s*=/);
  assert.match(pageSrc, /className="plugins-segment"/);
});

test("marketplace source settings omit redundant explanatory copy", () => {
  assert.match(marketSettingsSrc, /marketProviderTitle/);
  assert.doesNotMatch(
    marketSettingsSrc,
    /marketProviderDesc|marketProviderMirrorHint|marketActiveSource|plugins-market-settings-active/,
  );
  assert.match(marketSettingsSrc, /marketCustomUrlDesc/);
});

test("installed plugin rows keep secondary detail behind a disclosure", () => {
  assert.match(pageSrc, /function PluginRowDetails/);
  assert.match(pageSrc, /<details className="plugins-row-details">/);
  assert.match(pageSrc, /<ScopeControl[\s\S]*?compact/);
});

test("extension row actions stay visible and labelled", () => {
  assert.match(pageSrc, /<TooltipButton[\s\S]*?tooltip=\{t\("plugins\.openPanel"\)\}/);
  assert.match(pageSrc, /<TooltipButton[\s\S]*?tooltip=\{t\("plugins\.rowActions", \{ name: plugin\.name \}\)\}/);
  assert.match(styles, /\.ui-tooltip\s*\{[\s\S]*?position:\s*fixed;/);
  const actionBlock = styles.match(/\.ext-row-actions\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(actionBlock, /opacity:\s*1/);
});

test("the client hides development-only demo plugins from marketplace results", () => {
  assert.match(pageSrc, /function isClientVisibleMarketPlugin/);
  assert.match(pageSrc, /!plugin\.id\.startsWith\("demo\."\)/);
  assert.match(pageSrc, /setMarket\(\(res\.plugins \?\? \[\]\)\.filter\(isClientVisibleMarketPlugin\)\)/);
});

test("capability sections flow at natural height with skeleton loading", () => {
  assert.doesNotMatch(styles, /\.agent-capability-list\s*\{[^}]*?height:\s*\d+px/);
  assert.match(styles, /\.agent-capability-skeleton\s*\{/);
  assert.match(settingsComponents.get("AgentCapabilityLayout.tsx"), /loading \? </);
});

test("project records shadow global records before disabled records are filtered", () => {
  assert.match(hostCapabilitySources, /existing\.id != record\.id/);
  assert.match(hostCapabilitySources, /if record\.enabled \{/);
  assert.match(hostCapabilitySources, /record\.name\.eq_ignore_ascii_case/);
});

test("agent capability styling uses design tokens and supports reduced motion", () => {
  const start = styles.indexOf("/* -------------------------------------------------------------------------\n * Settings > Agent capability destinations (Skills / MCP / Subagents).");
  assert.ok(start >= 0, "agent capability styles are missing");
  const section = styles.slice(start);
  assert.match(section, /var\(--ds-bg-/);
  assert.match(section, /var\(--ds-text-/);
  assert.match(section, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(section, /\.agent-capability-row\.is-off/);
});
