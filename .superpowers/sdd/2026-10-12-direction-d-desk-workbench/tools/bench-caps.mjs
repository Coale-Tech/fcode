#!/usr/bin/env node
/**
 * bench-caps.mjs — CDP capture for bench/build/raven/filebird pages.
 * Launches the built Electron app, seeds bench state, takes direction-D shots.
 *
 * Usage:
 *   node bench-caps.mjs [--debug-port=9224]
 *
 * Writes PNGs to /tmp/codex-screens/d-*.png
 * Writes bounds log to /tmp/bench-caps-bounds.log
 */

import { spawnSync, spawn } from "node:child_process";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const WORKTREE = join(__dir, "../../../../..");   // direction-d-t14g-bench
const ELECTRON = join(WORKTREE, "node_modules/.pnpm/electron@43.6.0/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const APP_OUT = join(WORKTREE, "apps/desktop/out/main/index.js");
const DATA_DIR = "/tmp/t14g-bench-caps-data";
const OUT_DIR = "/tmp/codex-screens";
const BOUNDS_LOG = "/tmp/bench-caps-bounds.log";

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(DATA_DIR, { recursive: true });

const DEBUG_PORT = (() => {
  const arg = process.argv.find(a => a.startsWith("--debug-port="));
  return arg ? parseInt(arg.split("=")[1]) : 9224;
})();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForTarget(port, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) {
        const targets = await res.json();
        const main = targets.find(t =>
          t.type === "page" && t.webSocketDebuggerUrl && !t.url?.includes("surface=")
        );
        if (main) return main;
      }
    } catch {}
    await sleep(1000);
  }
  throw new Error(`CDP port ${port}: renderer did not appear within ${timeout}ms`);
}

// Minimal CDP over fetch + WebSocket
async function cdpConnect(wsUrl) {
  const { default: WebSocket } = await import("ws").catch(() => {
    // try node built-in ws-compatible
    return { default: class WS extends require("node:events") {
      constructor(u) { super(); const w = new (require("node:net").Socket)(); }
    }};
  });
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = new Map();
    ws.on("open", () => {
      const send = (method, params = {}) => {
        const msgId = id++;
        return new Promise((res, rej) => {
          pending.set(msgId, { res, rej });
          ws.send(JSON.stringify({ id: msgId, method, params }));
        });
      };
      resolve({ send, ws });
    });
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    });
    ws.on("error", reject);
  });
}

