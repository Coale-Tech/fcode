/**
 * shoot-island.mjs — capture all variant-D3 pages via raw CDP WebSocket.
 * Avoids omp browser.open which reconnects to wrong target in multi-window Electron.
 */
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { createHash } from "node:crypto";

const WORKTREE  = "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-t14h-island";
const ELECTRON  = `${WORKTREE}/apps/desktop/node_modules/.bin/electron`;
const APP_DIR   = `${WORKTREE}/apps/desktop`;
const SHOTS_DIR = `${WORKTREE}/.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/H-island`;

const freePort = () => new Promise((res, rej) => {
  const s = createServer(); s.unref();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
  s.on("error", rej);
});

async function waitForMainTarget(port, timeout = 90000) {
  const dl = Date.now() + timeout;
  while (Date.now() < dl) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json`);
      if (r.ok) {
        const ts = await r.json();
        const pages = ts.filter(t => t.type === "page" && t.webSocketDebuggerUrl);
        if (pages.length >= 2) {
          const main = pages.find(t => !t.url?.includes("surface="));
          if (main) return main;
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`CDP ${port}: main renderer not found`);
}

/** Persistent CDP session via WebSocket. */
function openCDP(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params = {}) => {
      const msgId = ++id;
      return new Promise((res, rej) => {
        pending.set(msgId, { res, rej, timer: setTimeout(() => {
          pending.delete(msgId); rej(new Error(`CDP ${method} timeout`));
        }, 25000) });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    };
    ws.addEventListener("open", () => resolve({ send, close: () => ws.close() }));
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej, timer } = pending.get(msg.id);
        clearTimeout(timer); pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      }
    });
    ws.addEventListener("error", reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function shoot({ browser: _browser }) {
  await mkdir(SHOTS_DIR, { recursive: true });

  const dataDir     = await mkdtemp(join(tmpdir(), "pi-island-"));
  const chromiumDir = await mkdtemp(join(tmpdir(), "pi-chrome-"));
  const port        = await freePort();
  const env         = { ...process.env, PI_DESKTOP_DATA_DIR: dataDir };
  delete env.PI_DESKTOP_CAPTURE;
  delete env.ELECTRON_RENDERER_URL;

  display(`[shoot] port=${port}`);
  const proc = Bun.spawn(
    [ELECTRON, ".", `--remote-debugging-port=${port}`, `--user-data-dir=${chromiumDir}`],
    { cwd: APP_DIR, env, stdout: "ignore", stderr: "ignore" },
  );

  let mainTarget, cdp;
  try {
    mainTarget = await waitForMainTarget(port);
    display(`[shoot] main: ${mainTarget.url.slice(-50)}`);
    cdp = await openCDP(mainTarget.webSocketDebuggerUrl);
  } catch(e) { proc.kill(); throw e; }

  const eval_ = async (expression) => {
    const r = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    return r?.result?.value;
  };

  // Wait for app to initialise: poll for __PI_DESKTOP__ + settings IPC.
  display("[shoot] Waiting for renderer…");
  const dl = Date.now() + 30000;
  let ok = false;
  while (!ok && Date.now() < dl) {
    try {
      const s = await eval_(`(async () => {
        if (!window.__PI_DESKTOP__) return null;
        const s = await window.piDesktop?.invoke("pi-desktop/settings/get");
        return s && typeof s === "object" ? "ok" : null;
      })()`);
      if (s === "ok") ok = true;
    } catch {}
    if (!ok) await sleep(500);
  }
  if (!ok) { cdp.close(); proc.kill(); throw new Error("App IPC not ready"); }

  display("[shoot] IPC ready. Setting island + seeding…");
  await eval_(`window.__PI_DESKTOP__?.setNavLayout("island")`);
  await sleep(700);
  await eval_(`(window.__PI_CAPTURE__ = 1, true)`);
  await eval_(`window.__PI_DESKTOP__?.setKanbanRaven?.(true)`);
  await eval_(`window.__PI_DESKTOP__?.seedBenchStatus?.({ benchPath: "/bench/coale_v16", siteCount: 3 })`);
  await sleep(500);

  display("[shoot] ensureVisualFixtures…");
  await eval_(`(async () => { await window.__PI_DESKTOP__?.ensureVisualFixtures?.(); })()`);
  await sleep(12000);

  await eval_(`window.__PI_DESKTOP__?.setPage("chat")`);
  await sleep(1000);

  const domCheck = await eval_(`JSON.stringify({
    navLayout: document.documentElement.dataset.navLayout,
    hasShell: !!document.querySelector(".app-shell"),
    sessions: document.querySelectorAll("[data-sidebar-session-row]").length,
    bench: !!document.querySelector(".d3-sb-bench"),
  })`);
  display("[shoot] DOM: " + domCheck);

  const prov = [];
  async function shot(name, beforeFn) {
    if (beforeFn) { await beforeFn(); await sleep(600); }
    const r = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const buf = Buffer.from(r.data, "base64");
    const path = join(SHOTS_DIR, `${name}.png`);
    await writeFile(path, buf);
    const hash = createHash("md5").update(buf).digest("hex");
    prov.push({ name, path, md5: hash, size: buf.length, ts: new Date().toISOString() });
    display(`[shoot] ✓ ${name}  ${buf.length}b  ${hash}`);
  }

  const goto = (page) => eval_(`window.__PI_DESKTOP__?.setPage(${JSON.stringify(page)})`);
  const theme = (t) => eval_(`window.__PI_DESKTOP__?.setThemeAttr(${JSON.stringify(t)})`);

  // ── LIGHT ────────────────────────────────────────────────────────────────
  await theme("light"); await sleep(500);

  await shot("D3-light-chat");
  await shot("D3-light-bench",    () => goto("bench"));
  await shot("D3-light-build",    () => goto("build"));
  await shot("D3-light-kanban",   () => goto("kanban"));
  await shot("D3-light-raven",    () => goto("raven"));
  await shot("D3-light-filebird", () => goto("filebird"));
  await shot("D3-light-scheduled",() => goto("scheduled"));
  await shot("D3-light-notifications",() => goto("notifications"));
  await shot("D3-light-plugins",  () => goto("plugins"));
  await shot("D3-light-pulls",    () => goto("pulls"));
  await shot("D3-light-settings", async () => {
    await goto("settings"); await sleep(400);
    await eval_(`window.__PI_DESKTOP__?.seedOmpSettings?.()`);
  });

  // ── DARK ─────────────────────────────────────────────────────────────────
  await theme("dark"); await sleep(500);

  await shot("D3-dark-chat",      () => goto("chat"));
  await shot("D3-dark-bench",     () => goto("bench"));
  await shot("D3-dark-build",     () => goto("build"));
  await shot("D3-dark-kanban",    () => goto("kanban"));
  await shot("D3-dark-raven",     () => goto("raven"));
  await shot("D3-dark-filebird",  () => goto("filebird"));
  await shot("D3-dark-scheduled", () => goto("scheduled"));
  await shot("D3-dark-notifications",() => goto("notifications"));
  await shot("D3-dark-plugins",   () => goto("plugins"));
  await shot("D3-dark-settings",  () => goto("settings"));

  await writeFile(join(SHOTS_DIR, "provenance.json"),
    JSON.stringify({ lane: "H-island", shots: prov }, null, 2));

  cdp.close();
  try { proc.kill(); } catch {}
  return { shots: prov };
}
