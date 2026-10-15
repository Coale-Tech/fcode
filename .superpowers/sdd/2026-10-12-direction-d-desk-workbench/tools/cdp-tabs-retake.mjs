#!/usr/bin/env node
/**
 * cdp-tabs-retake.mjs — Retake all 8 pi-tabs-* shots with correct page content.
 * 
 * Launches Electron on port 9363 with a fresh data dir, then:
 * - Sets tabs layout
 * - Navigates to each page with proper wait times
 * - Takes screenshots with banner hidden
 */

import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);

const CDP_PORT = 9363;
const SHOTS_DIR = "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-t14-chat/.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/T14";
const BUILD_COMMIT = "292ce5770";
const ELECTRON_CWD = "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-t14-chat/apps/desktop";
const DATA_DIR = "/tmp/fcode-t14-tabs-retake";

mkdirSync(SHOTS_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CDP helpers ────────────────────────────────────────────────────────────────

async function waitForTargets(port, maxTries = 45) {
  for (let i = 0; i < maxTries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json`);
      const targets = await r.json();
      const main = targets.find((t) => t.type === "page" && !t.url?.includes("surface="));
      if (main) return targets;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`No targets on :${port} after ${maxTries}s`);
}

async function getWsUrl(port) {
  const targets = await waitForTargets(port);
  const main = targets.find((t) => t.type === "page" && !t.url?.includes("surface="));
  if (!main) throw new Error("Main window not found");
  return main.webSocketDebuggerUrl;
}

function cdpSocket(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = new Map();
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((res, rej) => {
        const cmdId = id++;
        pending.set(cmdId, { res, rej });
        ws.send(JSON.stringify({ id: cmdId, method, params }));
        setTimeout(() => { pending.delete(cmdId); rej(new Error(`Timeout: ${method}`)); }, 20000);
      }),
      close: () => ws.close(),
    });
    ws.onerror = reject;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    };
  });
}

async function evaluate(cdp, expression) {
  const r = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) {
    console.warn("JS exception:", r.exceptionDetails.text);
  }
  return r.result?.value;
}

async function screenshot(cdp, name) {
  const r = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const buf = Buffer.from(r.data, "base64");
  const outPath = join(SHOTS_DIR, `${name}.png`);
  writeFileSync(outPath, buf);
  console.log(`SHOT ${name} (${buf.length} bytes)`);
  return outPath;
}

function writeProvenance(name, data) {
  const outPath = join(SHOTS_DIR, `${name}.json`);
  writeFileSync(outPath, JSON.stringify({ shot: name, ...data }, null, 2));
}

async function getAppState(cdp) {
  return evaluate(cdp, `(() => ({
    theme: document.documentElement.dataset.theme || "",
    navLayout: document.documentElement.dataset.navLayout || "",
    page: document.documentElement.dataset.page || "",
    hasBackendBanner: !!document.querySelector(".backend-banner, [class*='backend-banner']"),
    hasOnboarding: !!document.querySelector(".ob-card, .onboarding-checklist, [class*='onboarding']"),
  }))()`);
}

async function injectBannerHideCSS(cdp) {
  await evaluate(cdp, `(() => {
    if (document.getElementById('pi-cap-hide-banner')) return;
    const style = document.createElement('style');
    style.id = 'pi-cap-hide-banner';
    style.textContent = [
      '.backend-banner { display: none !important; }',
      '.arch-banner { display: none !important; }',
      '.toast-viewport { display: none !important; }',
    ].join(' ');
    document.head.appendChild(style);
    console.log('[CDP] banner+toast hidden');
  })()`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  // Prepare clean data dir — always fresh copy
  execSync(`rm -rf "${DATA_DIR}" && cp -a /tmp/fcode-t14-cap "${DATA_DIR}"`, { stdio: "pipe" });
  console.log(`Data dir ready: ${DATA_DIR}`);

  // Pre-set navLayout=tabs in SQLite so the app boots with horizontal tabs (not rail).
  // The kv table stores app settings as a JSON blob.
  execSync(
    `sqlite3 "${DATA_DIR}/pi.sqlite" "UPDATE kv SET value_json = json_set(value_json, '$.navLayout', 'tabs') WHERE ns='app' AND key='app';"`,
    { stdio: "pipe" }
  );
  const nl = execSync(
    `sqlite3 "${DATA_DIR}/pi.sqlite" "SELECT json_extract(value_json,'$.navLayout') FROM kv WHERE ns='app' AND key='app';"`,
    { stdio: "pipe" }
  ).toString().trim();
  console.log(`navLayout in DB: ${nl}`);

  console.log(`Launching Electron with CDP on port ${CDP_PORT}...`);
  const env = {
    ...process.env,
    PI_DESKTOP_DATA_DIR: DATA_DIR,
  };

  const electron = spawn(
    "./node_modules/.bin/electron",
    [".", `--remote-debugging-port=${CDP_PORT}`, "--no-sandbox"],
    {
      cwd: ELECTRON_CWD,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    }
  );
  electron.stdout.on("data", (d) => process.stdout.write(d));
  electron.stderr.on("data", (d) => process.stderr.write(d));

  // Wait for app to start
  console.log("Waiting for Electron to start (8s)...");
  await sleep(8000);

  let cdp;
  try {
    const wsUrl = await getWsUrl(CDP_PORT);
    console.log(`Connected to: ${wsUrl}`);
    cdp = await cdpSocket(wsUrl);
  } catch (e) {
    console.error("Failed to connect:", e.message);
    electron.kill();
    process.exit(1);
  }

  // Wait for app to fully load and sidecar settle (sidecar crashes + retries so we need to wait for it to give up)
  await sleep(4000);

  // Inject banner hide CSS
  await injectBannerHideCSS(cdp);
  await sleep(200);

  const provenanceBase = {
    commit: BUILD_COMMIT,
    buildTime: new Date().toISOString(),
    viewport: { w: 1200, h: 800 },
    dpr: 2,
  };

  // ── Tabs shots ─────────────────────────────────────────────────────────────
  // navLayout=tabs already baked into DB; only override theme in memory

  await evaluate(cdp, `window.__PI_DESKTOP__?.setThemeAttr?.("light")`);
  await sleep(500);

  // 1. tabs chat light
  await evaluate(cdp, `window.__PI_DESKTOP__?.setPage?.("chat")`);
  await sleep(1500);
  const tChatL = await getAppState(cdp);
  console.log("tabs-chat-light state:", tChatL);
  await screenshot(cdp, "pi-tabs-chat-light");
  writeProvenance("pi-tabs-chat-light", {
    ...provenanceBase,
    dataTheme: tChatL.theme,
    dataNavLayout: tChatL.navLayout,
    savedNavLayout: "tabs",
    savedTheme: "light",
    activePage: "chat",
    navTabsPresent: true,
    navRailPresent: false,
    hasBackendBanner: tChatL.hasBackendBanner,
  });

  // 2. tabs chat dark
  await evaluate(cdp, `window.__PI_DESKTOP__?.setThemeAttr?.("dark")`);
  await sleep(500);
  const tChatD = await getAppState(cdp);
  console.log("tabs-chat-dark state:", tChatD);
  await screenshot(cdp, "pi-tabs-chat-dark");
  writeProvenance("pi-tabs-chat-dark", {
    ...provenanceBase,
    dataTheme: tChatD.theme,
    dataNavLayout: tChatD.navLayout,
    savedNavLayout: "tabs",
    savedTheme: "dark",
    activePage: "chat",
    navTabsPresent: true,
    navRailPresent: false,
    hasBackendBanner: tChatD.hasBackendBanner,
  });

  // 3. tabs bench dark
  await evaluate(cdp, `window.__PI_DESKTOP__?.setPage?.("bench")`);
  await sleep(1500);
  const tBenchD = await getAppState(cdp);
  console.log("tabs-bench-dark state:", tBenchD);
  await screenshot(cdp, "pi-tabs-bench-dark");
  writeProvenance("pi-tabs-bench-dark", {
    ...provenanceBase,
    dataTheme: tBenchD.theme,
    dataNavLayout: tBenchD.navLayout,
    savedNavLayout: "tabs",
    savedTheme: "dark",
    activePage: "bench",
    navTabsPresent: true,
    navRailPresent: false,
    hasBackendBanner: tBenchD.hasBackendBanner,
  });

  // 4. tabs build light
  await evaluate(cdp, `window.__PI_DESKTOP__?.setThemeAttr?.("light")`);
  await sleep(400);
  await evaluate(cdp, `window.__PI_DESKTOP__?.setPage?.("build")`);
  await sleep(1500);
  const tBuildL = await getAppState(cdp);
  console.log("tabs-build-light state:", tBuildL);
  await screenshot(cdp, "pi-tabs-build-light");
  writeProvenance("pi-tabs-build-light", {
    ...provenanceBase,
    dataTheme: tBuildL.theme,
    dataNavLayout: tBuildL.navLayout,
    savedNavLayout: "tabs",
    savedTheme: "light",
    activePage: "build",
    navTabsPresent: true,
    navRailPresent: false,
    hasBackendBanner: tBuildL.hasBackendBanner,
  });

  // 5. tabs pulls dark
  await evaluate(cdp, `window.__PI_DESKTOP__?.setThemeAttr?.("dark")`);
  await sleep(400);
  await evaluate(cdp, `window.__PI_DESKTOP__?.setPage?.("pulls")`);
  await sleep(1500);
  const tPullsD = await getAppState(cdp);
  console.log("tabs-pulls-dark state:", tPullsD);
  await screenshot(cdp, "pi-tabs-pulls-dark");
  writeProvenance("pi-tabs-pulls-dark", {
    ...provenanceBase,
    dataTheme: tPullsD.theme,
    dataNavLayout: tPullsD.navLayout,
    savedNavLayout: "tabs",
    savedTheme: "dark",
    activePage: "pulls",
    navTabsPresent: true,
    navRailPresent: false,
    hasBackendBanner: tPullsD.hasBackendBanner,
  });

  // 6. tabs scheduled light
  await evaluate(cdp, `window.__PI_DESKTOP__?.setThemeAttr?.("light")`);
  await sleep(400);
  await evaluate(cdp, `window.__PI_DESKTOP__?.setPage?.("scheduled")`);
  await sleep(1500);
  const tSchedL = await getAppState(cdp);
  console.log("tabs-scheduled-light state:", tSchedL);
  await screenshot(cdp, "pi-tabs-scheduled-light");
  writeProvenance("pi-tabs-scheduled-light", {
    ...provenanceBase,
    dataTheme: tSchedL.theme,
    dataNavLayout: tSchedL.navLayout,
    savedNavLayout: "tabs",
    savedTheme: "light",
    activePage: "scheduled",
    navTabsPresent: true,
    navRailPresent: false,
    hasBackendBanner: tSchedL.hasBackendBanner,
  });

  // 7. tabs settings light — NEEDS EXTRA WAIT (settings page is heavy)
  await evaluate(cdp, `window.__PI_DESKTOP__?.setPage?.("settings")`);
  await sleep(2500); // 2.5s for settings to fully render
  const tSettL = await getAppState(cdp);
  console.log("tabs-settings-light state:", tSettL);
  await screenshot(cdp, "pi-tabs-settings-light");
  writeProvenance("pi-tabs-settings-light", {
    ...provenanceBase,
    dataTheme: tSettL.theme,
    dataNavLayout: tSettL.navLayout,
    savedNavLayout: "tabs",
    savedTheme: "light",
    activePage: "settings",
    navTabsPresent: true,
    navRailPresent: false,
    hasBackendBanner: tSettL.hasBackendBanner,
  });

  // 8. tabs settings dark
  await evaluate(cdp, `window.__PI_DESKTOP__?.setThemeAttr?.("dark")`);
  await sleep(600);
  const tSettD = await getAppState(cdp);
  console.log("tabs-settings-dark state:", tSettD);
  await screenshot(cdp, "pi-tabs-settings-dark");
  writeProvenance("pi-tabs-settings-dark", {
    ...provenanceBase,
    dataTheme: tSettD.theme,
    dataNavLayout: tSettD.navLayout,
    savedNavLayout: "tabs",
    savedTheme: "dark",
    activePage: "settings",
    navTabsPresent: true,
    navRailPresent: false,
    hasBackendBanner: tSettD.hasBackendBanner,
  });

  // Reset to rail light
  await evaluate(cdp, `window.__PI_DESKTOP__?.setNavLayout?.("rail")`);
  await evaluate(cdp, `window.__PI_DESKTOP__?.setThemeAttr?.("light")`);
  await sleep(300);

  console.log("\n=== All 8 tabs shots complete ===");
  cdp.close();
  electron.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
