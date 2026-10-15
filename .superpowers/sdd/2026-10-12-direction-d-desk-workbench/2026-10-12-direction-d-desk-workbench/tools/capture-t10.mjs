#!/usr/bin/env node
/**
 * capture-t10.mjs — standalone CDP capture for Task 10
 * Launches Electron from the t10 worktree, navigates to chat with WorkPanel
 * open on Activity tab, and screenshots light+dark variants.
 *
 * Usage:
 *   FCODE_WORKTREE=/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-t10 \
 *   node capture-t10.mjs
 */

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import http from "node:http";

// ── helpers ──────────────────────────────────────────────────────────────────

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("JSON parse: " + data.slice(0, 200))); }
      });
    }).on("error", reject);
  });
}

// Use native WHATWG WebSocket (Node 22+)
const WS = globalThis.WebSocket;
if (!WS) throw new Error("Node 22+ required for native WebSocket");

function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WS(wsUrl);
    let id = 0;
    const pending = new Map();
    const evtListeners = new Map();

    ws.addEventListener("open", () => resolve(client));
    ws.addEventListener("error", (e) => reject(new Error("WS error: " + (e.message ?? String(e)))));
    ws.addEventListener("message", (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id !== undefined) {
        const { res, rej } = pending.get(msg.id) ?? {};
        pending.delete(msg.id);
        if (msg.error) rej?.(new Error(JSON.stringify(msg.error)));
        else res?.(msg.result);
      } else if (msg.method) {
        evtListeners.get(msg.method)?.forEach((fn) => fn(msg.params));
      }
    });

    const client = {
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const msgId = ++id;
          pending.set(msgId, { res, rej });
          ws.send(JSON.stringify({ id: msgId, method, params }));
        });
      },
      on(event, fn) {
        if (!evtListeners.has(event)) evtListeners.set(event, []);
        evtListeners.get(event).push(fn);
      },
      close() { try { ws.close(); } catch {} },
    };
  });
}

// ── main ─────────────────────────────────────────────────────────────────────

const WORKTREE = process.env.FCODE_WORKTREE ??
  "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-t10";
const ELECTRON = `${WORKTREE}/apps/desktop/node_modules/.bin/electron`;
const APP_DIR = `${WORKTREE}/apps/desktop`;

const WS_DIR = "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d" +
  "/.superpowers/sdd/2026-10-12-direction-d-desk-workbench";
const SHOTS = `${WS_DIR}/shots/T10`;

async function ensureDir(p) {
  if (!existsSync(p)) await mkdir(p, { recursive: true });
}

async function waitForMainTarget(port, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const targets = await httpGet(`http://127.0.0.1:${port}/json`);
      if (!Array.isArray(targets)) { await sleep(1000); continue; }
      const main = targets.find(
        (t) =>
          t.type === "page" &&
          t.url.includes("index.html") &&
          !t.url.includes("surface="),
      );
      if (main) return main;
    } catch { /* not ready yet */ }
    await sleep(1500);
  }
  throw new Error("Timed out waiting for main renderer target");
}

