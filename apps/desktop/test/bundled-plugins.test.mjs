import { readStoreSourceSync } from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

/**
 * Bundled plugins (ADR 0104, ADR 0241).
 *
 * The point of shipping a panel surface as a plugin rather than host code is
 * that it proves the public contribution channel is sufficient. The file view
 * is now a vendored third-party plugin — the artifact the marketplace also
 * publishes — so these assertions guard both halves of that claim: it must be
 * an ordinary plugin any third party could have written, and the copy in this
 * repository must stay traceable to the release it came from.
 */

const read = (path) => readFileSync(resolve(path), "utf8");
const FILE_MANAGER = "resources/plugins/fcode.files";
const manifest = JSON.parse(read(`${FILE_MANAGER}/manifest.json`));
const view = read(`${FILE_MANAGER}/views/index.html`);
const viewBundle = read(`${FILE_MANAGER}/views/assets/index.js`);
const upstream = read(`${FILE_MANAGER}/UPSTREAM.md`);
const panelSource = read("src/components/workpanel/WorkPanel.tsx");
const hostProcessSource = read("electron/main/host-process.ts");
const packageJson = JSON.parse(read("package.json"));

test("the file view ships as an ordinary plugin, not a privileged one", () => {
  assert.equal(manifest.id, "fcode.files");
  assert.deepEqual(manifest.contributes.views.map((v) => v.id), ["manager"]);
  // Exactly the permissions a third party would have to declare for the same
  // capability — nothing host-only.
  assert.deepEqual([...manifest.permissions].sort(), ["fs.read", "ui.view"]);
  assert.equal(manifest.fs.read.root, "workspace");
  assert.deepEqual(manifest.fs.read.scope, ["**"]);
  // A localized title, because the panel menu shows it to the user.
  assert.equal(typeof manifest.contributes.views[0].title.en, "string");
  assert.equal(typeof manifest.contributes.views[0].title["zh-CN"], "string");
  // Vendored from an MIT-licensed repository, so the license travels with it.
  assert.equal(manifest.license, "MIT");
  assert.ok(existsSync(resolve(`${FILE_MANAGER}/LICENSE`)));
});

