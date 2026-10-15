/**
 * capture-t14-v2.mjs — T14 raw-CDP capture (no browser global needed)
 *
 * Attaches to a RUNNING Electron via raw WebSocket CDP at CDP_PORT.
 * Uses Page.captureScreenshot (tab.screenshot({path}) has a known write bug).
 * Dispatches Escape before every shot to dismiss command palette / dialogs.
 * Injects CSS to suppress backend-banner on first connect.
 *
 * USAGE (from eval):
 *   const { run } = await import('.../capture-t14-v2.mjs?v=1');
 *   const result = await run();
 */

import { writeFile, mkdir, stat } from "node:fs/promises";

const WORKTREE = "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-t14-pages";
const OUT_DIR  = `${WORKTREE}/.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/T14`;
const COMMIT   = "ac50b773a";
const CDP_PORT = 9346;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Raw CDP helpers ──────────────────────────────────────────────────────────

async function connectCDP(port) {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  // Main window has no ?surface= query param
  const main = targets.find((t) => !t.url.includes("?"));
  if (!main) throw new Error(`No main target at :${port}. Found: ${targets.map((t) => t.url).join(", ")}`);
  console.log("CDP target:", main.id, main.url.slice(0, 80));

  let msgId = 0;
  const pending = new Map();

  const ws = new WebSocket(main.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = (e) => reject(e.message ?? "ws error");
  });
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`CDP ${msg.error.message}`));
      else resolve(msg.result);
    }
  };

  function cdp(method, params = {}) {
    const id = ++msgId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expr) {
    // Wrap in async IIFE so awaitPromise handles both sync and Promise results.
    const wrapped = `(async()=>{return(${expr})})()`;
    const r = await cdp("Runtime.evaluate", { expression: wrapped, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      const msg = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? JSON.stringify(r.exceptionDetails);
      throw new Error(`CDP eval: ${msg}`);
    }
    return r.result?.value;
  }

  async function screenshot(path) {
    const r = await cdp("Page.captureScreenshot", { format: "png" });
    await Bun.write(path, Buffer.from(r.data, "base64"));
  }

  async function pressEscape() {
    await cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", nativeVirtualKeyCode: 27 });
    await wait(100);
    await cdp("Input.dispatchKeyEvent", { type: "keyUp",    key: "Escape", code: "Escape", nativeVirtualKeyCode: 27 });
    await wait(200);
  }

  return { cdp, evaluate, screenshot, pressEscape, close: () => { try { ws.close(); } catch {} } };
}

// ── Capture helpers ──────────────────────────────────────────────────────────

async function prov(h, { layout, theme, page, notes = "" }) {
  const state = await h.evaluate(`(() => {
    const el = document.documentElement;
    const d  = window.__PI_DESKTOP__;
    const st = d && typeof d.getState === "function" ? d.getState() : null;
    return {
      dataNavLayout: el.dataset.navLayout,
      dataTheme:     el.dataset.theme,
      innerWidth:    window.innerWidth,
      DPR:           window.devicePixelRatio,
      savedNavLayout: st?.settings?.navLayout ?? null,
      savedTheme:     st?.settings?.theme    ?? null,
    };
  })()`);
  return {
    commit: COMMIT,
    buildTime: new Date().toISOString(),
    viewport: `${state.innerWidth}×${Math.round((state.innerWidth ?? 1280) * 0.667)}`,
    DPR: state.DPR,
    savedNavLayout: state.savedNavLayout,
    savedTheme: state.savedTheme,
    dataNavLayout: state.dataNavLayout,
    dataTheme: state.dataTheme,
    pageId: page,
    layout,
    theme,
    notes,
  };
}

async function shot(h, name, { layout, theme, page, notes = "" }) {
  await h.pressEscape();              // dismiss command palette / any dialog
  await wait(150);
  const p = await prov(h, { layout, theme, page, notes });
  await h.screenshot(`${OUT_DIR}/${name}.png`);
  await writeFile(`${OUT_DIR}/${name}.json`, JSON.stringify(p, null, 2));
  console.log(`  ✓ ${name} [${p.dataNavLayout}/${p.dataTheme}]`);
  return p;
}

