/**
 * H-Gaps capture script — run from an eval cell:
 *
 *   const { runHGapsCapture } = await import('.../h-gaps-capture.mjs');
 *   await runHGapsCapture({ browser });
 *
 * Uses drive.mjs launch() with FCODE_WORKTREE pointing at the gaps worktree.
 * Sets window.__PI_CAPTURE__ = 1 via CDP to enable rig methods without
 * building with PI_DESKTOP_CAPTURE env.
 */

import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const WT = "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-t14h-gaps";
const HSHOTS = `${WT}/.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/H-gaps`;
const REFS   = "/Users/mac/.gstack/projects/Coale-Tech-fcode/designs/all-pages-20261012/pages-d";

export async function runHGapsCapture({ browser }) {
  await mkdir(HSHOTS, { recursive: true });

  // Override worktree so drive.mjs uses the gaps branch build.
  process.env.FCODE_WORKTREE = WT;
  const { launch } = await import(
    `${WT}/.superpowers/sdd/2026-10-12-direction-d-desk-workbench/tools/drive.mjs?t=${Date.now()}`
  );

  log("Launching Electron from gaps worktree…");
  const h = await launch({ browser, name: "hgaps3" });
  log("App ready. Enabling capture rig…");

  // Enable rig methods without requiring PI_DESKTOP_CAPTURE env.
  await h.evalPage(`window.__PI_CAPTURE__ = 1`);
  await sleep(200);

  // Seed sessions + kanban/raven toggles.
  await h.evalPage(`window.__PI_DESKTOP__?.ensureVisualFixtures?.()`);
  await sleep(3000); // wait for session creation IPC

  // Seed FILES + BENCHES globals for command palette.
  await h.evalPage(`window.__PI_DESKTOP__?.seedCommandPaletteExtras?.()`);
  await sleep(300);

  // Helpers
  const setTheme = async (theme) => {
    await h.evalPage(`window.__PI_DESKTOP__?.setThemeAttr?.(${JSON.stringify(theme)})`);
    await sleep(250);
  };
  const setLayout = async (layout) => {
    await h.evalPage(`window.__PI_DESKTOP__?.setNavLayout?.(${JSON.stringify(layout)})`);
    await sleep(500);
  };
  const setPage = async (page) => {
    await h.evalPage(`window.__PI_DESKTOP__?.setPage?.(${JSON.stringify(page)})`);
    await sleep(400);
  };
  const setSettingsTab = async (tab) => {
    await h.evalPage(`window.__PI_DESKTOP__?.setSettingsTab?.(${JSON.stringify(tab)})`);
    await sleep(600);
  };
  const shot = async (name) => {
    // Hide backend-unavailable banner and omp-not-found overlay so they don't obscure shots.
    await h.evalPage(
      `document.querySelectorAll('.backend-banner,.backend-warning,.chat-sidecar-fatal').forEach(el => el.style.setProperty('display','none','important'))`
    );
    await sleep(100);
    await h.screenshot(`${HSHOTS}/${name}.png`);
    log(`SHOT ${name}`);
  };

  // Open command palette with Cmd+K via CDP
  const openCmdPal = async () => {
    await h.evalPage(
      `document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}))`
    );
    await sleep(600);
  };
  const typeCmdPal = async (q) => {
    await h.evalPage(`
      (function() {
        const input = document.querySelector('.search-input');
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
        setter.call(input, ${JSON.stringify(q)});
        input.dispatchEvent(new Event('input',{bubbles:true}));
      })()
    `);
    await sleep(500);
  };
  const closeCmdPal = async () => {
    await h.evalPage(
      `(document.querySelector('.search-input')??document).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`
    );
    await sleep(300);
  };

  // ── Command palette D1/D2/D3 × light/dark ──────────────────────────────
  for (const [layout, code] of [["tabs","D1"],["rail","D2"],["island","D3"]]) {
    await setLayout(layout);
    await setPage("chat");
    await sleep(400);
    await setTheme("light");
    await openCmdPal();
    await typeCmdPal("migrate");
    await shot(`d-cmdpal-${code}-light`);
    await closeCmdPal();
    await setTheme("dark");
    await openCmdPal();
    await typeCmdPal("migrate");
    await shot(`d-cmdpal-${code}-dark`);
    await closeCmdPal();
    await setTheme("light");
  }

  // ── Onboarding step 1 D1/D2/D3 × light/dark ───────────────────────────
  await h.evalPage(`window.__PI_DESKTOP__?.seedOnboardingChecklist?.()`);
  await sleep(400);
  for (const [layout, code] of [["tabs","D1"],["rail","D2"],["island","D3"]]) {
    await setLayout(layout);
    await setPage("chat");
    await sleep(500);
    await setTheme("light"); await sleep(200); await shot(`d-onboarding-step1-${code}-light`);
    await setTheme("dark");  await sleep(200); await shot(`d-onboarding-step1-${code}-dark`);
    await setTheme("light");
  }

  // ── Settings-AI (aiAgents tab) D1/D2/D3 × light/dark ──────────────────
  for (const [layout, code] of [["tabs","D1"],["rail","D2"],["island","D3"]]) {
    await setLayout(layout);
    await setPage("settings");
    await setSettingsTab("aiAgents");
    await sleep(400);
    await setTheme("light"); await sleep(200); await shot(`d-settings-ai-${code}-light`);
    await setTheme("dark");  await sleep(200); await shot(`d-settings-ai-${code}-dark`);
    await setTheme("light");
  }

  // ── Settings-Advanced (ompAdvanced tab) D1/D2/D3 × light/dark ──────────
  for (const [layout, code] of [["tabs","D1"],["rail","D2"],["island","D3"]]) {
    await setLayout(layout);
    await setPage("settings");
    await setSettingsTab("ompAdvanced");
    await sleep(400);
    await setTheme("light"); await sleep(200); await shot(`d-settings-advanced-${code}-light`);
    await setTheme("dark");  await sleep(200); await shot(`d-settings-advanced-${code}-dark`);
    await setTheme("light");
  }

  // ── Settings-Permissions (ai tab) D1/D2/D3 × light/dark ──────────────
  for (const [layout, code] of [["tabs","D1"],["rail","D2"],["island","D3"]]) {
    await setLayout(layout);
    await setPage("settings");
    await setSettingsTab("ai");
    await sleep(400);
    await setTheme("light"); await sleep(200); await shot(`d-settings-permissions-${code}-light`);
    await setTheme("dark");  await sleep(200); await shot(`d-settings-permissions-${code}-dark`);
    await setTheme("light");
  }

  // ── FileBird: connected (mock IPC → ok:true) + unavailable (real IPC → ok:false) ─────
  // Mock window.piDesktop.invoke so fileBirdSetVisible returns {ok:true} → !failed state.
  await h.evalPage(`
    (function() {
      const orig = window.piDesktop?.invoke?.bind(window.piDesktop);
      if (!orig) return;
      window.__origPiInvoke = orig;
      window.piDesktop.invoke = function(channel, ...args) {
        if (typeof channel === 'string' && channel.includes('fileBird')) {
          return Promise.resolve({ ok: true });
        }
        return orig(channel, ...args);
      };
    })()
  `);
  await setLayout("tabs");
  await setPage("filebird");
  await sleep(1000);
  await setTheme("light"); await sleep(300); await shot("d-filebird-connected-D1-light");
  await setTheme("dark");  await sleep(300); await shot("d-filebird-connected-D1-dark");
  await setTheme("light");
  // Restore real invoke (IIFE required — bare if is a statement, not expression) → ok:false → unavailable.
  await h.evalPage(`(function() {
    if (window.__origPiInvoke) {
      window.piDesktop.invoke = window.__origPiInvoke;
      delete window.__origPiInvoke;
    }
  })()`);
  await setPage("chat"); await sleep(300);
  await setPage("filebird");
  await sleep(1200);
  await setTheme("light"); await sleep(300); await shot("d-filebird-unavailable-D1-light");
  await setTheme("dark");  await sleep(300); await shot("d-filebird-unavailable-D1-dark");
  await setTheme("light");

  log("All 34 H-gaps shots taken. Closing app…");
  await h.close();
  return HSHOTS;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