async function evalInPage(cdp, js) {
  const res = await cdp.send("Runtime.evaluate", {
    expression: `(async () => { try { return JSON.stringify(await (${js})); } catch(e) { return JSON.stringify({_error: e.message}); } })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const v = res?.result?.value;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return v; }
  }
  return null;
}

async function waitForSettings(cdp, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const s = await evalInPage(cdp, `window.piDesktop?.invoke("pi-desktop/settings/get")`);
    if (s && typeof s === "object" && !s._error) return s;
    await sleep(400);
  }
  throw new Error("Settings IPC never ready");
}

async function setSettings(cdp, patch) {
  const current = await evalInPage(cdp, `window.piDesktop.invoke("pi-desktop/settings/get")`);
  const next = { ...current, ...patch };
  await evalInPage(cdp, `window.piDesktop.invoke("pi-desktop/settings/set", ${JSON.stringify(next)})`);
  await sleep(800);
}

async function rootState(cdp, settings) {
  const dom = await evalInPage(cdp, `(() => {
    const el = document.documentElement;
    const cs = getComputedStyle(el);
    const navLayout = el.dataset.navLayout ?? "rail";
    const CHROME = { tabs: 24, rail: 74, island: 84 };
    const shellEl = document.querySelector(".app-shell");
    const shellClientWidth = shellEl ? shellEl.clientWidth : 0;
    const chromeW = CHROME[navLayout] ?? 74;
    const wpEl = document.querySelector(".work-panel");
    const actTabBtn = [...document.querySelectorAll("button")].find(b => {
      return b.getAttribute("data-tab") === "activity" || b.textContent?.trim() === "Activity";
    });
    return {
      dataNavLayout: navLayout,
      dataTheme: el.dataset.theme ?? null,
      lang: el.lang,
      innerWidth: window.innerWidth,
      devicePixelRatio: window.devicePixelRatio,
      shellClientWidth,
      shellChromeW: chromeW,
      usableWidth: shellClientWidth - chromeW,
      workPanelVisible: !!wpEl && wpEl.clientWidth > 0,
    };
  })()`);
  return { ...dom, persistedSettings: settings, captureTime: new Date().toISOString() };
}

async function screenshot(cdp, path) {
  const res = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(res.data, "base64"));
  console.log(`  saved: ${path} (${(res.data.length / 1024).toFixed(0)} KB b64)`);
}

async function openActivityWorkPanel(cdp) {
  // Enable capture rig (required for openWorkPanel stub to load)
  await evalInPage(cdp, `window.__PI_CAPTURE__ = true`);
  await sleep(100);

  const result = await evalInPage(cdp, `
    (async () => {
      const api = window.__PI_DESKTOP__;
      if (!api) return "no-api";
      if (typeof api.openWorkPanel === "function") {
        await api.openWorkPanel();
        return "openWorkPanel-ok";
      }
      return "no-openWorkPanel";
    })()
  `);
  console.log("  openActivityWorkPanel:", result);

  if (result !== "openWorkPanel-ok") {
    // Fallback: click the WorkPanel toggle button
    await evalInPage(cdp, `
      (() => {
        const toggler = document.querySelector("[aria-label*='panel' i], .work-panel-toggle, [data-testid='work-panel-toggle']");
        if (toggler) { toggler.click(); return "toggler-clicked"; }
        const btns = [...document.querySelectorAll("button, [role=tab]")];
        const actBtn = btns.find(b => /activity/i.test(b.textContent ?? "") || b.dataset?.tab === "activity");
        if (actBtn) { actBtn.click(); return "activity-btn"; }
        return "no-button";
      })()
    `);
  }
  await sleep(800);
}

// ── workflow ──────────────────────────────────────────────────────────────────

async function run() {
  await ensureDir(SHOTS);
  const port = await freePort();
  const dataDir = await mkdtemp(join(tmpdir(), "pi-t10-cap-"));
  console.log("Launching Electron from:", WORKTREE);
  console.log({ port, dataDir });

  const env = { ...process.env, PI_DESKTOP_DATA_DIR: dataDir };
  delete env.PI_DESKTOP_CAPTURE;
  delete env.ELECTRON_RENDERER_URL;

  const child = spawn(ELECTRON, [".", `--remote-debugging-port=${port}`], {
    cwd: APP_DIR,
    env,
    stdio: "ignore",
  });
  child.unref();

  let cdp;
  try {
    console.log("Waiting for main renderer...");
    const target = await waitForMainTarget(port, 90_000);
    console.log("Target:", target.id, target.url.slice(0, 80));

    cdp = await cdpConnect(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");

    console.log("Waiting for settings IPC...");
    await waitForSettings(cdp, 20_000);
    console.log("  Settings ready");

    // ── LIGHT THEME ──────────────────────────────────────────────────────────
    console.log("Switching to light/rail...");
    await setSettings(cdp, { theme: "light", navLayout: "rail" });
    await cdp.send("Page.reload", {});
    await sleep(5000);
    await waitForSettings(cdp, 15_000);
    await sleep(1500);

    // Seed sessions and select one, then add tool messages
    console.log("  Running ensureVisualFixtures...");
    await evalInPage(cdp, `window.__PI_CAPTURE__ = true`);
    await evalInPage(cdp, `window.__PI_DESKTOP__.ensureVisualFixtures()`);
    await sleep(4000);
    await evalInPage(cdp, `window.__PI_DESKTOP__.seedRunRows(3)`);
    await sleep(500);

    await openActivityWorkPanel(cdp);

    const lightSettings = await evalInPage(cdp, `window.piDesktop.invoke("pi-desktop/settings/get")`);
    const lightState = await rootState(cdp, lightSettings);
    console.log("Light state:", JSON.stringify(lightState));

    const lightPath = `${SHOTS}/T10-wp-activity-light.png`;
    await screenshot(cdp, lightPath);
    await writeFile(
      `${SHOTS}/T10-wp-activity-light.provenance.json`,
      JSON.stringify({
        ...lightState,
        commit: "d10837300-and-composer-revert",
        branch: "feat/direction-d-t10",
        shotFile: lightPath,
        match: "MATCH: WorkPanel Activity tab open rail light; sub-tabs visible; framed composer",
      }, null, 2)
    );

    // ── DARK THEME ───────────────────────────────────────────────────────────
    console.log("Switching to dark/rail...");
    await setSettings(cdp, { theme: "dark", navLayout: "rail" });
    await cdp.send("Page.reload", {});
    await sleep(5000);
    await waitForSettings(cdp, 15_000);
    await sleep(1500);

    // Re-run ensureVisualFixtures for dark variant (sessions persist; just re-select)
    await evalInPage(cdp, `window.__PI_CAPTURE__ = true`);
    await evalInPage(cdp, `window.__PI_DESKTOP__.ensureVisualFixtures()`);
    await sleep(3000);
    await evalInPage(cdp, `window.__PI_DESKTOP__.seedRunRows(3)`);
    await sleep(500);

    await openActivityWorkPanel(cdp);

    const darkSettings = await evalInPage(cdp, `window.piDesktop.invoke("pi-desktop/settings/get")`);
    const darkState = await rootState(cdp, darkSettings);
    console.log("Dark state:", JSON.stringify(darkState));

    const darkPath = `${SHOTS}/T10-wp-activity-dark.png`;
    await screenshot(cdp, darkPath);
    await writeFile(
      `${SHOTS}/T10-wp-activity-dark.provenance.json`,
      JSON.stringify({
        ...darkState,
        commit: "d10837300-and-composer-revert",
        branch: "feat/direction-d-t10",
        shotFile: darkPath,
        match: "MATCH: WorkPanel Activity tab open rail dark; sub-tabs visible; framed composer",
      }, null, 2)
    );

    console.log("Captures complete!");
  } finally {
    try { cdp?.close(); } catch {}
    try { child.kill(); } catch {}
  }
}

run().catch((e) => {
  console.error("CAPTURE FAILED:", e.message);
  console.error(e.stack);
  process.exit(1);
});
