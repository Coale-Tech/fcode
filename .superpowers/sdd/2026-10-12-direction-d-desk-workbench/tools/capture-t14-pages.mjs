/**
 * capture-t14-pages.mjs — T14 pages surface capture rig
 *
 * USAGE (from eval cell):
 *   const { run } = await import('.../capture-t14-pages.mjs?v=1');
 *   await run({ browser });
 *
 * Captures all owned pages:
 *   kanban, scheduled (+ run history), pulls, notifications,
 *   plugins, projects, settings (AI section), onboarding steps 1-4
 *
 * Each PNG gets a .json provenance sidecar.
 */

import { launch } from "./drive.mjs";
import { writeFile, mkdir } from "node:fs/promises";

const WORKTREE = "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-t14-pages";
const OUT_DIR = `${WORKTREE}/.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/T14`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function prov(h, { layout, theme, page, commit, notes = "" }) {
  const state = await h.rootState();
  // Read settings from store directly (no IPC to avoid tab release)
  const savedSettings = await h.tab.evaluate(
    `(() => { try { const s = window.__PI_DESKTOP__; const st = s && typeof s.getState === 'function' ? s.getState() : null; return st?.settings ?? null; } catch { return null; } })()`
  );
  return {
    commit,
    buildTime: new Date().toISOString(),
    viewport: `${state.innerWidth}×${Math.round(state.innerWidth * 0.667)}`,
    DPR: state.devicePixelRatio,
    savedNavLayout: savedSettings?.navLayout ?? null,
    savedTheme: savedSettings?.theme ?? null,
    dataNavLayout: state.dataNavLayout,
    dataTheme: state.dataTheme,
    persistedNavLayout: state.persistedNavLayout,
    pageId: page,
    layout,
    theme,
    notes,
  };
}

async function shot(h, name, { layout, theme, page, commit, notes = "" }) {
  const p = await prov(h, { layout, theme, page, commit, notes });
  await h.screenshot(`${OUT_DIR}/${name}.png`);
  await writeFile(`${OUT_DIR}/${name}.json`, JSON.stringify(p, null, 2));
  return p;
}

async function applySettings(h, layout, theme) {
  // Use window.__PI_DESKTOP__.setNavLayout / setTheme directly — these update
  // the Zustand store + DOM attribute without any IPC call or page reload,
  // so the managed tab never navigates and is never released.
  await h.tab.evaluate(`
    (() => {
      const d = window.__PI_DESKTOP__;
      if (d) {
        d.setNavLayout(${JSON.stringify(layout)});
        d.setTheme(${JSON.stringify(theme)});
      } else {
        document.documentElement.dataset.navLayout = ${JSON.stringify(layout)};
        document.documentElement.dataset.theme = ${JSON.stringify(theme)};
      }
    })()
  `);
  await wait(300);
  // Verify
  const s = await h.rootState();
  if (s.dataNavLayout !== layout || s.dataTheme !== theme) {
    // Retry once with explicit DOM overwrite
    await h.tab.evaluate(`
      document.documentElement.dataset.navLayout = ${JSON.stringify(layout)};
      document.documentElement.dataset.theme = ${JSON.stringify(theme)};
    `);
    await wait(200);
  }
}

async function seedCapture(h, method, ...args) {
  // __PI_DESKTOP__ exposes capture-rig stubs when __PI_CAPTURE__ is set
  return h.tab.evaluate(
    `(async () => {
       const d = window.__PI_DESKTOP__;
       if (!d) return null;
       // Rig stubs are callable directly on the surface object
       if (typeof d.${method} === 'function') return d.${method}(${args.map(a => JSON.stringify(a)).join(",")});
       // Fallback: raw rig object
       const r = window.__PI_CAPTURE_RIG__;
       if (r && typeof r.${method} === 'function') return r.${method}(${args.map(a => JSON.stringify(a)).join(",")});
       return null;
     })()`
  );
}

async function enableCapture(h) {
  await h.tab.evaluate(`window.__PI_CAPTURE__ = 1`);
}

