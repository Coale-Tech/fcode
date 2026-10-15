/**
 * PI Desktop interactive UI driver
 *
 * Drives the REAL built Electron renderer over CDP. Not the capture rig.
 *
 * USAGE (from an eval cell where `browser` is the omp eval global):
 *
 *   const { launch } = await import('/Users/mac/.../tools/drive.mjs');
 *   const h = await launch({ browser });
 *   await h.click('[data-nav-layout-option="island"]');
 *   await h.press('ArrowRight');
 *   const state = await h.rootState();
 *   await h.screenshot('/tmp/shot.png');
 *   await h.setSettings({ navLayout: 'island' });
 *   await h.reload();
 *   await h.close();
 *
 * ENVIRONMENT:
 *   Expects apps/desktop build output in WORKTREE/apps/desktop/out/
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

// Lanes (R14) run in separate worktrees: set FCODE_WORKTREE to the lane's absolute path.
const WORKTREE = process.env.FCODE_WORKTREE ??
  "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d";
const ELECTRON =
  `${WORKTREE}/apps/desktop/node_modules/.bin/electron`;
const APP_DIR = `${WORKTREE}/apps/desktop`;

/** Find a free TCP port via net.createServer */
function freePort() {
  const { promise, resolve, reject } = Promise.withResolvers();
  const server = createServer();
  server.unref();
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
  server.on("error", reject);
  return promise;
}

/** Poll until CDP /json lists the main renderer (no ?surface= query param).
 *  The plugin-launcher window appears first; the main App window arrives
 *  ~30-60s later, after the host backend boots. */
async function waitForTarget(port, timeout = 70000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) {
        const targets = await res.json();
        // Prefer the main renderer (no surface= query param)
        const main = targets.find(
          (t) => t.type === "page" && t.webSocketDebuggerUrl &&
                 !t.url?.includes("surface="),
        );
        if (main) return main;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `CDP port ${port}: main renderer did not appear within ${timeout}ms`,
  );
}

/**
 * Launch the PI Desktop Electron app in non-capture mode and attach via CDP.
 *
 * @param {object} opts
 * @param {object} opts.browser   omp eval `browser` global (required)
 * @param {string} [opts.dataDir] override temp data dir
 * @param {string} [opts.name]    CDP tab name (default: "pi-desktop")
 * @returns {Promise<Handle>}
 */
