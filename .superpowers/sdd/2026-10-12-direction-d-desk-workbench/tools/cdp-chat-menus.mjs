#!/usr/bin/env node
/**
 * CDP interactive capture: perm-menu, model-menu, slash-menu, @-menu
 * Requires Node 22+ (native WebSocket) or Electron's CDP port.
 */
import { execSync, spawn } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { setTimeout as sleep } from "timers/promises";

const WS = new URL("../../../../", import.meta.url).pathname.replace(/\/$/, "");
const DESKTOP = join(WS, "apps/desktop");
const ELECTRON = join(DESKTOP, "node_modules/.bin/electron");
const SHOTS = join(WS, ".superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/T14");
const DATA_DIR = `/tmp/cdp-chat-menus-${Date.now()}`;
const CDP_PORT = 9355;
const COMMIT = execSync("git -C " + WS + " rev-parse --short HEAD").toString().trim();
const BUILD_TIME = new Date().toISOString();

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

console.log("Launching Electron with CDP port", CDP_PORT, "data", DATA_DIR);
const app = spawn(ELECTRON, [".", "--remote-debugging-port=" + CDP_PORT], {
  cwd: DESKTOP,
  env: {
    ...process.env,
    PI_DESKTOP_DATA_DIR: DATA_DIR,
    ELECTRON_ENABLE_LOGGING: "0",
  },
  stdio: "pipe",
});
app.stderr.on("data", (d) => process.stderr.write(d));

async function cdpGet(path) {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}${path}`);
  return res.json();
}

async function waitForTargets(maxMs = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const targets = await cdpGet("/json");
      // Exclude plugin-launcher surface windows; want the main chat renderer
      const page = targets.find((t) =>
        t.type === "page" &&
        t.webSocketDebuggerUrl &&
        t.url?.includes("index.html") &&
        !t.url?.includes("surface=")
      );
      if (page) {
        console.log("Found target:", page.url?.slice(0, 80));
        console.log("All targets:", targets.map(t => `[${t.type}] ${t.url?.slice(0, 70)}`).join("\n  "));
        return page;
      }
    } catch {}
    await sleep(500);
  }
  throw new Error("No index.html page target found after " + maxMs + "ms");
}

function openWs(wsUrl) {
  return new Promise((resolve, reject) => {
    const sock = new globalThis.WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();

    sock.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const myId = ++id;
            pending.set(myId, { res, rej });
            sock.send(JSON.stringify({ id: myId, method, params }));
          });
        },
        close() { sock.close(); },
      });
    });
    sock.addEventListener("message", ({ data: raw }) => {
      const msg = JSON.parse(raw);
      if (msg.id != null && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    });
    sock.addEventListener("error", (e) => reject(e));
  });
}

async function screenshot(cdp, shotName, meta = {}) {
  await sleep(800);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const buf = Buffer.from(data, "base64");
  writeFileSync(join(SHOTS, shotName + ".png"), buf);

  let rootAttrs = {};
  try {
    const r = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify({
        dataTheme: document.documentElement.getAttribute('data-theme'),
        dataNavLayout: document.documentElement.getAttribute('data-nav-layout'),
        pageId: document.querySelector('[data-page-id]')?.getAttribute('data-page-id') || '',
        menuOpen: document.querySelector('[aria-expanded="true"]')?.getAttribute('aria-label') || document.querySelector('[aria-expanded="true"]')?.textContent?.trim()?.slice(0,40) || '',
      })`,
      returnByValue: true,
    });
    rootAttrs = JSON.parse(r.result.value || "{}");
  } catch (e) {
    console.warn("DOM readback failed:", e.message);
  }

  const prov = {
    shot: shotName,
    commit: COMMIT,
    buildTime: BUILD_TIME,
    savedTheme: "light",
    savedNavLayout: "rail",
    viewport: { w: 1200, h: 800 },
    dpr: 2,
    ...rootAttrs,
    ...meta,
  };
  writeFileSync(join(SHOTS, shotName + ".json"), JSON.stringify(prov, null, 2));
  console.log("Shot:", shotName, JSON.stringify({ ...rootAttrs, ...meta }));
  return prov;
}

async function ev(cdp, expr) {
  return cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
}

async function click(cdp, selector) {
  const r = await ev(cdp, `(function(){
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return 'not found: ' + ${JSON.stringify(selector)};
    el.click(); return 'clicked: ' + el.tagName + ' ' + (el.className||'').slice(0,40);
  })()`);
  console.log("click:", selector, "→", r?.result?.value);
  await sleep(500);
}

async function typeInTextarea(cdp, text) {
  // Only dispatch 'char' event — keyDown also inserts text in contenteditable, causing doubles
  for (const char of text) {
    await cdp.send("Input.dispatchKeyEvent", {
      type: "char", key: char, text: char, unmodifiedText: char,
    });
    await sleep(50);
  }
  await sleep(400);
}

async function pressEscape(cdp) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown", key: "Escape", windowsVirtualKeyCode: 27,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Escape", windowsVirtualKeyCode: 27,
  });
  await sleep(300);
}

async function clearComposer(cdp) {
  await ev(cdp, `(function(){
    const el = document.querySelector('[role="textbox"][contenteditable]');
    if (!el) return;
    el.textContent = '';
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  })()`);
  await sleep(200);
}

async function waitForElement(cdp, selector, maxMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const r = await ev(cdp, `!!document.querySelector(${JSON.stringify(selector)})`);
    if (r?.result?.value === true) return true;
    await sleep(400);
  }
  return false;
}

