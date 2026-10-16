/**
 * H-Gaps capture script — v6
 * Fixes from v5:
 * 1. clickNavLayout now navigates to general settings tab first (drive.mjs fix)
 * 2. seedVisualState() used for sessions (client-side fixture) so palette shows
 *    sessions even when search backend fails — avoids "Search failed" message.
 *    seedVisualState also sets userInitials:"JK" (renderer-api.ts fix).
 * 3. seedNotifications(3) called correctly for bell badge.
 * 4. seedOnboardingChecklist() re-called before each onboarding shot batch.
 * 5. setLayout loop handles settings tab navigation correctly.
 */

import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const WT = "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-t14h-gaps";
const HSHOTS = `${WT}/.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/H-gaps`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function runHGapsCapture({ browser }) {
  await mkdir(HSHOTS, { recursive: true });

  process.env.FCODE_WORKTREE = WT;
  const { launch } = await import(
    `${WT}/.superpowers/sdd/2026-10-12-direction-d-desk-workbench/tools/drive.mjs?t=${Date.now()}`
  );

  console.log("[hgaps] Launching Electron…");
  const h = await launch({ browser, name: "hgaps-v6" });
  console.log("[hgaps] App ready.");

  // 1. Enable capture rig
  await h.evalPage(`window.__PI_CAPTURE__ = 1`);
  await sleep(300);

  // 2. Seed visual state (sessions, userInitials "JK", kanban/raven) — client-side, no IPC
  //    This also clears onboarding; re-seeded per group below.
  await h.evalPage(`window.__PI_DESKTOP__?.seedVisualState?.()`);
  await sleep(400);

  // 3. Seed bench status (needs __PI_CAPTURE__)
  await h.evalPage(`window.__PI_DESKTOP__?.seedBenchStatus?.()`);
  await sleep(400);

  // 4. Seed notifications — 3 unread for bell badge (needs __PI_CAPTURE__)
  await h.evalPage(`window.__PI_DESKTOP__?.seedNotifications?.(3)`);
  await sleep(400);

  // 5. Seed command palette benches (needs __PI_CAPTURE__)
  await h.evalPage(`window.__PI_DESKTOP__?.seedCommandPaletteExtras?.()`);
  await sleep(300);

  // 6. Seed onboarding checklist (needs __PI_CAPTURE__)
  await h.evalPage(`window.__PI_DESKTOP__?.seedOnboardingChecklist?.()`);
  await sleep(300);

  // Helpers
  const setTheme = async (theme) => {
    await h.evalPage(`window.__PI_DESKTOP__?.setThemeAttr?.(${JSON.stringify(theme)})`);
    await sleep(350);
  };

  /**
   * clickNavLayout navigates to settings/general, clicks the layout picker, returns to chat.
   * Persists to disk via real settings save path.
   * drive.mjs now ensures general tab is shown before clicking.
   */
  const setLayout = async (layout) => {
    console.log(`[hgaps] Layout → ${layout}`);
    await h.clickNavLayout(layout);
    const s = await h.rootState();
    console.log(`[hgaps]   navLayout=${s.dataNavLayout} theme=${s.dataTheme} persisted=${s.persistedNavLayout}`);
    if (s.dataNavLayout !== layout) {
      // Fallback: volatile store set (non-persisted but visible)
      await h.evalPage(`window.__PI_DESKTOP__?.setNavLayout?.(${JSON.stringify(layout)})`);
      await sleep(500);
      const s2 = await h.rootState();
      if (s2.dataNavLayout !== layout) throw new Error(`Layout stuck at ${s2.dataNavLayout}, expected ${layout}`);
    }
  };

  const goTo = async (page, ms = 450) => {
    await h.evalPage(`window.__PI_DESKTOP__?.setPage?.(${JSON.stringify(page)})`);
    await sleep(ms);
  };

  const goToSettingsTab = async (tabId) => {
    await goTo("settings", 400);
    await h.evalPage(`window.__PI_DESKTOP__?.setSettingsTab?.(${JSON.stringify(tabId)})`);
    await sleep(600);
  };

  /** Re-seed everything after a layout/page navigation to keep header cluster intact. */
  const reSeed = async () => {
    await h.evalPage(`window.__PI_DESKTOP__?.seedBenchStatus?.()`);
    await sleep(200);
    await h.evalPage(`window.__PI_DESKTOP__?.seedNotifications?.(3)`);
    await sleep(200);
  };

  const shot = async (name) => {
    // Hide backend banners (not page content)
    await h.evalPage(
      `document.querySelectorAll('.backend-banner,.backend-warning').forEach(function(el){ el.style.setProperty('display','none','important'); })`
    );
    await sleep(150);
    // Re-seed bench/notifications after banner hide
    await reSeed();
    const path = `${HSHOTS}/${name}.png`;
    await h.screenshot(path);
    if (!existsSync(path)) throw new Error(`Shot not saved: ${path}`);
    console.log(`[shot] ${name} ✓`);
  };

  const openPalette = async (query) => {
    await h.evalPage(
      `document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}))`
    );
    await sleep(700);
    await h.evalPage(`(function(){
      var input = document.querySelector('.search-input');
      if (!input) return;
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input',{bubbles:true}));
    })()`);
    await sleep(600);
    const isOpen = await h.evalPage(`!!document.querySelector('.search-input')`);
    if (!isOpen) console.warn("[hgaps] WARNING: palette not open");
  };

  const closePalette = async () => {
    await h.evalPage(
      `(document.querySelector('.search-input')??document).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`
    );
    await sleep(350);
  };

  // Start in tabs layout, light theme
  await setLayout("tabs");
  await setTheme("light");
  await sleep(300);

  // ── COMMAND PALETTE D1/D2/D3 × light/dark ───────────────────────────────
  console.log("[hgaps] === COMMAND PALETTE ===");
  for (const [layout, code] of [["tabs","D1"],["rail","D2"],["island","D3"]]) {
    await setLayout(layout);
    await goTo("chat", 400);
    // Re-seed so sessions + bench status are fresh for this layout iteration
    await h.evalPage(`window.__PI_DESKTOP__?.seedVisualState?.()`);
    await sleep(300);
    await h.evalPage(`window.__PI_DESKTOP__?.seedBenchStatus?.()`);
    await sleep(200);
    await h.evalPage(`window.__PI_DESKTOP__?.seedNotifications?.(3)`);
    await sleep(200);
    await h.evalPage(`window.__PI_DESKTOP__?.seedCommandPaletteExtras?.()`);
    await sleep(200);

    await setTheme("light");
    await openPalette("migrate");
    await shot(`d-cmdpal-${code}-light`);
    await closePalette();

    await setTheme("dark");
    await openPalette("migrate");
    await shot(`d-cmdpal-${code}-dark`);
    await closePalette();

    await setTheme("light");
  }

  // ── ONBOARDING STEP 1 D1/D2/D3 × light/dark ────────────────────────────
  console.log("[hgaps] === ONBOARDING ===");
  for (const [layout, code] of [["tabs","D1"],["rail","D2"],["island","D3"]]) {
    await setLayout(layout);
    await goTo("chat", 400);
    // Seed header cluster (bench chip, initials "JK") WITHOUT sessions — first-run
    // onboarding state shows Sessions=0 (empty panel) matching reference design.
    await h.evalPage(`window.__PI_DESKTOP__?.seedHeaderCluster?.()`);
    await sleep(300);
    // seedHeaderCluster clears onboarding; re-seed it
    await h.evalPage(`window.__PI_DESKTOP__?.seedOnboardingChecklist?.()`);
    await sleep(300);
    await h.evalPage(`window.__PI_DESKTOP__?.seedBenchStatus?.()`);
    await sleep(200);
    await h.evalPage(`window.__PI_DESKTOP__?.seedNotifications?.(3)`);
    await sleep(200);

    await setTheme("light");
    await shot(`d-onboarding-step1-${code}-light`);

    await setTheme("dark");
    await shot(`d-onboarding-step1-${code}-dark`);

    await setTheme("light");
  }

  // ── SETTINGS-AI D1/D2/D3 × light/dark ──────────────────────────────────
  console.log("[hgaps] === SETTINGS-AI ===");
  for (const [layout, code] of [["tabs","D1"],["rail","D2"],["island","D3"]]) {
    await setLayout(layout);  // goes to general settings first, clicks picker, returns to chat
    await goToSettingsTab("aiAgents");
    await reSeed();

    await setTheme("light");
    await shot(`d-settings-ai-${code}-light`);

    await setTheme("dark");
    await shot(`d-settings-ai-${code}-dark`);

    await setTheme("light");
  }

  // ── SETTINGS-ADVANCED D1/D2/D3 × light/dark ─────────────────────────────
  console.log("[hgaps] === SETTINGS-ADVANCED ===");
  for (const [layout, code] of [["tabs","D1"],["rail","D2"],["island","D3"]]) {
    await setLayout(layout);
    await goToSettingsTab("ompAdvanced");
    await reSeed();

    await setTheme("light");
    await shot(`d-settings-advanced-${code}-light`);

    await setTheme("dark");
    await shot(`d-settings-advanced-${code}-dark`);

    await setTheme("light");
  }

  // ── SETTINGS-PERMISSIONS D1/D2/D3 × light/dark ──────────────────────────
  console.log("[hgaps] === SETTINGS-PERMISSIONS ===");
  for (const [layout, code] of [["tabs","D1"],["rail","D2"],["island","D3"]]) {
    await setLayout(layout);
    await goToSettingsTab("ai");
    await reSeed();

    await setTheme("light");
    await shot(`d-settings-permissions-${code}-light`);

    await setTheme("dark");
    await shot(`d-settings-permissions-${code}-dark`);

    await setTheme("light");
  }

  // ── FILEBIRD unavailable + connected D1 × light/dark ────────────────────
  console.log("[hgaps] === FILEBIRD ===");
  await setLayout("tabs");
  await goTo("filebird", 1200);
  await reSeed();

  await setTheme("light");
  await shot("d-filebird-unavailable-D1-light");
  await setTheme("dark");
  await shot("d-filebird-unavailable-D1-dark");
  await setTheme("light");

  // Mock invoke for "connected" state
  await h.evalPage(`(function(){
    var pd = window.piDesktop;
    if (!pd || !pd.invoke) return;
    var orig = pd.invoke.bind(pd);
    pd.invoke = function(ch){ if (typeof ch === 'string' && ch.indexOf('fileBird') >= 0) return Promise.resolve({ ok: true }); return orig.apply(pd, arguments); };
  })()`);
  await sleep(200);
  await goTo("chat", 300);
  await goTo("filebird", 1500);
  await reSeed();

  await setTheme("light");
  await shot("d-filebird-connected-D1-light");
  await setTheme("dark");
  await shot("d-filebird-connected-D1-dark");
  await setTheme("light");

  console.log("[hgaps] All 34 shots done.");
  await h.close();
  return HSHOTS;
}