export async function launch({ browser, dataDir, name = "pi-desktop" } = {}) {
  if (!browser) throw new Error("pass the omp eval `browser` global as opts.browser");

  const dir = dataDir ?? (await mkdtemp(join(tmpdir(), "pi-desktop-")));
  const port = await freePort();

  // Launch Electron as a subprocess
  const env = { ...process.env, PI_DESKTOP_DATA_DIR: dir };
  delete env.PI_DESKTOP_CAPTURE;
  delete env.ELECTRON_RENDERER_URL;

  const proc = Bun.spawn([ELECTRON, ".", `--remote-debugging-port=${port}`], {
    cwd: APP_DIR,
    env,
    stdout: "ignore",
    stderr: "ignore",
  });

  let target;
  try {
    target = await waitForTarget(port);
  } catch (e) {
    proc.kill();
    throw e;
  }

  // Connect to the main App renderer. Use the exact URL returned by waitForTarget
  // (which filters out ?surface= targets) to avoid matching the plugin-launcher window.
  const tab = await browser.open({
    name,
    app: { cdp_url: `http://127.0.0.1:${port}`, target: target.url },
    timeout: 20000,
  });

  // Wait for renderer to expose its IPC bridge and load settings from disk.
  // data-nav-layout is set at first paint (before settings load) so cannot
  // prove store initialisation; instead poll the real settings IPC until it
  // returns a valid object, proving the renderer store is live.
  await tab.waitForSelector("html[data-nav-layout]", { timeout: 15000 });
  const settingsDeadline = Date.now() + 10000;
  let settingsReady = false;
  while (!settingsReady && Date.now() < settingsDeadline) {
    try {
      const s = await tab.evaluate(
        `(async () => window.piDesktop?.invoke("pi-desktop/settings/get"))()`
      );
      if (s && typeof s === "object") settingsReady = true;
    } catch {}
    if (!settingsReady) await new Promise((r) => setTimeout(r, 200));
  }
  if (!settingsReady) throw new Error("Settings IPC did not initialise within 10s");

  const handle = {
    /** The BrowserTab — use for advanced operations */
    tab,
    /** Electron child process */
    proc,
    /** Persistent data dir for this session */
    dataDir: dir,

    /** Evaluate JS expression in the renderer page */
    async evalPage(js) {
      return tab.evaluate(`(async () => { return (${js}); })()`);
    },

    /** Click by CSS selector or plain text substring */
    async click(selectorOrText) {
      const isSelector =
        selectorOrText.startsWith("[") ||
        selectorOrText.startsWith(".") ||
        selectorOrText.startsWith("#") ||
        /^[a-z][a-z0-9]*$/i.test(selectorOrText.split(/[\s[.#:]/)[0]);
      if (isSelector) {
        await tab.click(selectorOrText);
      } else {
        await tab.click(`text/${selectorOrText}`);
      }
    },

    /** Press a key on the focused element */
    async press(key) {
      await tab.press("body", key);
    },

    /** Hard reload and wait for app init + settings IPC ready */
    async reload() {
      await tab.reload();
      await tab.waitForSelector("html[data-nav-layout]", { timeout: 10000 });
      const dl = Date.now() + 8000;
      let ok = false;
      while (!ok && Date.now() < dl) {
        try {
          const s = await tab.evaluate(
            `(async () => window.piDesktop?.invoke("pi-desktop/settings/get"))()`
          );
          if (s && typeof s === "object") ok = true;
        } catch {}
        if (!ok) await new Promise((r) => setTimeout(r, 200));
      }
    },

    /** Screenshot to path */
    async screenshot(path) {
      await tab.screenshot({ path });
    },

    /**
     * Merge patch into settings via the real renderer IPC bridge.
     * Reads current settings, merges, then writes.
     */
    async setSettings(patch) {
      const current = await tab.evaluate(
        `window.piDesktop.invoke("pi-desktop/settings/get")`,
      );
      const next = { ...current, ...patch };
      await tab.evaluate(
        `window.piDesktop.invoke("pi-desktop/settings/set", ${JSON.stringify(next)})`,
      );
      // Allow React to re-render and DOM to update
      await new Promise((r) => setTimeout(r, 300));
    },

    /**
     * Navigate to a named page via the renderer store.
     * page: 'settings' | 'chat' | ...
     */
    async goToPage(page) {
      await tab.evaluate(`window.__PI_DESKTOP__?.setPage(${JSON.stringify(page)})`);
      await new Promise((r) => setTimeout(r, 400));
    },

    /**
     * Click a navigation layout picker card through the real saveSettings path.
     * Navigates to Settings, clicks the picker, then returns to the previous page.
     * Returns rootState() measured after the layout switch.
     *
     * layout: 'rail' | 'island' | 'tabs'
     */
    async clickNavLayout(layout) {
      await this.goToPage("settings");
      await tab.click(`[data-nav-layout-option="${layout}"]`);
      await new Promise((r) => setTimeout(r, 500));
      await this.goToPage("chat");
      await new Promise((r) => setTimeout(r, 400));
      return this.rootState();
    },

    /**
     * Snapshot of renderer state for layout/theme/budget acceptance.
     *
     * Returns:
     *   dataNavLayout      — document.documentElement.dataset.navLayout (store-derived)
     *   dataTheme          — dataset.theme
     *   lang               — document.documentElement.lang
     *   innerWidth         — window.innerWidth
     *   devicePixelRatio
     *   fontScale          — computed --font-scale CSS var
     *   shellClientWidth   — .app-shell element clientWidth (unchanged across layout switch)
     *   shellChromeW       — horizontal chrome reserved by this layout (rail:74, island:84, tabs:24)
     *   usableWidth        — shellClientWidth - shellChromeW (drops 10px rail→island)
     *   persistedNavLayout — navLayout from the real settings IPC (proves disk persistence)
     *   captureTime        — ISO timestamp
     */
    async rootState() {
      // Shell chrome widths: keep in sync with nav-layout.ts (RAIL_WIDTH + 2 × CANVAS_GAP).
      // rail: 50+24=74, island: 60+24=84, tabs: 0+24=24
      const [dom, settings] = await Promise.all([
        tab.evaluate(`(() => {
          const el = document.documentElement;
          const cs = getComputedStyle(el);
          const navLayout = el.dataset.navLayout ?? "rail";
          const CHROME = { tabs: 24, rail: 74, island: 84 };
          const shellEl = document.querySelector(".app-shell");
          const shellClientWidth = shellEl ? shellEl.clientWidth : 0;
          const chromeW = CHROME[navLayout] ?? 74;
          return {
            dataNavLayout: navLayout,
            dataTheme: el.dataset.theme,
            lang: el.lang,
            innerWidth: window.innerWidth,
            devicePixelRatio: window.devicePixelRatio,
            fontScale: cs.getPropertyValue("--font-scale").trim(),
            fontFamily: cs.getPropertyValue("--font-family").trim(),
            shellClientWidth,
            shellChromeW: chromeW,
            usableWidth: shellClientWidth - chromeW,
          };
        })()`),
        tab.evaluate(
          `(async () => window.piDesktop?.invoke("pi-desktop/settings/get"))()`
        ),
      ]);
      return {
        ...dom,
        persistedNavLayout: settings?.navLayout ?? null,
        captureTime: new Date().toISOString(),
      };
    },

    /** Close the tab and terminate the Electron process */
    async close() {
      try { await browser.close({ name }); } catch {}
      try { proc.kill(); } catch {}
    },
  };

  return handle;
}