async function main() {
  const target = await waitForTargets(40000);
  console.log("CDP connected:", target.title, target.url?.slice(0, 80));

  const cdp = await openWs(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1200, height: 800, deviceScaleFactor: 2, mobile: false,
  });

  // Allow app to fully boot (index.html → React → chat page)
  await sleep(8000);

  // Navigate to Chat if we're on plugin-launcher or wrong page
  const startPage = await ev(cdp, `document.querySelector('.app-shell') ? 'app-shell' : document.querySelector('.plugin-launcher') ? 'plugin-launcher' : 'unknown'`);
  console.log("Start page:", startPage?.result?.value);
  if (startPage?.result?.value !== "app-shell") {
    // Click the Chat nav rail button or Chat breadcrumb
    const navClicked = await ev(cdp, `(function(){
      const btn = Array.from(document.querySelectorAll('button, a, [role="button"]'))
        .find(el => el.textContent?.trim() === 'Chat');
      if (btn) { btn.click(); return 'chat-clicked'; }
      return 'chat-not-found';
    })()`);
    console.log("Nav to chat:", navClicked?.result?.value);
    await sleep(3000);
  }

  // Poll until the mode-chip appears (app fully rendered on chat page)
  console.log("Waiting for mode-chip...");
  const ready = await waitForElement(cdp, ".mode-chip", 15000);
  if (!ready) {
    const d = await ev(cdp, `document.body?.innerHTML?.slice(0, 400)`);
    console.warn("mode-chip not found. Body:", d?.result?.value);
  } else {
    console.log("mode-chip found — app ready");
    await sleep(800);
  }

  // ── DISMISS ONBOARDING if present ──
  const dismissed = await ev(cdp, `(function(){
    // Try various dismiss selectors
    const btn = document.querySelector('[class*="dismiss"]') ||
      Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Dismiss' || b.textContent?.trim() === 'Skip') ||
      document.querySelector('[aria-label*="dismiss" i]') ||
      document.querySelector('[aria-label*="close" i]');
    if (btn) { btn.click(); return 'dismissed: ' + btn.textContent?.trim(); }
    return 'no-onboarding';
  })()`);
  console.log("Dismiss onboarding:", dismissed?.result?.value);
  await sleep(600);

  // Identify actual selectors present
  const selDiag = await ev(cdp, `JSON.stringify({
    modeChip: !!document.querySelector('.mode-chip'),
    allModeChips: Array.from(document.querySelectorAll('.mode-chip')).map(b=>b.textContent?.trim()?.slice(0,30)),
    composer: !!document.querySelector('[role="textbox"][contenteditable]'),
    permChipText: Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.includes('Permissions'))?.textContent?.trim()?.slice(0,40),
  })`);
  console.log("Selector diag:", selDiag?.result?.value);

  // ── 1. PERM MENU ──
  // Click the Permissions chip specifically (not Branch chip)
  const permClicked = await ev(cdp, `(function(){
    const btn = Array.from(document.querySelectorAll('button.mode-chip, button[class*="mode-chip"]'))
      .find(b => b.textContent?.includes('Permissions') || b.textContent?.includes('Permission'));
    if (btn) { btn.click(); return 'perm-chip: ' + btn.textContent?.trim()?.slice(0,40); }
    return 'perm-chip not found';
  })()`);
  console.log("Perm chip click:", permClicked?.result?.value);
  await sleep(700);
  await screenshot(cdp, "pi-perm-menu-open", { menuCapture: "perm-menu" });

  // ── 2. MODEL MENU ──
  await pressEscape(cdp);
  await sleep(400);
  const modelClicked = await ev(cdp, `(function(){
    // Try class-based selectors first
    const byClass = document.querySelector('[class*="model-btn"],[class*="model-chip"],[class*="ModelSelector"]');
    if (byClass) { byClass.click(); return 'model-by-class: ' + byClass.className?.toString()?.slice(0,40); }
    // Fall back to text-based
    const byText = Array.from(document.querySelectorAll('button')).find(b=>
      b.textContent?.trim()?.startsWith('Model') || b.textContent?.trim() === 'Model'
    );
    if (byText) { byText.click(); return 'model-by-text: ' + byText.textContent?.trim()?.slice(0,30); }
    return 'model not found';
  })()`);
  console.log("Model click:", modelClicked?.result?.value);
  await sleep(700);
  await screenshot(cdp, "pi-model-menu-open", { menuCapture: "model-menu" });

  // ── 3. SLASH MENU ──
  await pressEscape(cdp);
  await sleep(400);
  // Clear composer then focus it
  await clearComposer(cdp);
  await sleep(200);
  await ev(cdp, `(function(){
    const el = document.querySelector('[role="textbox"][contenteditable]');
    if(el){el.focus(); el.click();}
  })()`);
  await sleep(300);
  await typeInTextarea(cdp, "/");
  await sleep(700);
  await screenshot(cdp, "pi-slash-menu-open", { menuCapture: "slash-menu" });

  // ── 4. AT MENU ──
  await pressEscape(cdp);
  await sleep(300);
  await clearComposer(cdp);
  await sleep(200);
  await ev(cdp, `(function(){
    const el = document.querySelector('[role="textbox"][contenteditable]');
    if(el){el.focus(); el.click();}
  })()`);
  await sleep(200);
  await typeInTextarea(cdp, "@");
  await sleep(700);
  await screenshot(cdp, "pi-at-menu-open", { menuCapture: "at-menu" });

  cdp.close();
  app.kill();
  console.log("Done — 4 interactive shots written to", SHOTS);
}

main().catch((e) => { console.error("FATAL:", e); app.kill(); process.exit(1); });