async function main() {
  // Kill any stale instance
  spawnSync("pkill", ["-f", "direction-d-t14g-bench/"], { stdio: "ignore" });
  await sleep(2000);

  console.log("[bench-caps] launching Electron…");
  const env = {
    ...process.env,
    PI_DESKTOP_DATA_DIR: DATA_DIR,
    PI_DESKTOP_CAPTURE: "1",
    FCODE_BENCH_ROOTS: "/tmp/t14g-fake-bench",
    ELECTRON_ENABLE_LOGGING: "1",
  };
  const logStream = createWriteStream(BOUNDS_LOG);
  const child = spawn(ELECTRON, [APP_OUT, `--remote-debugging-port=${DEBUG_PORT}`], {
    env,
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", d => {
    const s = d.toString();
    process.stdout.write(s);
    if (s.includes("-bounds]")) logStream.write(s);
  });
  child.stderr.on("data", d => process.stderr.write(d));

  console.log("[bench-caps] waiting for CDP target…");
  const target = await waitForTarget(DEBUG_PORT, 120_000);
  console.log("[bench-caps] connected:", target.url);

  const { send, ws } = await cdpConnect(target.webSocketDebuggerUrl);

  const exec = async (js) => {
    const r = await send("Runtime.evaluate", {
      expression: js,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r?.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r?.result?.value;
  };

  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const buf = Buffer.from(r.data, "base64");
    const p = join(OUT_DIR, `${name}.png`);
    writeFileSync(p, buf);
    console.log(`[bench-caps] shot → ${p} (${buf.length} bytes)`);
  };

  // Set viewport to 1440×900
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  // Wait for app shell
  console.log("[bench-caps] waiting for shell…");
  for (let i = 0; i < 40; i++) {
    const ok = await exec(`!!(document.querySelector(".app-shell") && document.querySelectorAll("[data-nav]").length > 0)`);
    if (ok) break;
    await sleep(500);
  }
  await sleep(800);

  // Enable capture mode + fixtures
  await exec(`window.__PI_CAPTURE__ = 1; void window.__PI_DESKTOP__?.ensureVisualFixtures?.()`);
  await sleep(600);

  const setTheme = async (t) => {
    await exec(`window.__PI_DESKTOP__?.setThemeAttr?.(${JSON.stringify(t)})`);
    await sleep(400);
  };

  const setPage = async (p) => {
    await exec(`window.__PI_DESKTOP__?.setPage?.(${JSON.stringify(p)})`);
    await sleep(800);
  };

  const switchLayout = async (layout) => {
    // Navigate to settings, click layout option, come back
    await exec(`window.__PI_DESKTOP__?.setPage?.("settings")`);
    await sleep(600);
    await exec(`document.querySelector('[data-nav-layout-option="${layout}"]')?.click()`);
    await sleep(900);
    await exec(`window.__PI_DESKTOP__?.setPage?.("bench")`);
    await sleep(600);
  };

  const collapseSidebar = async () => {
    await exec(`document.querySelector('[data-nav="toggle-sidebar"][aria-expanded="true"]')?.click()`);
    await sleep(300);
  };

  // ── Seed bench state ────────────────────────────────────────────────────
  await exec(`window.__PI_DESKTOP__?.seedBenchList?.()`);
  await sleep(300);
  await exec(`window.__PI_DESKTOP__?.seedBenchStatus?.()`);
  await sleep(300);

  // ── Bench list shots ────────────────────────────────────────────────────
  await setTheme("light");
  await exec(`window.__PI_DESKTOP__?.setPage?.("bench")`);
  await sleep(1200);
  await shot("d-bench-D1-light");
  await setTheme("dark"); await sleep(500); await shot("d-bench-D1-dark");

  await setTheme("light");
  await switchLayout("rail");
  await exec(`window.__PI_DESKTOP__?.setPage?.("bench")`); await sleep(800);
  await shot("d-bench-D2-light");
  await setTheme("dark"); await sleep(500); await shot("d-bench-D2-dark");

  await setTheme("light");
  await switchLayout("island");
  await exec(`window.__PI_DESKTOP__?.setPage?.("bench")`); await sleep(1000);
  await shot("d-bench-D3-light");
  await setTheme("dark"); await sleep(500); await shot("d-bench-D3-dark");

  // ── Bench detail (open coale_v16 tab) ──────────────────────────────────
  await setTheme("light");
  await switchLayout("tabs");
  await exec(`window.__PI_DESKTOP__?.setPage?.("bench")`); await sleep(800);
  // Click coale_v16 tab
  await exec(`document.querySelector('.bp-tab[data-bench-id="cap-bench-coale-v16"], .wb-tab-btn:not([class*="all"])')?.click()`);
  await sleep(1000);
  await exec(`window.__PI_DESKTOP__?.seedBenchStatus?.()`); await sleep(400);
  await shot("d-bench-D1-detail-light");
  await setTheme("dark"); await sleep(500); await shot("d-bench-D1-detail-dark");

  // D3 detail
  await setTheme("light");
  await switchLayout("island");
  await exec(`window.__PI_DESKTOP__?.setPage?.("bench")`); await sleep(800);
  await exec(`document.querySelector('.bp-tab[data-bench-id="cap-bench-coale-v16"], .wb-tab-btn:not([class*="all"])')?.click()`);
  await sleep(1000);
  await shot("d-bench-D3-detail-light");
  await setTheme("dark"); await sleep(500); await shot("d-bench-D3-detail-dark");

  // ── Build shots ─────────────────────────────────────────────────────────
  await setTheme("light");
  await switchLayout("tabs");
  await exec(`window.__PI_DESKTOP__?.seedBuildRunning?.()`).catch(() => {});
  await setPage("build");
  await shot("d-build-running-D1-light");
  await setTheme("dark"); await sleep(500); await shot("d-build-running-D1-dark");

  await setTheme("light"); await switchLayout("rail");
  await setPage("build");
  await shot("d-build-running-D2-light");
  await setTheme("dark"); await sleep(500); await shot("d-build-running-D2-dark");

  await setTheme("light"); await switchLayout("island");
  await setPage("build");
  await shot("d-build-running-D3-light");
  await setTheme("dark"); await sleep(500); await shot("d-build-running-D3-dark");

  // ── Raven shots (bounds also logged via [raven-bounds]) ─────────────────
  await setTheme("light"); await switchLayout("tabs");
  await exec(`window.__PI_DESKTOP__?.seedRavenConnected?.(); window.__PI_DESKTOP__?.setPage?.("raven")`);
  await sleep(1500); await collapseSidebar();
  await shot("d-raven-disconnected-D1-light");
  await setTheme("dark"); await sleep(500); await shot("d-raven-disconnected-D1-dark");

  await setTheme("light"); await switchLayout("rail");
  await exec(`window.__PI_DESKTOP__?.setPage?.("raven")`); await sleep(1000); await collapseSidebar();
  await shot("d-raven-disconnected-D2-light");
  await setTheme("dark"); await sleep(500); await shot("d-raven-disconnected-D2-dark");

  await setTheme("light"); await switchLayout("island");
  await exec(`window.__PI_DESKTOP__?.setPage?.("raven")`); await sleep(1500);
  await shot("d-raven-disconnected-D3-light");
  await setTheme("dark"); await sleep(500); await shot("d-raven-disconnected-D3-dark");

  // ── FileBird shots (bounds logged via [filebird-bounds]) ─────────────────
  await setTheme("light"); await switchLayout("tabs");
  await exec(`window.__PI_DESKTOP__?.seedFileBirdConnected?.(); window.__PI_DESKTOP__?.setPage?.("filebird")`);
  await sleep(1000); await collapseSidebar();
  await shot("d-filebird-D1-light");
  await setTheme("dark"); await sleep(500); await shot("d-filebird-D1-dark");

  await setTheme("light"); await switchLayout("rail");
  await exec(`window.__PI_DESKTOP__?.setPage?.("filebird")`); await sleep(800); await collapseSidebar();
  await shot("d-filebird-D2-light");
  await setTheme("dark"); await sleep(500); await shot("d-filebird-D2-dark");

  await setTheme("light"); await switchLayout("island");
  await exec(`window.__PI_DESKTOP__?.setPage?.("filebird")`); await sleep(1200);
  await shot("d-filebird-D3-light");
  await setTheme("dark"); await sleep(500); await shot("d-filebird-D3-dark");

  // ── Bounds stress: layout switch + window resize + work-panel toggle ────
  // (logged by BrowserPane.setBounds and filebird-ipc while PI_DESKTOP_CAPTURE=1)
  console.log("[bench-caps] bounds stress: layout switch…");
  for (const layout of ["tabs", "rail", "island"]) {
    await exec(`window.__PI_DESKTOP__?.setPage?.("raven")`); await sleep(600);
    await exec(`document.querySelector('[data-nav-layout-option="${layout}"]')?.click()`);
    await sleep(700);
    await exec(`window.__PI_DESKTOP__?.setPage?.("filebird")`); await sleep(600);
    await exec(`window.__PI_DESKTOP__?.setPage?.("build")`); await sleep(600);
  }
  // Window resize
  console.log("[bench-caps] bounds stress: resize…");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  await exec(`window.__PI_DESKTOP__?.setPage?.("raven")`); await sleep(600);
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(500);

  logStream.end();
  ws.close();
  child.kill("SIGTERM");
  console.log("[bench-caps] DONE. Bounds log →", BOUNDS_LOG);
}

main().catch(e => { console.error(e); process.exit(1); });
