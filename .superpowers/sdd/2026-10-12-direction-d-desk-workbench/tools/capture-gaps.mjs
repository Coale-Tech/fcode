/**
 * H-gaps capture script
 * Takes shots for: command palette D1/D2/D3 light+dark,
 * onboarding D1/D2/D3 light+dark, settings tabs D1/D2/D3 light+dark,
 * FileBird D1/D2/D3 light+dark.
 *
 * Usage (from omp eval cell):
 *   const { run } = await import('.../tools/capture-gaps.mjs');
 *   await run({ browser });
 */

import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

const WORKTREE = "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-t14h-gaps";
const ELECTRON = `${WORKTREE}/apps/desktop/node_modules/.bin/electron`;
const APP_DIR   = `${WORKTREE}/apps/desktop`;
const SHOTS_DIR = `${WORKTREE}/.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/H-gaps`;

async function freePort() {
  const { promise, resolve, reject } = Promise.withResolvers();
  const server = createServer();
  server.unref();
  server.listen(0, "127.0.0.1", () => { const p = server.address().port; server.close(() => resolve(p)); });
  server.on("error", reject);
  return promise;
}

async function waitForTarget(port, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) {
        const targets = await res.json();
        const main = targets.find(t => t.type === "page" && !t.url?.includes("surface="));
        if (main) return main;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`CDP port ${port}: main renderer did not appear within ${timeout}ms`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function evalJs(tab, js) {
  return tab.evaluate(`(async () => { ${js} })()`);
}

async function setLayout(tab, layout) {
  await evalJs(tab, `
    window.__PI_DESKTOP__?.setNavLayout?.(${JSON.stringify(layout)});
    document.documentElement.dataset.navLayout = ${JSON.stringify(layout)};
  `);
  await sleep(400);
}

async function setTheme(tab, theme) {
  await evalJs(tab, `window.__PI_DESKTOP__?.setThemeAttr?.(${JSON.stringify(theme)})`);
  await sleep(250);
}

async function setPage(tab, page) {
  await evalJs(tab, `window.__PI_DESKTOP__?.setPage?.(${JSON.stringify(page)})`);
  await sleep(400);
}

async function seedBase(tab) {
  await evalJs(tab, `
    window.__PI_DESKTOP__?.seedBenchStatus?.({ benchPath: '/bench/coale_v16', siteCount: 3 });
    window.__PI_DESKTOP__?.seedNotifications?.();
    window.__PI_DESKTOP__?.seedSidebarStatuses?.();
    window.__PI_DESKTOP__?.seedTranscript?.();
    // Set user initials
    const s = window.__PI_DESKTOP__?.getSettings?.();
    if (s) window.__PI_DESKTOP__?.setFontFamily?.(s.fontFamily ?? 'inherit');
    const { useAppStore } = window.__PI_APP_STORE__ ?? {};
  `);
  // Set user initials via store
  await evalJs(tab, `
    if (typeof useAppStore !== 'undefined') useAppStore.setState({ userInitials: 'JK' });
  `);
  await sleep(200);
}

async function openPalette(tab) {
  await evalJs(tab, `
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
  `);
  await sleep(500);
}

async function typePaletteQuery(tab, value) {
  await evalJs(tab, `
    const input = document.querySelector('.search-input');
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  `);
  await sleep(400);
}

async function closePalette(tab) {
  await evalJs(tab, `
    document.querySelector('.search-input')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
  `);
  await sleep(200);
}

export async function run({ browser }) {
  if (!browser) throw new Error("pass the omp eval browser global");

  await mkdir(SHOTS_DIR, { recursive: true });

  const dir = await mkdtemp(join(tmpdir(), "pi-gaps-"));
  const port = await freePort();

  const env = { ...process.env, PI_DESKTOP_DATA_DIR: dir, PI_DESKTOP_CAPTURE: "1" };
  delete env.ELECTRON_RENDERER_URL;

  const proc = Bun.spawn([ELECTRON, ".", `--remote-debugging-port=${port}`], {
    cwd: APP_DIR,
    env,
    stdout: "ignore",
    stderr: "ignore",
  });

  const prov = [];
  try {
    const target = await waitForTarget(port);
    const tab = await browser.open({
      name: "pi-gaps",
      app: { cdp_url: `http://127.0.0.1:${port}`, target: target.url },
      timeout: 20000,
    });

    await tab.waitForSelector("html[data-nav-layout]", { timeout: 20000 });
    await sleep(3000); // wait for app bootstrap

    const shot = async (name) => {
      await sleep(200);
      await tab.screenshot({ path: join(SHOTS_DIR, `${name}.png`) });
      console.log("SHOT", name);
    };

    // ── Seed base data ─────────────────────────────────────────────────────
    await evalJs(tab, `
      void window.__PI_DESKTOP__?.seedBenchStatus?.({ benchPath: '/bench/coale_v16', siteCount: 3 });
      void window.__PI_DESKTOP__?.seedNotifications?.();
      void window.__PI_DESKTOP__?.seedSidebarStatuses?.();
      void window.__PI_DESKTOP__?.seedTranscript?.();
    `);
    await sleep(500);

    // ── COMMAND PALETTE shots (D1/D2/D3, light+dark) ──────────────────────
    for (const layout of ["tabs", "rail", "island"]) {
      await setLayout(tab, layout);
      await setPage(tab, "chat");

      for (const theme of ["light", "dark"]) {
        await setTheme(tab, theme);

        // Seed palette extras (FILES + BENCHES)
        await evalJs(tab, `void window.__PI_DESKTOP__?.seedCommandPaletteExtras?.()`);
        await sleep(100);

        // Open and type query
        await openPalette(tab);
        await typePaletteQuery(tab, "migrate");

        await shot(`cmdpal-${layout}-${theme}`);
        await closePalette(tab);
      }
    }

    // ── ONBOARDING shots (D1/D2/D3, light+dark, step 1) ─────────────────
    for (const layout of ["tabs", "rail", "island"]) {
      await setLayout(tab, layout);
      await setPage(tab, "chat");

      for (const theme of ["light", "dark"]) {
        await setTheme(tab, theme);
        await evalJs(tab, `void window.__PI_DESKTOP__?.seedOnboardingChecklist?.()`);
        await sleep(300);
        await shot(`onboarding-step1-${layout}-${theme}`);
      }
    }

    // ── SETTINGS-AI shots (D1/D2/D3, light+dark) ─────────────────────────
    for (const layout of ["tabs", "rail", "island"]) {
      await setLayout(tab, layout);

      for (const theme of ["light", "dark"]) {
        await setTheme(tab, theme);
        await evalJs(tab, `
          window.__PI_DESKTOP__?.setSettingsTab?.('agent');
          window.__PI_DESKTOP__?.setPage?.('settings');
        `);
        await sleep(500);
        await shot(`settings-ai-${layout}-${theme}`);
      }
    }

    // ── SETTINGS-ADVANCED shots (D1/D2/D3, light+dark) ──────────────────
    for (const layout of ["tabs", "rail", "island"]) {
      await setLayout(tab, layout);

      for (const theme of ["light", "dark"]) {
        await setTheme(tab, theme);
        await evalJs(tab, `
          window.__PI_DESKTOP__?.setSettingsTab?.('advanced');
          window.__PI_DESKTOP__?.setPage?.('settings');
        `);
        await sleep(500);
        await shot(`settings-advanced-${layout}-${theme}`);
      }
    }

    // ── SETTINGS-PERMISSIONS shots (D1/D2/D3, light+dark) ────────────────
    for (const layout of ["tabs", "rail", "island"]) {
      await setLayout(tab, layout);

      for (const theme of ["light", "dark"]) {
        await setTheme(tab, theme);
        await evalJs(tab, `
          window.__PI_DESKTOP__?.setSettingsTab?.('permissions');
          window.__PI_DESKTOP__?.setPage?.('settings');
        `);
        await sleep(500);
        await shot(`settings-permissions-${layout}-${theme}`);
      }
    }

    // ── FILEBIRD shots (D1/D2/D3, light+dark) ────────────────────────────
    for (const layout of ["tabs", "rail", "island"]) {
      await setLayout(tab, layout);

      for (const theme of ["light", "dark"]) {
        await setTheme(tab, theme);
        await evalJs(tab, `window.__PI_DESKTOP__?.setPage?.('filebird')`);
        await sleep(2000); // wait for WebContentsView to mount
        await shot(`filebird-${layout}-${theme}`);
      }
    }

    prov.push({
      capturedAt: new Date().toISOString(),
      worktree: WORKTREE,
      branch: "feat/direction-d-t14h-gaps",
      layouts: ["tabs", "rail", "island"],
      themes: ["light", "dark"],
      pages: ["cmdpal", "onboarding-step1", "settings-ai", "settings-advanced", "settings-permissions", "filebird"],
    });

    await writeFile(join(SHOTS_DIR, "provenance.json"), JSON.stringify(prov[0], null, 2));
    console.log("DONE — shots in", SHOTS_DIR);

    try { await browser.close({ name: "pi-gaps" }); } catch {}
  } finally {
    try { proc.kill(); } catch {}
  }

  return { dir, shots: SHOTS_DIR };
}