async function applySettings(h, layout, theme) {
  await h.evaluate(`(() => {
    const d = window.__PI_DESKTOP__;
    if (d) { d.setNavLayout(${JSON.stringify(layout)}); d.setTheme(${JSON.stringify(theme)}); }
    else { document.documentElement.dataset.navLayout=${JSON.stringify(layout)}; document.documentElement.dataset.theme=${JSON.stringify(theme)}; }
  })()`);
  await wait(300);
  // Force DOM attrs as fallback
  const got = await h.evaluate(`({nl:document.documentElement.dataset.navLayout, th:document.documentElement.dataset.theme})`);
  if (got.nl !== layout || got.th !== theme) {
    await h.evaluate(`document.documentElement.dataset.navLayout=${JSON.stringify(layout)};document.documentElement.dataset.theme=${JSON.stringify(theme)};`);
    await wait(200);
  }
}

const goToPage = async (h, page) => { await h.evaluate(`window.__PI_DESKTOP__?.setPage(${JSON.stringify(page)})`); await wait(500); };
const seedCapture = (h, method) => h.evaluate(`(() => { const d=window.__PI_DESKTOP__; if(d&&typeof d.${method}==="function")return d.${method}(); const r=window.__PI_CAPTURE_RIG__; if(r&&typeof r.${method}==="function")return r.${method}(); return "not-found"; })()`);
const verifyPage  = async (h, cls) => {
  const ok = await h.evaluate(`!!document.querySelector(".${cls}")`);
  if (!ok) { const inf = await h.evaluate(`Array.from(document.querySelectorAll('[class*="page"]')).map(e=>e.className).join(" | ").slice(0,300)`); console.warn(`verifyPage .${cls} NOT FOUND. Pages: ${inf}`); }
  return ok;
};

// ── Main export ──────────────────────────────────────────────────────────────

