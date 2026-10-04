/**
 * Raven destination: settings validation and the IPC contract behind the
 * Settings toggle, the nav-rail button, and the embedded `persist:raven` pane.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { validateRavenSettings, readRavenSettings } = await import("../electron/main/runtime/raven-settings.ts");
const { registerRavenIpc } = await import("../electron/main/ipc/raven-ipc.ts");
const { IPC } = await import("../../../packages/shared/src/protocol.ts");

test("only http(s) URLs are kept, and Raven cannot be enabled without one", () => {
  assert.deepEqual(validateRavenSettings({ enabled: true, url: "javascript:alert(1)" }), { enabled: false, url: "" });
  assert.deepEqual(validateRavenSettings({ enabled: true, url: "file:///etc/passwd" }), { enabled: false, url: "" });
  assert.deepEqual(validateRavenSettings({ enabled: true, url: "" }), { enabled: false, url: "" });
  assert.deepEqual(validateRavenSettings({ enabled: true, url: " https://erp.example.com " }), {
    enabled: true,
    url: "https://erp.example.com",
  });
  assert.deepEqual(validateRavenSettings(null), { enabled: false, url: "" });
});

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "raven-"));
  const handlers = new Map();
  const log = [];
  let changed = 0;
  let alive = false;
  const pane = {
    getWebContents: () => (alive ? {} : null),
    setWindow: (w) => log.push(["setWindow", w?.id ?? null]),
    navigate: (url) => {
      alive = true;
      log.push(["navigate", url]);
    },
    setBounds: (b) => log.push(["setBounds", b]),
    setVisible: (v) => log.push(["setVisible", v]),
    dispose: () => {
      alive = false;
      log.push(["dispose"]);
    },
  };
  registerRavenIpc({
    registrar: { handle: (ch, fn) => handlers.set(ch, fn) },
    dataDir,
    pane,
    getMainWindow: () => ({ id: 1, getContentBounds: () => ({ x: 50, y: 50, width: 1000, height: 800 }) }),
    sendChanged: () => changed++,
  });
  return {
    dataDir,
    call: (ch, arg) => handlers.get(ch)(arg),
    log,
    changed: () => changed,
    closeWindow: () => { alive = false; },
  };
}

test("set merges the patch, persists it, and notifies the nav rail", async () => {
  const r = setup();
  await r.call(IPC.invoke.ravenSettingsSet, { settings: { url: "http://erp.localhost:8000" } });
  const { settings } = await r.call(IPC.invoke.ravenSettingsSet, { settings: { enabled: true } });
  assert.deepEqual(settings, { enabled: true, url: "http://erp.localhost:8000" });
  assert.deepEqual(readRavenSettings(r.dataDir), settings);
  assert.deepEqual((await r.call(IPC.invoke.ravenSettingsGet)).settings, settings);
  assert.equal(r.changed(), 2);
});

test("showing the pane loads <url>/raven once; changing the site drops the page", async () => {
  const r = setup();
  await r.call(IPC.invoke.ravenSettingsSet, { settings: { url: "https://erp.example.com/app", enabled: true } });
  r.log.length = 0;
  await r.call(IPC.invoke.ravenSetVisible, { visible: true });
  await r.call(IPC.invoke.ravenSetVisible, { visible: false });
  await r.call(IPC.invoke.ravenSetVisible, { visible: true });
  assert.deepEqual(r.log.filter(([op]) => op === "navigate"), [["navigate", "https://erp.example.com/raven"]]);
  assert.deepEqual(r.log.at(-1), ["setVisible", true]);

  await r.call(IPC.invoke.ravenSettingsSet, { settings: { url: "https://chat.example.com" } });
  assert.ok(r.log.some(([op]) => op === "dispose"));
  await r.call(IPC.invoke.ravenSetVisible, { visible: true });
  assert.deepEqual(r.log.filter(([op]) => op === "navigate").at(-1), ["navigate", "https://chat.example.com/raven"]);
});

test("a guest destroyed with its window is reloaded on the next show", async () => {
  const r = setup();
  await r.call(IPC.invoke.ravenSettingsSet, { settings: { url: "https://erp.example.com", enabled: true } });
  await r.call(IPC.invoke.ravenSetVisible, { visible: true });
  r.closeWindow();
  await r.call(IPC.invoke.ravenSetVisible, { visible: true });
  assert.equal(r.log.filter(([op]) => op === "navigate").length, 2);
});

test("a disabled destination never shows the pane", async () => {
  const r = setup();
  assert.deepEqual(await r.call(IPC.invoke.ravenSetVisible, { visible: true }), { ok: false });
  assert.equal(r.log.some(([op]) => op === "navigate" || op === "setVisible"), false);
});

test("bounds are clamped to the window content", async () => {
  const r = setup();
  await r.call(IPC.invoke.ravenSetBounds, { x: -20, y: 700, width: 5000, height: 400 });
  assert.deepEqual(r.log.at(-1), ["setBounds", { x: 0, y: 700, width: 1000, height: 100 }]);
});
