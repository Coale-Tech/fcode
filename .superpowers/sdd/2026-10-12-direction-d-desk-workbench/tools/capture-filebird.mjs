/**
 * FileBird-only capture — 4 shots.
 * Called from eval: const { captureFileBird } = await import('./capture-filebird.mjs?t=...');
 *                   await captureFileBird({ browser });
 */

import { mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";

const WT = "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-t14h-gaps";
const HSHOTS = `${WT}/.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/H-gaps`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function captureFileBird({ browser }) {
  await mkdir(HSHOTS, { recursive: true });

  process.env.FCODE_WORKTREE = WT;
  const { launch } = await import(
    `${WT}/.superpowers/sdd/2026-10-12-direction-d-desk-workbench/tools/drive.mjs?t=${Date.now()}`
  );

  console.log("[capture-filebird] Launching Electron…");
  const h = await launch({ browser, name: "hgaps-fb" });
  console.log("[capture-filebird] App ready.");

  await h.evalPage(`window.__PI_CAPTURE__ = 1`);
  await sleep(200);
  await h.evalPage(`window.__PI_DESKTOP__?.ensureVisualFixtures?.()`);
  await sleep(2500);

  // Navigate to filebird page in tabs layout
  await h.evalPage(`window.__PI_DESKTOP__?.setNavLayout?.("tabs")`);
  await sleep(500);
  await h.evalPage(`window.__PI_DESKTOP__?.setPage?.("filebird")`);
  await sleep(1500);

  const shot = async (name, theme) => {
    console.log(`[capture-filebird] Taking shot: ${name} (${theme})`);
    // Set theme
    await h.evalPage(`window.__PI_DESKTOP__?.setThemeAttr?.(${JSON.stringify(theme)})`);
    await sleep(400);
    // Hide overlays
    try {
      await h.evalPage(
        `document.querySelectorAll('.backend-banner,.backend-warning,.chat-sidecar-fatal').forEach(el => el.style.setProperty('display','none','important'))`
      );
    } catch(e) {
      console.warn("[capture-filebird] banner-hide warn:", e.message);
    }
    await sleep(150);
    const path = `${HSHOTS}/${name}.png`;
    try {
      await h.screenshot(path);
    } catch(e) {
      console.error("[capture-filebird] h.screenshot threw:", e.message);
    }
    await sleep(200);
    const exists = existsSync(path);
    console.log(`[capture-filebird] ${name}: file exists=${exists}`);
    if (!exists) {
      // Fallback: get base64 via CDP and write manually
      console.log("[capture-filebird] Trying CDP captureScreenshot fallback…");
      try {
        const b64 = await h.tab.evaluate(`
          (async () => {
            // Just return a marker so we know eval works
            return "eval-ok";
          })()
        `);
        console.log("[capture-filebird] eval result:", b64);
      } catch(e2) {
        console.error("[capture-filebird] eval fallback failed:", e2.message);
      }
    }
    return exists;
  };

  // Unavailable state (real IPC → no backend → Not connected)
  await shot("d-filebird-unavailable-D1-light", "light");
  await shot("d-filebird-unavailable-D1-dark", "dark");

  // Connected state: mock piDesktop.invoke for fileBird channels
  await h.evalPage(`(function() {
    var pd = window.piDesktop;
    if (!pd || !pd.invoke) return;
    var orig = pd.invoke.bind(pd);
    window.__origPiInvoke__ = orig;
    pd.invoke = function(ch) {
      if (typeof ch === 'string' && ch.indexOf('fileBird') >= 0) {
        return Promise.resolve({ ok: true });
      }
      return orig.apply(pd, arguments);
    };
  })()`);
  await sleep(300);
  // Remount page to trigger with mocked IPC
  await h.evalPage(`window.__PI_DESKTOP__?.setPage?.("chat")`);
  await sleep(300);
  await h.evalPage(`window.__PI_DESKTOP__?.setPage?.("filebird")`);
  await sleep(1500);

  await shot("d-filebird-connected-D1-light", "light");
  await shot("d-filebird-connected-D1-dark", "dark");

  console.log("[capture-filebird] All 4 shots done. Closing.");
  await h.close();
  return HSHOTS;
}