export async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  const h = await connectCDP(CDP_PORT);

  try {
    // Enable capture rig
    await h.evaluate("window.__PI_CAPTURE__ = 1");

    // Suppress backend banner + any stray overlay
    await h.evaluate(`(() => {
      let s = document.getElementById("cap-fixes");
      if (!s) { s = document.createElement("style"); s.id = "cap-fixes"; document.head.appendChild(s); }
      s.textContent = ".backend-banner,.backend-status-bar,[class*=backend-banner]{display:none!important}";
      return "ok";
    })()`);
    await wait(200);

    // ── Kanban ────────────────────────────────────────────────────────────
    console.log("=== Kanban ===");
    await applySettings(h, "rail", "light");
    await goToPage(h, "kanban"); await wait(600);
    await seedCapture(h, "seedKanbanBoard"); await wait(600);
    const kanbanOk = await verifyPage(h, "kanban-page");
    await shot(h, "kanban-light-rail", { layout:"rail", theme:"light", page:"kanban", notes:`kanbanOk=${kanbanOk}` });

    await applySettings(h, "rail", "dark");
    await goToPage(h, "kanban"); await wait(500);
    await seedCapture(h, "seedKanbanBoard"); await wait(500);
    await shot(h, "kanban-dark-rail", { layout:"rail", theme:"dark", page:"kanban" });

    await applySettings(h, "island", "light");
    await goToPage(h, "kanban"); await wait(500);
    await seedCapture(h, "seedKanbanBoard"); await wait(500);
    await shot(h, "kanban-light-island", { layout:"island", theme:"light", page:"kanban" });

    // Kanban: open drawer
    await applySettings(h, "rail", "light");
    await goToPage(h, "kanban"); await wait(500);
    await seedCapture(h, "seedKanbanBoard"); await wait(500);
    const clickedCard = await h.evaluate(`(() => {
      const running = document.querySelectorAll('[data-column="running"] .kanban-card');
      if (running.length) { running[0].click(); return "running"; }
      const any = document.querySelector(".kanban-card");
      if (any) { any.click(); return "any"; }
      return false;
    })()`);
    await wait(500);
    const drawerOpen = await h.evaluate(`!!document.querySelector(".kanban-drawer")`);
    await shot(h, "kanban-drawer-light", { layout:"rail", theme:"light", page:"kanban", notes:`drawerOpen=${drawerOpen} card=${clickedCard}` });

    // ── Scheduled ─────────────────────────────────────────────────────────
    console.log("=== Scheduled ===");
    await applySettings(h, "rail", "light");
    await goToPage(h, "scheduled"); await wait(600);
    await seedCapture(h, "seedScheduledTasks"); await wait(600);
    const schedOk = await verifyPage(h, "scheduled-page");
    await shot(h, "scheduled-light-rail", { layout:"rail", theme:"light", page:"scheduled", notes:`schedOk=${schedOk}` });

    await applySettings(h, "rail", "dark");
    await goToPage(h, "scheduled"); await wait(500);
    await seedCapture(h, "seedScheduledTasks"); await wait(500);
    await shot(h, "scheduled-dark-rail", { layout:"rail", theme:"dark", page:"scheduled" });

    await applySettings(h, "island", "light");
    await goToPage(h, "scheduled"); await wait(500);
    await seedCapture(h, "seedScheduledTasks"); await wait(500);
    await shot(h, "scheduled-light-island", { layout:"island", theme:"light", page:"scheduled" });

    // Scheduled: click row → detail
    await applySettings(h, "rail", "light");
    await goToPage(h, "scheduled"); await wait(500);
    await seedCapture(h, "seedScheduledTasks"); await wait(500);
    const clickedRow = await h.evaluate(`(() => { const r = document.querySelector(".dest-row, .sch-row, .scheduled-row"); if(r){r.click();return true;} return false; })()`);
    await wait(500);
    const detailOpen = await h.evaluate(`!!document.querySelector(".sch-detail, .scheduled-detail")`);
    await shot(h, "scheduled-detail-light", { layout:"rail", theme:"light", page:"scheduled", notes:`detail=${detailOpen} row=${clickedRow}` });

    // ── Pull Requests ──────────────────────────────────────────────────────
    console.log("=== Pull Requests ===");
    await applySettings(h, "rail", "light");
    await goToPage(h, "pulls"); await wait(600);
    await seedCapture(h, "seedPullRequests"); await wait(600);
    const pullsOk = await verifyPage(h, "pulls-page");
    await shot(h, "pulls-light-rail", { layout:"rail", theme:"light", page:"pulls", notes:`pullsOk=${pullsOk}` });

    await applySettings(h, "rail", "dark");
    await goToPage(h, "pulls"); await wait(500);
    await seedCapture(h, "seedPullRequests"); await wait(500);
    await shot(h, "pulls-dark-rail", { layout:"rail", theme:"dark", page:"pulls" });

    await applySettings(h, "island", "light");
    await goToPage(h, "pulls"); await wait(500);
    await seedCapture(h, "seedPullRequests"); await wait(500);
    await shot(h, "pulls-light-island", { layout:"island", theme:"light", page:"pulls" });

    // PR detail panel
    await applySettings(h, "rail", "light");
    await goToPage(h, "pulls"); await wait(500);
    await seedCapture(h, "seedPullRequests"); await wait(500);
    const clickedPR = await h.evaluate(`(() => { const r = document.querySelector(".pr-row, .dest-row"); if(r){r.click();return true;} return false; })()`);
    await wait(500);
    const prDetailOpen = await h.evaluate(`!!document.querySelector(".pr-detail, .dest-detail")`);
    await shot(h, "pulls-detail-light", { layout:"rail", theme:"light", page:"pulls", notes:`prDetail=${prDetailOpen} pr=${clickedPR}` });

    // ── Notifications ──────────────────────────────────────────────────────
    console.log("=== Notifications ===");
    await applySettings(h, "rail", "light");
    await goToPage(h, "notifications"); await wait(600);
    await seedCapture(h, "seedNotifications"); await wait(600);
    const notifOk = await verifyPage(h, "notifications-page");
    await shot(h, "notifications-light-rail", { layout:"rail", theme:"light", page:"notifications", notes:`notifOk=${notifOk}` });

    await applySettings(h, "rail", "dark");
    await goToPage(h, "notifications"); await wait(500);
    await seedCapture(h, "seedNotifications"); await wait(500);
    await shot(h, "notifications-dark-rail", { layout:"rail", theme:"dark", page:"notifications" });

    await applySettings(h, "island", "light");
    await goToPage(h, "notifications"); await wait(500);
    await seedCapture(h, "seedNotifications"); await wait(500);
    await shot(h, "notifications-light-island", { layout:"island", theme:"light", page:"notifications" });

    // Notifications: Unread filter
    await applySettings(h, "rail", "light");
    await goToPage(h, "notifications"); await wait(500);
    await seedCapture(h, "seedNotifications"); await wait(500);
    const clickedUnread = await h.evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll(".notifications-filter-bar button, .d-seg button"));
      const u = btns.find(b => /unread/i.test(b.textContent));
      if(u){u.click();return true;} return false;
    })()`);
    await wait(400);
    await shot(h, "notifications-unread-light", { layout:"rail", theme:"light", page:"notifications", notes:`unread=${clickedUnread}` });

    // ── Plugins ────────────────────────────────────────────────────────────
    console.log("=== Plugins ===");
    await applySettings(h, "rail", "light");
    await goToPage(h, "plugins"); await wait(600);
    await seedCapture(h, "seedPlugins"); await wait(500);
    const plgOk = await verifyPage(h, "plugins-page");
    await shot(h, "plugins-light-rail", { layout:"rail", theme:"light", page:"plugins", notes:`plgOk=${plgOk}` });

    await applySettings(h, "rail", "dark");
    await goToPage(h, "plugins"); await wait(500);
    await seedCapture(h, "seedPlugins"); await wait(500);
    await shot(h, "plugins-dark-rail", { layout:"rail", theme:"dark", page:"plugins" });

    await applySettings(h, "island", "light");
    await goToPage(h, "plugins"); await wait(500);
    await seedCapture(h, "seedPlugins"); await wait(500);
    await shot(h, "plugins-light-island", { layout:"island", theme:"light", page:"plugins" });

    // Plugins: Market tab
    await applySettings(h, "rail", "light");
    await goToPage(h, "plugins"); await wait(500);
    await seedCapture(h, "seedPlugins"); await wait(500);
    const clickedMarket = await h.evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const m = btns.find(b => /market/i.test(b.textContent));
      if(m){m.click();return true;} return false;
    })()`);
    await wait(400);
    await shot(h, "plugins-market-light", { layout:"rail", theme:"light", page:"plugins", notes:`market=${clickedMarket}` });

    // ── Projects ───────────────────────────────────────────────────────────
    console.log("=== Projects ===");
    await applySettings(h, "rail", "light");
    await goToPage(h, "projects"); await wait(600);
    const projOk = await verifyPage(h, "projects-page");
    await shot(h, "projects-light-rail", { layout:"rail", theme:"light", page:"projects", notes:`projOk=${projOk}` });

    await applySettings(h, "rail", "dark");
    await goToPage(h, "projects"); await wait(500);
    await shot(h, "projects-dark-rail", { layout:"rail", theme:"dark", page:"projects" });

    await applySettings(h, "island", "light");
    await goToPage(h, "projects"); await wait(500);
    await shot(h, "projects-light-island", { layout:"island", theme:"light", page:"projects" });

    // ── Settings ───────────────────────────────────────────────────────────
    console.log("=== Settings ===");
    const navToAI = async () => {
      await h.evaluate(`(() => {
        const nl = document.querySelectorAll(".settings-nav-item, [role=tab]");
        for(const l of nl){ if(/ai/i.test(l.textContent)){l.click();return;} }
        const btns = Array.from(document.querySelectorAll("[data-settings-tab],button"));
        const ai = btns.find(b=>/^ai$/i.test(b.textContent?.trim())||/ai.agents/i.test(b.textContent));
        if(ai) ai.click();
      })()`);
      await wait(600);
    };

    await applySettings(h, "rail", "light");
    await goToPage(h, "settings"); await wait(800);
    await navToAI();
    const clickedAI = await h.evaluate(`document.querySelector(".settings-nav-item.active, [role=tab][aria-selected=true]")?.textContent?.trim() ?? "unknown"`);
    await shot(h, "settings-ai-light-rail", { layout:"rail", theme:"light", page:"settings", notes:`aiTab=${clickedAI}` });

    await applySettings(h, "rail", "dark");
    await goToPage(h, "settings"); await wait(600);
    await navToAI();
    await shot(h, "settings-ai-dark-rail", { layout:"rail", theme:"dark", page:"settings" });

    // Settings: Queue Modes
    await applySettings(h, "rail", "light");
    await goToPage(h, "settings"); await wait(600);
    await navToAI();
    const scrolledQ = await h.evaluate(`(() => { const h=Array.from(document.querySelectorAll("h2,h3,[class*=section-title]")).find(h=>/queue/i.test(h.textContent)); if(h){h.scrollIntoView({behavior:"instant",block:"center"});return true;} return false; })()`);
    await wait(300);
    await shot(h, "settings-queue-modes-light", { layout:"rail", theme:"light", page:"settings", notes:`queueScroll=${scrolledQ}` });

    // Settings: Agent Worktrees
    const scrolledW = await h.evaluate(`(() => { const h=Array.from(document.querySelectorAll("h2,h3,[class*=section-title]")).find(h=>/worktree/i.test(h.textContent)); if(h){h.scrollIntoView({behavior:"instant",block:"center"});return true;} return false; })()`);
    await wait(300);
    await shot(h, "settings-worktrees-light", { layout:"rail", theme:"light", page:"settings", notes:`worktreeScroll=${scrolledW}` });

    // ── Onboarding ─────────────────────────────────────────────────────────
    console.log("=== Onboarding ===");
    const navToOnboarding = async (theme, layout) => {
      await applySettings(h, layout, theme);
      await goToPage(h, "chat"); await wait(500);
      const opened = await h.evaluate(`(() => {
        const btn = document.querySelector('[data-action="onboarding"],[aria-label*="nboarding"],.onboarding-trigger');
        if(btn){btn.click();return "button";}
        const s=window.__PI_DESKTOP__;
        if(s?.setPage){s.setPage("onboarding");return "store";}
        return false;
      })()`);
      await wait(600);
      return opened;
    };

    const ob1 = await navToOnboarding("light", "rail");
    const ob1ok = await verifyPage(h, "onboarding-checklist");
    await shot(h, "onboarding-step1-light-rail", { layout:"rail", theme:"light", page:"onboarding", notes:`opened=${ob1} ok=${ob1ok}` });

    const ob2 = await navToOnboarding("dark", "rail");
    await shot(h, "onboarding-step1-dark-rail", { layout:"rail", theme:"dark", page:"onboarding" });

    const ob3 = await navToOnboarding("light", "island");
    await shot(h, "onboarding-step1-light-island", { layout:"island", theme:"light", page:"onboarding" });

    // Onboarding step 3 (permissions)
    await navToOnboarding("light", "rail");
    const adv3 = await h.evaluate(`(async() => {
      const s=window.__PI_DESKTOP__;
      if(!s) return false;
      if(s.setState){s.setState({onboardingStep:3});return "setState";}
      const nxt=Array.from(document.querySelectorAll("button")).filter(b=>/next|continue/i.test(b.textContent));
      if(nxt.length){nxt[0].click();await new Promise(r=>setTimeout(r,300));nxt[0].click();return "clicked";}
      return false;
    })()`);
    await wait(600);
    await shot(h, "onboarding-step3-light-rail", { layout:"rail", theme:"light", page:"onboarding", notes:`adv=${adv3}` });

    // Onboarding ready screen (step 4)
    const adv4 = await h.evaluate(`(async() => {
      const s=window.__PI_DESKTOP__;
      if(s?.setState){s.setState({onboardingStep:4});return "setState";}
      return false;
    })()`);
    await wait(600);
    await shot(h, "onboarding-ready-light-rail", { layout:"rail", theme:"light", page:"onboarding", notes:`adv=${adv4}` });

    // ── Verify all written ─────────────────────────────────────────────────
    console.log("=== ALL CAPTURES DONE ===");
    const ALL_SHOTS = [
      "kanban-light-rail","kanban-dark-rail","kanban-light-island","kanban-drawer-light",
      "scheduled-light-rail","scheduled-dark-rail","scheduled-light-island","scheduled-detail-light",
      "pulls-light-rail","pulls-dark-rail","pulls-light-island","pulls-detail-light",
      "notifications-light-rail","notifications-dark-rail","notifications-light-island","notifications-unread-light",
      "plugins-light-rail","plugins-dark-rail","plugins-light-island","plugins-market-light",
      "projects-light-rail","projects-dark-rail","projects-light-island",
      "settings-ai-light-rail","settings-ai-dark-rail","settings-queue-modes-light","settings-worktrees-light",
      "onboarding-step1-light-rail","onboarding-step1-dark-rail","onboarding-step1-light-island",
      "onboarding-step3-light-rail","onboarding-ready-light-rail",
    ];
    const missing = [];
    for (const name of ALL_SHOTS) {
      try { await stat(`${OUT_DIR}/${name}.png`); } catch { missing.push(name); }
    }
    console.log(`Written: ${ALL_SHOTS.length - missing.length}/${ALL_SHOTS.length}`);
    if (missing.length) console.warn("Missing:", missing.join(", "));

    return { shots: ALL_SHOTS.length, missing, outDir: OUT_DIR };

  } finally {
    h.close();
  }
}
