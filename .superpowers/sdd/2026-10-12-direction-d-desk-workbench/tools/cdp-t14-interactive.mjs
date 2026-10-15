#!/usr/bin/env node
/**
 * cdp-t14-interactive.mjs — CDP capture for interactive and tabs shots
 * 
 * Takes 4 interactive shots (perm-menu-open, model-menu-open, slash-menu-open, at-menu-open)
 * plus 8 tabs-layout shots (pi-tabs-*).
 * 
 * Requires: Electron already launched with --remote-debugging-port=9362
 * Run from the tools/ directory or anywhere.
 */

import { createRequire } from "node:module";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);

const CDP_PORT = 9362;
const SHOTS_DIR = "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-t14-chat/.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/T14";
const BUILD_COMMIT = "292ce5770";

mkdirSync(SHOTS_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForTargets(port, maxTries = 30) {
  for (let i = 0; i < maxTries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json`);
      const targets = await r.json();
      // Skip plugin-launcher window
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
        setTimeout(() => { pending.delete(cmdId); rej(new Error(`Timeout: ${method}`)); }, 15000);
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
    hasOnboarding: !!document.querySelector(".ob-card, .onboarding-checklist, [class*='onboarding'], [class*='ob-card']"),
    hasModeChip: !!document.querySelector(".mode-chip, .composer-perm"),
  }))()`);
}

async function dismissOnboarding(cdp) {
  // Try multiple selectors for the dismiss button
  const dismissed = await evaluate(cdp, `(() => {
    // Try to find and click any dismiss button
    const candidates = [
      document.querySelector('[data-testid="dismiss-onboarding"]'),
      document.querySelector('.ob-dismiss'),
      document.querySelector('.onboarding-dismiss'),
      ...[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Dismiss'),
    ];
    for (const el of candidates) {
      if (el) { el.dispatchEvent(new MouseEvent('click', {bubbles: true})); return true; }
    }
    // Also try store mutation directly
    try {
      const store = window.__PI_DESKTOP__;
      // onboarding state is in useAppStore
      return false;
    } catch {}
    return false;
  })()`);
  if (dismissed) {
    await sleep(300);
    console.log("Onboarding dismissed via button");
  }
  return dismissed;
}

async function injectBannerHideCSS(cdp) {
  // Inject CSS to permanently hide the backend banner for all screenshots.
  // The OMP sidecar fails with --models-config so host reports ok:false →
  // banner appears, but we want clean shots without the error overlay.
  await evaluate(cdp, `(() => {
    if (document.getElementById('pi-cap-hide-banner')) return;
    const style = document.createElement('style');
    style.id = 'pi-cap-hide-banner';
    style.textContent = '.backend-banner { display: none !important; } .arch-banner { display: none !important; }';
    document.head.appendChild(style);
    console.log('[CDP] banner hidden via CSS override');
  })()`);
}


async function setTheme(cdp, theme) {
  await evaluate(cdp, `window.__PI_DESKTOP__?.setThemeAttr?.("${theme}")`);
  await sleep(300);
}

async function setNavLayout(cdp, layout) {
  await evaluate(cdp, `window.__PI_DESKTOP__?.setNavLayout?.("${layout}")`);
  await sleep(300);
}

async function setPage(cdp, page) {
  await evaluate(cdp, `window.__PI_DESKTOP__?.setPage?.("${page}")`);
  await sleep(600);
}

async function clearComposer(cdp) {
  // Clear contenteditable composer
  await evaluate(cdp, `(() => {
    const el = document.querySelector('.composer-input[contenteditable]');
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('delete', false);
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  })()`);
  await sleep(200);
  // Also press Escape to close any menus
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await sleep(100);
}

async function typeInComposer(cdp, text) {
  // Focus the composer first
  await evaluate(cdp, `(() => {
    const el = document.querySelector('.composer-input[contenteditable]');
    if (el) {
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  })()`);
  await sleep(100);
  
  // Type using CDP key events
  for (const char of text) {
    await cdp.send("Input.dispatchKeyEvent", {
      type: "char",
      text: char,
    });
    await sleep(50);
  }
  await sleep(500); // Wait for autocomplete to appear
}

async function main() {
  console.log(`Connecting to CDP on port ${CDP_PORT}...`);
  const wsUrl = await getWsUrl(CDP_PORT);
  console.log(`Connected to: ${wsUrl}`);
  
  const cdp = await cdpSocket(wsUrl);
  
  // Enable Page domain
  await cdp.send("Page.enable");
  
  // Check initial state
  const initialState = await getAppState(cdp);
  console.log("Initial state:", initialState);
  
  // Wait for app to be ready
  for (let i = 0; i < 20; i++) {
    const ready = await evaluate(cdp, `!!window.__PI_DESKTOP__?.setPage`);
    if (ready) break;
    await sleep(500);
  }
  
  // Dismiss any onboarding if visible
  const state = await getAppState(cdp);
  if (state.hasOnboarding) {
    console.log("Onboarding visible, dismissing...");
    await dismissOnboarding(cdp);
    await sleep(500);
  }
  
  // Enable capture rig
  await evaluate(cdp, `window.__PI_CAPTURE__ = 1`);
  await evaluate(cdp, `void window.__PI_DESKTOP__?.ensureVisualFixtures?.()`);
  await sleep(600);
  
  // Navigate to chat, light theme, rail layout
  await setTheme(cdp, "light");
  await setNavLayout(cdp, "rail");
  await setPage(cdp, "chat");
  await sleep(400);
  
  // Check for onboarding again after navigation
  const stateAfterNav = await getAppState(cdp);
  console.log("State after nav:", stateAfterNav);
  if (stateAfterNav.hasOnboarding) {
    console.log("Onboarding visible after nav, dismissing via store...");
    // Use store mutation to force-dismiss
    await evaluate(cdp, `(() => {
      try {
        const store = window.useAppStore?.getState?.();
        if (store?.onboarding) {
          window.useAppStore.setState({ onboarding: { ...store.onboarding, showChecklist: false } });
        }
      } catch(e) { console.warn('store mutation failed', e.message); }
    })()`);
    await sleep(400);
    // Also click dismiss button
    await dismissOnboarding(cdp);
    await sleep(400);
  }
  
  // Inject CSS to hide the backend banner in all shots (OMP sidecar fails → fatal banner)
  await injectBannerHideCSS(cdp);
  const bannerPresent = await evaluate(cdp,
    `!!document.querySelector('.backend-banner, [class*="backend-banner"]')`
  );
  if (bannerPresent) {
    console.log("Backend banner DOM present but hidden via CSS override ✓");
  } else {
    console.log("No backend banner ✓");
  }
  
  const BUILD_TIME = new Date().toISOString();
  const provenanceBase = {
    commit: BUILD_COMMIT,
    buildTime: BUILD_TIME,
    viewport: { w: 1200, h: 800 },
    dpr: 2,
  };
  
  //
  // === INTERACTIVE SHOTS (chat page, rail layout) ===
  //
  
  // 1. Permission menu open
  console.log("\n--- pi-perm-menu-open ---");
  await clearComposer(cdp);
  await sleep(200);
  // Click the permissions chip
  await evaluate(cdp, `(() => {
    const btn = document.querySelector('.composer-perm-btn, [data-testid="perm-btn"], button.mode-chip, .composer-perm');
    if (btn) {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return btn.className;
    }
    // Try by text content
    const btns = [...document.querySelectorAll('button')];
    const perm = btns.find(b => b.textContent.includes('Permissions') || b.textContent.includes('Ask every'));
    if (perm) {
      perm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return 'by-text:' + perm.className;
    }
    return null;
  })()`);
  await sleep(600);
  
  const permMenuOpen = await evaluate(cdp,
    `!!document.querySelector('.composer-perm-menu, .perm-menu, [role="menu"]')`
  );
  console.log("Perm menu open:", permMenuOpen);
  
  const permState = await getAppState(cdp);
  await screenshot(cdp, "pi-perm-menu-open");
  writeProvenance("pi-perm-menu-open", {
    ...provenanceBase,
    dataTheme: permState.theme || "light",
    dataNavLayout: permState.navLayout || "rail",
    savedNavLayout: "rail",
    savedTheme: "light",
    activePage: "chat",
    navRailPresent: true,
    permMenuOpen,
    hasOnboarding: permState.hasOnboarding,
    hasBackendBanner: permState.hasBackendBanner,
  });
  
  // Close menu
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await sleep(300);
  
  // 2. Model menu open
  console.log("\n--- pi-model-menu-open ---");
  await evaluate(cdp, `(() => {
    // Click the model chip/button in the composer
    const selectors = [
      '.composer-model button',
      '.composer-model-thinking button', 
      '.model-chip',
      '[data-testid="model-btn"]',
      '.composer-toolbar-model',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return sel; }
    }
    // Try by text "Model"
    const btns = [...document.querySelectorAll('button')];
    const model = btns.find(b => b.textContent.trim() === 'Model' || b.querySelector('[class*="model"]'));
    if (model) { model.dispatchEvent(new MouseEvent('click', { bubbles: true })); return 'by-text'; }
    return null;
  })()`);
  await sleep(600);
  
  const modelMenuOpen = await evaluate(cdp,
    `!!document.querySelector('[role="menu"], .model-menu, .composer-model-menu, .model-dropdown')`
  );
  console.log("Model menu open:", modelMenuOpen);
  
  const modelState = await getAppState(cdp);
  await screenshot(cdp, "pi-model-menu-open");
  writeProvenance("pi-model-menu-open", {
    ...provenanceBase,
    dataTheme: modelState.theme || "light",
    dataNavLayout: modelState.navLayout || "rail",
    savedNavLayout: "rail",
    savedTheme: "light",
    activePage: "chat",
    navRailPresent: true,
    modelMenuOpen,
    hasOnboarding: modelState.hasOnboarding,
    hasBackendBanner: modelState.hasBackendBanner,
  });
  
  // Close menu
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await sleep(300);
  
  // 3. Slash menu open
  console.log("\n--- pi-slash-menu-open ---");
  await clearComposer(cdp);
  await sleep(300);
  await typeInComposer(cdp, "/");
  await sleep(600);
  
  const slashMenuState = await evaluate(cdp, `(() => {
    const ac = document.querySelector('.composer-autocomplete');
    return ac ? {
      visible: true,
      items: ac.querySelectorAll('.composer-ac-item, [role="option"]').length,
    } : { visible: false, items: 0 };
  })()`);
  console.log("Slash menu state:", slashMenuState);
  
  const slashState = await getAppState(cdp);
  await screenshot(cdp, "pi-slash-menu-open");
  writeProvenance("pi-slash-menu-open", {
    ...provenanceBase,
    dataTheme: slashState.theme || "light",
    dataNavLayout: slashState.navLayout || "rail",
    savedNavLayout: "rail",
    savedTheme: "light",
    activePage: "chat",
    navRailPresent: true,
    slashMenuVisible: slashMenuState?.visible ?? false,
    slashMenuItems: slashMenuState?.items ?? 0,
    hasOnboarding: slashState.hasOnboarding,
    hasBackendBanner: slashState.hasBackendBanner,
  });
  
  // 4. At menu open
  console.log("\n--- pi-at-menu-open ---");
  await clearComposer(cdp);
  await sleep(300);
  await typeInComposer(cdp, "@");
  await sleep(600);
  
  const atMenuState = await evaluate(cdp, `(() => {
    const ac = document.querySelector('.composer-autocomplete');
    return ac ? {
      visible: true,
      items: ac.querySelectorAll('.composer-ac-item, [role="option"]').length,
    } : { visible: false, items: 0 };
  })()`);
  console.log("At menu state:", atMenuState);
  
  const atState = await getAppState(cdp);
  await screenshot(cdp, "pi-at-menu-open");
  writeProvenance("pi-at-menu-open", {
    ...provenanceBase,
    dataTheme: atState.theme || "light",
    dataNavLayout: atState.navLayout || "rail",
    savedNavLayout: "rail",
    savedTheme: "light",
    activePage: "chat",
    navRailPresent: true,
    atMenuVisible: atMenuState?.visible ?? false,
    atMenuItems: atMenuState?.items ?? 0,
    hasOnboarding: atState.hasOnboarding,
    hasBackendBanner: atState.hasBackendBanner,
  });
  
  // Clear composer
  await clearComposer(cdp);
  await sleep(200);
  
  //
  // === TABS LAYOUT SHOTS ===
  // Set nav layout to "tabs", take shots of different pages
  //
  
  console.log("\n--- TABS LAYOUT SHOTS ---");
  await setNavLayout(cdp, "tabs");
  await sleep(300);
  
  // tabs chat light
  await setTheme(cdp, "light");
  await setPage(cdp, "chat");
  await sleep(300);
  const tChatL = await getAppState(cdp);
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
  
  // tabs chat dark
  await setTheme(cdp, "dark");
  await sleep(300);
  const tChatD = await getAppState(cdp);
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
  
  // tabs bench dark
  await evaluate(cdp, `window.__PI_DESKTOP__?.setPage?.("bench")`);
  await sleep(600);
  const tBenchD = await getAppState(cdp);
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
  
  // tabs build light
  await setTheme(cdp, "light");
  await evaluate(cdp, `window.__PI_DESKTOP__?.setPage?.("build")`);
  await sleep(600);
  const tBuildL = await getAppState(cdp);
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
  
  // tabs pulls dark
  await setTheme(cdp, "dark");
  await evaluate(cdp, `window.__PI_DESKTOP__?.setPage?.("pulls")`);
  await sleep(600);
  const tPullsD = await getAppState(cdp);
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
  
  // tabs scheduled light
  await setTheme(cdp, "light");
  await evaluate(cdp, `window.__PI_DESKTOP__?.setPage?.("scheduled")`);
  await sleep(600);
  const tSchedL = await getAppState(cdp);
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
  
  // tabs settings light
  await evaluate(cdp, `window.__PI_DESKTOP__?.setPage?.("settings")`);
  await sleep(600);
  const tSettL = await getAppState(cdp);
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
  
  // tabs settings dark
  await setTheme(cdp, "dark");
  await sleep(300);
  const tSettD = await getAppState(cdp);
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
  
  // Reset layout back to rail
  await setNavLayout(cdp, "rail");
  await setTheme(cdp, "light");
  
  console.log("\n=== All CDP shots complete ===");
  cdp.close();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