test("the file view is a sandboxed page over the public bridge", () => {
  // The two host-mediated actions, and the plugin's own panel channels. All of
  // them are public SDK surface: the page can reach nothing else.
  for (const channel of ["fs.openDefault", "fs.reveal", "fm.read", "fm.write"]) {
    assert.ok(
      viewBundle.includes(channel),
      `expected the view to call ${channel} over the bridge`,
    );
  }
  assert.match(viewBundle, /pluginBridge/);
  // No Node, no Electron, no host internals: it is a sandboxed page.
  assert.doesNotMatch(view, /require\(|import\s+.*from\s+["']node:|ipcRenderer/);
  assert.doesNotMatch(viewBundle, /require\(|ipcRenderer/);
  // The titlebar height is read, not hard-coded, so the same file also works
  // in a detached panel window.
  assert.match(viewBundle, /var\(--pi-plugin-titlebar-height, 0px\)/);
  assert.match(view, /meta name="pi-plugin-chrome" content="v2"/);
});

test("the source-owned fork stays traceable to its upstream release", () => {
  assert.match(upstream, /github\.com\/Tioit-Wang\/pi-desktop-plugin-file-manager/);
  assert.match(upstream, /d36ebe9f7fb82ee71e87670b0a65403660b18a00/);
  const tag = upstream.match(/`v(\d+\.\d+\.\d+)`/);
  assert.ok(tag, "UPSTREAM.md must name the forked tag");
  assert.ok(manifest.version.startsWith(`${tag[1]}-fcode.`), "fork version must extend the upstream tag");
  assert.ok(existsSync(resolve(`${FILE_MANAGER}/views-src/package.json`)), "view source must ship with the fork");
});

test("the legacy bundled pi.file-manager is retired", () => {
  assert.equal(existsSync(resolve("resources/plugins/pi.file-manager")), false);
});

test("the host no longer bundles the old Files plugin", () => {
  // Its view is what this plugin replaced. host-core drops the stale registry
  // row through `drop_missing_builtin` on the first launch after the swap.
  assert.equal(existsSync(resolve("resources/plugins/pi.files")), false);
});

test("the host no longer offers Files or Browser as built-in tools", () => {
  assert.doesNotMatch(panelSource, /const HEADER_TOOLS/);
  assert.doesNotMatch(panelSource, /kind: "browser"/);
  assert.doesNotMatch(panelSource, /kind: "terminal"/);
  // Review and file remain artifact/resource surfaces the conversation opens.
  assert.match(panelSource, /activeTab\?\.kind === "file"/);
  assert.match(panelSource, /activeTab\?\.kind === "review"/);
});

test("Review opens only from an explicit user action", () => {
  // The New launcher row and the viewport-fixed toggle are the only ways in,
  // so a workspace edit can no longer reveal or activate Review by itself.
  const storeSource = readStoreSourceSync();
  assert.doesNotMatch(storeSource, /shouldOpenReviewArtifact/);
  assert.doesNotMatch(storeSource, /toolWorkPanelTab\("review"\)/);
  assert.match(panelSource, /toolWorkPanelTab\("review"\)/);
});

test("Browser ships as an ordinary plugin over the public CDP API", () => {
  const browserManifest = JSON.parse(read("resources/plugins/pi.browser/manifest.json"));
  const browserMain = read("resources/plugins/pi.browser/main.js");
  const browserView = read("resources/plugins/pi.browser/views/browser.html");
  assert.equal(browserManifest.id, "pi.browser");
  assert.deepEqual(browserManifest.contributes.views.map((v) => v.id), ["browser"]);
  assert.deepEqual(
    [...browserManifest.permissions].sort(),
    ["agent.tool.register", "browser.cdp", "ui.view"],
  );
  assert.equal(typeof browserManifest.contributes.views[0].title.en, "string");
  assert.equal(typeof browserManifest.contributes.views[0].title["zh-CN"], "string");
  assert.match(browserMain, /pi\.agent\.registerTool/);
  assert.match(browserMain, /pi\.browser\.(navigate|snapshot|cdp)/);
  assert.match(browserView, /pluginBridge/);
  assert.match(browserView, /browser\.setBounds/);
  assert.doesNotMatch(browserView, /require\(|ipcRenderer|webview/);
});

test("Browser declares plan-safe actions for Plan-mode URL inspection (ADR 0211)", () => {
  const browserMain = read("resources/plugins/pi.browser/main.js");
  // The planSafeActions list must be declared on the registered tool.
  assert.match(browserMain, /planSafeActions\s*:\s*PLAN_SAFE_ACTIONS/);
  // The list itself must declare the four read-only actions the user needs.
  assert.match(
    browserMain,
    /PLAN_SAFE_ACTIONS\s*=\s*\[\s*"navigate"\s*,\s*"snapshot"\s*,\s*"screenshot"\s*,\s*"console"\s*\]/,
  );
  // The mutating actions must NOT appear in PLAN_SAFE_ACTIONS, otherwise
  // Plan mode would be able to click/fill/evaluate arbitrary pages.
  const planSafeMatch = browserMain.match(/PLAN_SAFE_ACTIONS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(planSafeMatch, "PLAN_SAFE_ACTIONS array must exist");
  for (const unsafe of ["click", "fill", "evaluate", "cdp"]) {
    assert.doesNotMatch(
      planSafeMatch[1],
      new RegExp('"' + unsafe + '"'),
      `mutating action ${unsafe} must not appear in PLAN_SAFE_ACTIONS`,
    );
  }
});


test("Advisor is temporarily not bundled", () => {
  assert.equal(existsSync(resolve("resources/plugins/pi.advisor")), false);
});

test("bundled plugins are packaged and located at runtime", () => {
  assert.ok(
    packageJson.build.extraResources.some(
      (entry) => entry.from === "resources/plugins" && entry.to === "plugins",
    ),
    "resources/plugins must be copied outside the asar",
  );
  // host-core cannot know whether it runs from resources/ or a checkout, so
  // Electron resolves the directory and hands it over.
  assert.match(hostProcessSource, /function resolveBuiltinPluginsDir\(\)/);
  assert.match(hostProcessSource, /PI_DESKTOP_BUILTIN_PLUGINS_DIR/);
  assert.match(hostProcessSource, /join\(process\.resourcesPath \|\| "", "plugins"\)/);
});

// ── fcode.files (Fcode source-owned fork of pi.file-manager) ───────────────

const FCODE_FILES = "resources/plugins/fcode.files";
const fcodeMain = resolve(`${FCODE_FILES}/main.js`);

/**
 * Runs `script` against the real fcode.files main.js in a child process with a
 * stubbed `pi` runtime. `invoke(channel, payload)` calls onPanelInvoke. Tests
 * reusing `dataDir` with a different `root` model two project roots sharing one
 * plugin data directory.
 */
function runFcode(script, { root, dataDir } = {}) {
  const projectRoot = root ?? mkdtempSync(join(tmpdir(), "fcode-root-"));
  const data = dataDir ?? mkdtempSync(join(tmpdir(), "fcode-data-"));
  const program = `
const fs = require("node:fs");
const { join } = require("node:path");
global.pi = {
  plugin: { getDataPath: async () => ${JSON.stringify(data)}, getSettings: async () => ({}), setSettings: async () => {} },
  workspace: { get: async () => ({ path: ${JSON.stringify(projectRoot)}, name: "t", projectId: "t" }) },
};
const main = require(${JSON.stringify(fcodeMain)});
(async () => {
  await main.onLoad();
  const invoke = (channel, payload) => main.onPanelInvoke(channel, payload ?? {});
  const projectRoot = ${JSON.stringify(projectRoot)};
  const assertOk = (cond, msg) => { if (!cond) throw new Error(msg); };
${script}
  console.log("OK");
})().catch((e) => { console.error(e.stack ?? e.message); process.exit(1); });
`;
  return execFileSync(process.execPath, ["--input-type=commonjs"], {
    input: program,
    encoding: "utf8",
    timeout: 15000,
  }).trim();
}

test("fcode.files is an ordinary plugin with a workspace-scoped read grant", () => {
  const fcode = JSON.parse(read(`${FCODE_FILES}/manifest.json`));
  assert.equal(fcode.id, "fcode.files");
  assert.deepEqual(fcode.contributes.views.map((v) => v.id), ["manager"]);
  assert.deepEqual([...fcode.permissions].sort(), ["fs.read", "ui.view"]);
  assert.deepEqual(fcode.fs.read, { root: "workspace", scope: ["**"] });
  assert.equal(fcode.license, "MIT");
  assert.ok(existsSync(resolve(`${FCODE_FILES}/LICENSE`)));
  assert.ok(existsSync(resolve(`${FCODE_FILES}/views-src/src/App.tsx`)));
  assert.match(read(`${FCODE_FILES}/UPSTREAM.md`), /d36ebe9f7fb82ee71e87670b0a65403660b18a00/);
});

test("fcode.files view is sandboxed and calls the draft channels", () => {
  const html = read(`${FCODE_FILES}/views/index.html`);
  const bundle = read(`${FCODE_FILES}/views/assets/index.js`);
  for (const channel of ["fm.draft.save", "fm.draft.load", "fm.draft.list", "fm.draft.discard", "fm.read", "fm.write"]) {
    assert.ok(bundle.includes(channel), `expected the view to call ${channel}`);
  }
  assert.match(bundle, /pluginBridge/);
  assert.doesNotMatch(html, /require\(|import\s+.*from\s+["']node:|ipcRenderer/);
  assert.doesNotMatch(bundle, /require\(|ipcRenderer/);
});

test("fcode.files draft: load does not consume, discard removes", () => {
  runFcode(`
    fs.writeFileSync(join(projectRoot, "a.js"), "original");
    const st = fs.statSync(join(projectRoot, "a.js"));
    const saved = await invoke("fm.draft.save", { rel: "a.js", text: "dirty", expectedMtimeMs: st.mtimeMs, expectedSize: st.size });
    assertOk(saved.ok, "save failed");
    for (let i = 0; i < 2; i += 1) {
      const d = await invoke("fm.draft.load", { rel: "a.js" });
      assertOk(d.found && d.text === "dirty" && d.expectedMtimeMs === st.mtimeMs && d.expectedSize === st.size, "load " + i + ": " + JSON.stringify(d));
    }
    await invoke("fm.draft.discard", { rel: "a.js" });
    assertOk((await invoke("fm.draft.load", { rel: "a.js" })).found === false, "draft must be gone");
  `);
});

test("fcode.files draft: a save on the draft's stale disk baseline conflicts after the file changed", () => {
  runFcode(`
    const file = join(projectRoot, "n.ts");
    fs.writeFileSync(file, "v1");
    const t1 = fs.statSync(file);
    await invoke("fm.draft.save", { rel: "n.ts", text: "edits", expectedMtimeMs: t1.mtimeMs, expectedSize: t1.size });
    // agent edit + Review rollback: same bytes, newer mtime
    await new Promise((r) => setTimeout(r, 20));
    fs.writeFileSync(file, "v1");
    const d = await invoke("fm.draft.load", { rel: "n.ts" });
    const r = await invoke("fm.write", { path: "n.ts", text: d.text, expectedMtimeMs: d.expectedMtimeMs, expectedSize: d.expectedSize, eol: "lf", bom: false });
    assertOk(!r.ok && r.code === "CONFLICT", "expected CONFLICT, got " + JSON.stringify(r));
    assertOk(fs.readFileSync(file, "utf8") === "v1", "file must be untouched");
  `);
});

test("fcode.files draft: expectedAbsent refuses to overwrite a file created meanwhile", () => {
  runFcode(`
    await invoke("fm.draft.save", { rel: "new.js", text: "mine", expectedMtimeMs: null, expectedSize: null, expectedAbsent: true });
    const d = await invoke("fm.draft.load", { rel: "new.js" });
    assertOk(d.found && d.expectedAbsent === true, "expectedAbsent must round-trip");
    // absent on disk: the write goes through
    const ok = await invoke("fm.write", { path: "other.js", text: "x", expectedMtimeMs: null, expectedSize: null, expectedAbsent: true, eol: "lf", bom: false });
    assertOk(ok.ok, "write to an absent file must succeed: " + JSON.stringify(ok));
    fs.writeFileSync(join(projectRoot, "new.js"), "agent created it");
    const r = await invoke("fm.write", { path: "new.js", text: d.text, expectedMtimeMs: null, expectedSize: null, expectedAbsent: true, eol: "lf", bom: false });
    assertOk(!r.ok && r.code === "CONFLICT", "expected CONFLICT, got " + JSON.stringify(r));
    assertOk(fs.readFileSync(join(projectRoot, "new.js"), "utf8") === "agent created it", "file must be untouched");
  `);
});

test("fcode.files draft: same relative path under different roots keeps separate drafts", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "fcode-data-"));
  const rootA = mkdtempSync(join(tmpdir(), "fcode-root-a-"));
  const rootB = mkdtempSync(join(tmpdir(), "fcode-root-b-"));
  runFcode(`await invoke("fm.draft.save", { rel: "x.js", text: "from A" });`, { root: rootA, dataDir });
  runFcode(`
    assertOk((await invoke("fm.draft.load", { rel: "x.js" })).found === false, "root B must not see root A's draft");
    await invoke("fm.draft.save", { rel: "x.js", text: "from B" });
  `, { root: rootB, dataDir });
  runFcode(`assertOk((await invoke("fm.draft.load", { rel: "x.js" })).text === "from A", "root A draft overwritten");`, { root: rootA, dataDir });
});

test("fcode.files draft: refuses credential paths and escapes", () => {
  runFcode(`
    for (const rel of [".env", ".ssh/id_rsa", "k.pem", "../outside.js"]) {
      const r = await invoke("fm.draft.save", { rel, text: "secret" });
      assertOk(!r.ok, rel + " must be refused, got " + JSON.stringify(r));
    }
  `);
});

test("fcode.files write: refuses to write when the root the buffer was read from is no longer current", () => {
  runFcode(`
    const file = join(projectRoot, "a.js");
    fs.writeFileSync(file, "original");
    const st = fs.statSync(file);
    const base = { path: "a.js", text: "edited", expectedMtimeMs: st.mtimeMs, expectedSize: st.size, eol: "lf", bom: false };
    const bad = await invoke("fm.write", { ...base, root: join(projectRoot, "..", "another-project") });
    assertOk(!bad.ok && bad.code === "ROOT_CHANGED", "expected ROOT_CHANGED, got " + JSON.stringify(bad));
    assertOk(fs.readFileSync(file, "utf8") === "original", "file must be untouched");
    const read = await invoke("fm.read", { path: "a.js" });
    assertOk(read.root === projectRoot, "read must report the root it read from: " + JSON.stringify(read));
    const good = await invoke("fm.write", { ...base, root: read.root });
    assertOk(good.ok && fs.readFileSync(file, "utf8") === "edited", "matching root must write: " + JSON.stringify(good));
  `);
});

test("fcode.files write: a buffer whose file was deleted conflicts instead of being silently recreated", () => {
  runFcode(`
    const file = join(projectRoot, "gone.js");
    fs.writeFileSync(file, "v1");
    const st = fs.statSync(file);
    fs.rmSync(file); // Review rollback deleting an agent-created file
    const base = { path: "gone.js", text: "stale", eol: "lf", bom: false };
    const r = await invoke("fm.write", { ...base, expectedMtimeMs: st.mtimeMs, expectedSize: st.size });
    assertOk(!r.ok && r.code === "CONFLICT" && r.deleted === true && "mtimeMs" in r, "expected deleted CONFLICT, got " + JSON.stringify(r));
    assertOk(!fs.existsSync(file), "must not be recreated");
    const overwrite = await invoke("fm.write", { ...base, expectedMtimeMs: null, expectedSize: null, expectedAbsent: true });
    assertOk(overwrite.ok && fs.readFileSync(file, "utf8") === "stale", "explicit overwrite must recreate: " + JSON.stringify(overwrite));
  `);
});

test("fcode.files draft: keyed by the sent root, listed newest-first for the current root only", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "fcode-data-"));
  runFcode(`
    const other = join(projectRoot, "..", "another-project");
    await invoke("fm.draft.save", { root: other, rel: "x.js", text: "other project" });
    assertOk((await invoke("fm.draft.load", { rel: "x.js" })).found === false, "live root must not see a draft saved for another root");
    assertOk((await invoke("fm.draft.load", { root: other, rel: "x.js" })).text === "other project", "sent root must find it");
    await invoke("fm.draft.save", { rel: "old.js", text: "1" });
    await new Promise((r) => setTimeout(r, 15));
    await invoke("fm.draft.save", { root: projectRoot, rel: "new.js", text: "2" });
    const listed = await invoke("fm.draft.list");
    assertOk(listed.ok && JSON.stringify(listed.drafts.map((d) => d.rel)) === JSON.stringify(["new.js", "old.js"]), "list: " + JSON.stringify(listed));
    await invoke("fm.draft.discard", { rel: "new.js" });
    assertOk((await invoke("fm.draft.list")).drafts.length === 1, "discarded draft must leave the list");
  `, { dataDir });
});

test("fcode.files draft: concurrent saves of one draft succeed and leave no tmp files", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "fcode-data-"));
  runFcode(`
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => invoke("fm.draft.save", { rel: "c.js", text: "v" + i })));
    assertOk(results.every((r) => r.ok), "all saves must succeed: " + JSON.stringify(results));
    assertOk(fs.readdirSync(${JSON.stringify(dataDir)}).every((n) => n.endsWith(".draft.json")), "no stray tmp files");
  `, { dataDir });
});