async function verifyPage(h, pageClass) {
  const found = await h.tab.evaluate(`!!document.querySelector('.${pageClass}')`);
  if (!found) {
    const classes = await h.tab.evaluate(`Array.from(document.querySelectorAll('[class*="page"]')).map(e=>e.className).join(',')`);
    console.warn(`verifyPage: .${pageClass} NOT FOUND. Classes found: ${classes.slice(0,200)}`);
  }
  return found;
}

export async function run({ browser, commit = "463888dee" } = {}) {
  await mkdir(OUT_DIR, { recursive: true });

  const h = await launch({ browser, name: "pi-desktop-t14-pages" });
  try {
    await enableCapture(h);
    await h.evalPage(`window.__PI_DESKTOP_CAPTURE__ = 1`);

    // ── Kanban ──────────────────────────────────────────────────────────────
    console.log("=== Kanban ===");
    await applySettings(h, "rail", "light");
    await h.goToPage("kanban");
    await wait(600);
    await seedCapture(h, "seedKanbanBoard");
    await wait(600);
    const kanbanOk = await verifyPage(h, "kanban-page");
    console.log("kanban page verified:", kanbanOk);

    const pk1 = await shot(h, "kanban-light-rail", { layout: "rail", theme: "light", page: "kanban", commit, notes: `kanbanPageFound=${kanbanOk}` });
    console.log("kanban-light-rail:", pk1.dataNavLayout, pk1.dataTheme);

    await applySettings(h, "rail", "dark");
    await h.goToPage("kanban");
    await wait(500);
    await seedCapture(h, "seedKanbanBoard");
    await wait(500);
    const pk2 = await shot(h, "kanban-dark-rail", { layout: "rail", theme: "dark", page: "kanban", commit });
    console.log("kanban-dark-rail:", pk2.dataNavLayout, pk2.dataTheme);

    await applySettings(h, "island", "light");
    await h.goToPage("kanban");
    await wait(500);
    await seedCapture(h, "seedKanbanBoard");
    await wait(500);
    const pk3 = await shot(h, "kanban-light-island", { layout: "island", theme: "light", page: "kanban", commit });
    console.log("kanban-light-island:", pk3.dataNavLayout, pk3.dataTheme);

    // Kanban: open drawer (click a running card)
    await applySettings(h, "rail", "light");
    await h.goToPage("kanban");
    await wait(500);
    await seedCapture(h, "seedKanbanBoard");
    await wait(500);
    const clickedCard = await h.tab.evaluate(`
      (() => {
        const runningCols = document.querySelectorAll('[data-column="running"] .kanban-card');
        if (runningCols.length > 0) { runningCols[0].click(); return true; }
        const anyCard = document.querySelector('.kanban-card');
        if (anyCard) { anyCard.click(); return 'any'; }
        return false;
      })()
    `);
    await wait(500);
    const drawerOpen = await h.tab.evaluate(`!!document.querySelector('.kanban-drawer')`);
    const pk4 = await shot(h, "kanban-drawer-light", { layout: "rail", theme: "light", page: "kanban", commit, notes: `drawerOpen=${drawerOpen} clickedCard=${clickedCard}` });
    console.log("kanban-drawer:", drawerOpen, clickedCard);

    // ── Scheduled ───────────────────────────────────────────────────────────
    console.log("=== Scheduled ===");
    await applySettings(h, "rail", "light");
    await h.goToPage("scheduled");
    await wait(600);
    await seedCapture(h, "seedScheduledTasks");
    await wait(600);
    const schedOk = await verifyPage(h, "scheduled-page");
    console.log("scheduled page verified:", schedOk);

    const ps1 = await shot(h, "scheduled-light-rail", { layout: "rail", theme: "light", page: "scheduled", commit, notes: `schedPageFound=${schedOk}` });
    console.log("scheduled-light-rail:", ps1.dataNavLayout, ps1.dataTheme);

    await applySettings(h, "rail", "dark");
    await h.goToPage("scheduled");
    await wait(500);
    await seedCapture(h, "seedScheduledTasks");
    await wait(500);
    const ps2 = await shot(h, "scheduled-dark-rail", { layout: "rail", theme: "dark", page: "scheduled", commit });
    console.log("scheduled-dark-rail:", ps2.dataTheme);

    await applySettings(h, "island", "light");
    await h.goToPage("scheduled");
    await wait(500);
    await seedCapture(h, "seedScheduledTasks");
    await wait(500);
    const ps3 = await shot(h, "scheduled-light-island", { layout: "island", theme: "light", page: "scheduled", commit });
    console.log("scheduled-light-island:", ps3.dataNavLayout);

    // Scheduled: click a task to open detail panel
    await applySettings(h, "rail", "light");
    await h.goToPage("scheduled");
    await wait(500);
    await seedCapture(h, "seedScheduledTasks");
    await wait(500);
    const clickedRow = await h.tab.evaluate(`
      (() => {
        const row = document.querySelector('.dest-row, .sch-row, .scheduled-row');
        if (row) { row.click(); return true; }
        return false;
      })()
    `);
    await wait(500);
    const detailOpen = await h.tab.evaluate(`!!document.querySelector('.sch-detail, .scheduled-detail')`);
    const ps4 = await shot(h, "scheduled-detail-light", { layout: "rail", theme: "light", page: "scheduled", commit, notes: `detailOpen=${detailOpen} clickedRow=${clickedRow}` });
    console.log("scheduled-detail:", detailOpen, clickedRow);

    // ── Pull Requests ────────────────────────────────────────────────────────
    console.log("=== Pull Requests ===");
    await applySettings(h, "rail", "light");
    await h.goToPage("pulls");
    await wait(600);
    await seedCapture(h, "seedPullRequests");
    await wait(600);
    const pullsOk = await verifyPage(h, "pulls-page");
    console.log("pulls page verified:", pullsOk);

    const pp1 = await shot(h, "pulls-light-rail", { layout: "rail", theme: "light", page: "pulls", commit, notes: `pullsPageFound=${pullsOk}` });
    console.log("pulls-light-rail:", pp1.dataNavLayout, pp1.dataTheme);

    await applySettings(h, "rail", "dark");
    await h.goToPage("pulls");
    await wait(500);
    await seedCapture(h, "seedPullRequests");
    await wait(500);
    const pp2 = await shot(h, "pulls-dark-rail", { layout: "rail", theme: "dark", page: "pulls", commit });
    console.log("pulls-dark-rail:", pp2.dataTheme);

    await applySettings(h, "island", "light");
    await h.goToPage("pulls");
    await wait(500);
    await seedCapture(h, "seedPullRequests");
    await wait(500);
    const pp3 = await shot(h, "pulls-light-island", { layout: "island", theme: "light", page: "pulls", commit });
    console.log("pulls-light-island:", pp3.dataNavLayout);

    // PR detail panel
    await applySettings(h, "rail", "light");
    await h.goToPage("pulls");
    await wait(500);
    await seedCapture(h, "seedPullRequests");
    await wait(500);
    const clickedPR = await h.tab.evaluate(`
      (() => {
        const row = document.querySelector('.pr-row, .dest-row');
        if (row) { row.click(); return true; }
        return false;
      })()
    `);
    await wait(500);
    const prDetailOpen = await h.tab.evaluate(`!!document.querySelector('.pr-detail, .dest-detail')`);
    const pp4 = await shot(h, "pulls-detail-light", { layout: "rail", theme: "light", page: "pulls", commit, notes: `prDetailOpen=${prDetailOpen} clickedPR=${clickedPR}` });
    console.log("pulls-detail:", prDetailOpen, clickedPR);

    // ── Notifications ────────────────────────────────────────────────────────
    console.log("=== Notifications ===");
    await applySettings(h, "rail", "light");
    await h.goToPage("notifications");
    await wait(600);
    await seedCapture(h, "seedNotifications");
    await wait(600);
    const notifOk = await verifyPage(h, "notifications-page");
    console.log("notifications page verified:", notifOk);

    const pn1 = await shot(h, "notifications-light-rail", { layout: "rail", theme: "light", page: "notifications", commit, notes: `notifPageFound=${notifOk}` });
    console.log("notifications-light-rail:", pn1.dataNavLayout, pn1.dataTheme);

    await applySettings(h, "rail", "dark");
    await h.goToPage("notifications");
    await wait(500);
    await seedCapture(h, "seedNotifications");
    await wait(500);
    const pn2 = await shot(h, "notifications-dark-rail", { layout: "rail", theme: "dark", page: "notifications", commit });
    console.log("notifications-dark-rail:", pn2.dataTheme);

    await applySettings(h, "island", "light");
    await h.goToPage("notifications");
    await wait(500);
    await seedCapture(h, "seedNotifications");
    await wait(500);
    const pn3 = await shot(h, "notifications-light-island", { layout: "island", theme: "light", page: "notifications", commit });
    console.log("notifications-light-island:", pn3.dataNavLayout);

    // Notifications: click Unread filter
    await applySettings(h, "rail", "light");
    await h.goToPage("notifications");
    await wait(500);
    await seedCapture(h, "seedNotifications");
    await wait(500);
    const clickedUnread = await h.tab.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('.notifications-filter-bar button, .d-seg button'));
        const unread = btns.find(b => /unread/i.test(b.textContent));
        if (unread) { unread.click(); return true; }
        return false;
      })()
    `);
    await wait(400);
    const pn4 = await shot(h, "notifications-unread-light", { layout: "rail", theme: "light", page: "notifications", commit, notes: `unreadFilter=${clickedUnread}` });
    console.log("notifications-unread:", clickedUnread);

    // ── Plugins ──────────────────────────────────────────────────────────────
    console.log("=== Plugins ===");
    await applySettings(h, "rail", "light");
    await h.goToPage("plugins");
    await wait(600);
    await seedCapture(h, "seedPlugins");
    await wait(500);
    const plgOk = await verifyPage(h, "plugins-page");
    console.log("plugins page verified:", plgOk);

    const pl1 = await shot(h, "plugins-light-rail", { layout: "rail", theme: "light", page: "plugins", commit, notes: `plgPageFound=${plgOk}` });
    console.log("plugins-light-rail:", pl1.dataNavLayout, pl1.dataTheme);

    await applySettings(h, "rail", "dark");
    await h.goToPage("plugins");
    await wait(500);
    await seedCapture(h, "seedPlugins");
    await wait(500);
    const pl2 = await shot(h, "plugins-dark-rail", { layout: "rail", theme: "dark", page: "plugins", commit });
    console.log("plugins-dark-rail:", pl2.dataTheme);

    await applySettings(h, "island", "light");
    await h.goToPage("plugins");
    await wait(500);
    await seedCapture(h, "seedPlugins");
    await wait(500);
    const pl3 = await shot(h, "plugins-light-island", { layout: "island", theme: "light", page: "plugins", commit });
    console.log("plugins-light-island:", pl3.dataNavLayout);

    // Plugins: click Market tab
    await applySettings(h, "rail", "light");
    await h.goToPage("plugins");
    await wait(500);
    await seedCapture(h, "seedPlugins");
    await wait(500);
    const clickedMarket = await h.tab.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const market = btns.find(b => /market/i.test(b.textContent));
        if (market) { market.click(); return true; }
        return false;
      })()
    `);
    await wait(400);
    const pl4 = await shot(h, "plugins-market-light", { layout: "rail", theme: "light", page: "plugins", commit, notes: `marketTabClicked=${clickedMarket}` });
    console.log("plugins-market:", clickedMarket);

    // ── Projects ─────────────────────────────────────────────────────────────
    console.log("=== Projects ===");
    await applySettings(h, "rail", "light");
    await h.goToPage("projects");
    await wait(600);
    const projOk = await verifyPage(h, "projects-page");
    console.log("projects page verified:", projOk);

    const prj1 = await shot(h, "projects-light-rail", { layout: "rail", theme: "light", page: "projects", commit, notes: `projPageFound=${projOk}` });
    console.log("projects-light-rail:", prj1.dataNavLayout, prj1.dataTheme);

    await applySettings(h, "rail", "dark");
    await h.goToPage("projects");
    await wait(500);
    const prj2 = await shot(h, "projects-dark-rail", { layout: "rail", theme: "dark", page: "projects", commit });
    console.log("projects-dark-rail:", prj2.dataTheme);

    await applySettings(h, "island", "light");
    await h.goToPage("projects");
    await wait(500);
    const prj3 = await shot(h, "projects-light-island", { layout: "island", theme: "light", page: "projects", commit });
    console.log("projects-light-island:", prj3.dataNavLayout);

    // ── Settings (AI section) ────────────────────────────────────────────────
    console.log("=== Settings ===");
    await applySettings(h, "rail", "light");
    await h.goToPage("settings");
    await wait(800);
    // Navigate to AI section
    const clickedAI = await h.tab.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('[data-settings-tab], [data-section], button'));
        const ai = btns.find(b => /^ai$/i.test(b.textContent?.trim()) || /ai.agents/i.test(b.textContent));
        if (ai) { ai.click(); return ai.textContent?.trim(); }
        // Try clicking settings nav for "AI Agents"
        const navLinks = document.querySelectorAll('.settings-nav-item, [role="tab"]');
        for (const l of navLinks) {
          if (/ai/i.test(l.textContent)) { l.click(); return 'nav:' + l.textContent?.trim(); }
        }
        return false;
      })()
    `);
    await wait(600);
    const set1 = await shot(h, "settings-ai-light-rail", { layout: "rail", theme: "light", page: "settings", commit, notes: `clickedAI=${clickedAI}` });
    console.log("settings-ai-light-rail:", set1.dataNavLayout, set1.dataTheme, "ai:", clickedAI);

    await applySettings(h, "rail", "dark");
    await h.goToPage("settings");
    await wait(600);
    await h.tab.evaluate(`
      (() => {
        const navLinks = document.querySelectorAll('.settings-nav-item, [role="tab"]');
        for (const l of navLinks) {
          if (/ai/i.test(l.textContent)) { l.click(); break; }
        }
      })()
    `);
    await wait(600);
    const set2 = await shot(h, "settings-ai-dark-rail", { layout: "rail", theme: "dark", page: "settings", commit });
    console.log("settings-ai-dark-rail:", set2.dataTheme);

    // Settings: scroll to Queue Modes (badge 4)
    await applySettings(h, "rail", "light");
    await h.goToPage("settings");
    await wait(600);
    await h.tab.evaluate(`
      (() => {
        const navLinks = document.querySelectorAll('.settings-nav-item, [role="tab"]');
        for (const l of navLinks) {
          if (/ai/i.test(l.textContent)) { l.click(); break; }
        }
      })()
    `);
    await wait(500);
    const scrolledToQueue = await h.tab.evaluate(`
      (() => {
        const heading = Array.from(document.querySelectorAll('h2, h3, [class*="section-title"]'))
          .find(h => /queue/i.test(h.textContent));
        if (heading) { heading.scrollIntoView({ behavior: 'instant', block: 'center' }); return true; }
        return false;
      })()
    `);
    await wait(300);
    const set3 = await shot(h, "settings-queue-modes-light", { layout: "rail", theme: "light", page: "settings", commit, notes: `scrolledToQueue=${scrolledToQueue}` });
    console.log("settings-queue-modes:", scrolledToQueue);

    // Settings: scroll to Agent Worktrees (badge 3)
    const scrolledToWorktrees = await h.tab.evaluate(`
      (() => {
        const heading = Array.from(document.querySelectorAll('h2, h3, [class*="section-title"]'))
          .find(h => /worktree/i.test(h.textContent));
        if (heading) { heading.scrollIntoView({ behavior: 'instant', block: 'center' }); return true; }
        return false;
      })()
    `);
    await wait(300);
    const set4 = await shot(h, "settings-worktrees-light", { layout: "rail", theme: "light", page: "settings", commit, notes: `scrolledToWorktrees=${scrolledToWorktrees}` });
    console.log("settings-worktrees:", scrolledToWorktrees);

    // ── Onboarding ───────────────────────────────────────────────────────────
    console.log("=== Onboarding ===");
    // Navigate to onboarding by opening the checklist
    const navToOnboarding = async (theme, layout) => {
      await applySettings(h, layout, theme);
      await h.goToPage("chat");
      await wait(500);
      // Click the onboarding/setup button or navigate directly
      const opened = await h.tab.evaluate(`
        (() => {
          // Try dedicated onboarding button
          const btn = document.querySelector('[data-action="onboarding"], [aria-label*="nboarding"], .onboarding-trigger');
          if (btn) { btn.click(); return 'button'; }
          // Try store navigation
          const s = window.__PI_DESKTOP__;
          if (s?.setPage) { s.setPage('onboarding'); return 'store'; }
          return false;
        })()
      `);
      await wait(600);
      return opened;
    };

    // Step 1: light rail
    const ob1open = await navToOnboarding("light", "rail");
    const ob1ok = await verifyPage(h, "onboarding-checklist");
    const po1 = await shot(h, "onboarding-step1-light-rail", { layout: "rail", theme: "light", page: "onboarding", commit, notes: `opened=${ob1open} pageFound=${ob1ok}` });
    console.log("onboarding-step1-light-rail:", po1.dataNavLayout, po1.dataTheme, ob1open);

    // Step 1: dark rail
    const ob2open = await navToOnboarding("dark", "rail");
    const po2 = await shot(h, "onboarding-step1-dark-rail", { layout: "rail", theme: "dark", page: "onboarding", commit, notes: `opened=${ob2open}` });
    console.log("onboarding-step1-dark-rail:", po2.dataTheme);

    // Step 1: island light
    const ob3open = await navToOnboarding("light", "island");
    const po3 = await shot(h, "onboarding-step1-light-island", { layout: "island", theme: "light", page: "onboarding", commit, notes: `opened=${ob3open}` });
    console.log("onboarding-step1-island-light:", po3.dataNavLayout);

    // Step 3: advance to step 3 (permissions step)
    await navToOnboarding("light", "rail");
    // Advance to step 3 by clicking through steps
    const advancedToStep3 = await h.tab.evaluate(`
      (async () => {
        const store = window.__PI_DESKTOP__;
        if (!store) return false;
        // Set onboarding step directly in the store
        if (store.setState) {
          store.setState({ onboardingStep: 3 });
          return 'setState';
        }
        // Or click Next buttons
        const nextBtns = Array.from(document.querySelectorAll('button'))
          .filter(b => /next|continue/i.test(b.textContent));
        if (nextBtns.length > 0) {
          nextBtns[0].click();
          await new Promise(r => setTimeout(r, 300));
          nextBtns[0].click();
          return 'clicked-next';
        }
        return false;
      })()
    `);
    await wait(600);
    const po4 = await shot(h, "onboarding-step3-light-rail", { layout: "rail", theme: "light", page: "onboarding", commit, notes: `advancedToStep3=${advancedToStep3}` });
    console.log("onboarding-step3:", advancedToStep3);

    // Step 4 / Ready screen
    const advancedToReady = await h.tab.evaluate(`
      (async () => {
        const store = window.__PI_DESKTOP__;
        if (!store) return false;
        if (store.setState) {
          store.setState({ onboardingStep: 4 });
          return 'setState';
        }
        return false;
      })()
    `);
    await wait(600);
    const po5 = await shot(h, "onboarding-ready-light-rail", { layout: "rail", theme: "light", page: "onboarding", commit, notes: `advancedToReady=${advancedToReady}` });
    console.log("onboarding-ready:", advancedToReady);

    console.log("=== ALL CAPTURES DONE ===");
    const allShots = [
      "kanban-light-rail", "kanban-dark-rail", "kanban-light-island", "kanban-drawer-light",
      "scheduled-light-rail", "scheduled-dark-rail", "scheduled-light-island", "scheduled-detail-light",
      "pulls-light-rail", "pulls-dark-rail", "pulls-light-island", "pulls-detail-light",
      "notifications-light-rail", "notifications-dark-rail", "notifications-light-island", "notifications-unread-light",
      "plugins-light-rail", "plugins-dark-rail", "plugins-light-island", "plugins-market-light",
      "projects-light-rail", "projects-dark-rail", "projects-light-island",
      "settings-ai-light-rail", "settings-ai-dark-rail", "settings-queue-modes-light", "settings-worktrees-light",
      "onboarding-step1-light-rail", "onboarding-step1-dark-rail", "onboarding-step1-light-island",
      "onboarding-step3-light-rail", "onboarding-ready-light-rail",
    ];
    console.log(`Total shots: ${allShots.length}`);
    return { shots: allShots, outDir: OUT_DIR };

  } finally {
    await h.close();
  }
}
