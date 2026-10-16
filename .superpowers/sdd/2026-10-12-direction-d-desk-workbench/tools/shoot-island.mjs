/**
 * shoot-island.mjs — capture all variant-D3 pages via raw CDP WebSocket.
 * v14: Uses seedVisualState() + individual seed methods (no ensureVisualFixtures).
 *      Viewport forced to 1440×900 via Emulation.setDeviceMetricsOverride.
 *      No FCODE_BENCH_ROOTS (fake dirs). Uses seedBenchList() for bench page.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";

const WORKTREE  = "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-t14h-island";
const ELECTRON  = `${WORKTREE}/apps/desktop/node_modules/.bin/electron`;
const APP_DIR   = `${WORKTREE}/apps/desktop`;
const SHOTS_DIR = `${WORKTREE}/.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/H-island`;

const COALE_BENCH_PATH = "/Users/mac/ERPNext/frappe_agent/coale_v16";

const freePort = () => new Promise((res, rej) => {
  const s = createServer(); s.unref();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
  s.on("error", rej);
});

async function waitForMainTarget(port, timeout = 90000) {
  const dl = Date.now() + timeout;
  while (Date.now() < dl) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (!r.ok) throw new Error("not ok");
      const tabs = await r.json();
      // Wait for ≥2 page targets: plugin-launcher loads index.html first,
      // then main window loads. Only the main window lacks ?surface=.
      const pages = tabs.filter(t => t.type === "page" && t.webSocketDebuggerUrl);
      const main = pages.find(t =>
        t.url &&
        t.url.includes("index.html") &&
        !t.url.includes("surface=") &&
        t.webSocketDebuggerUrl
      );
      if (main && pages.length >= 2) return main;
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

  const dataDir     = mkdtempSync(join(tmpdir(), "pi-island-"));
  const chromiumDir = mkdtempSync(join(tmpdir(), "pi-chrome-"));
  const port        = await freePort();

  const env = {
    ...process.env,
    PI_DESKTOP_DATA_DIR: dataDir,
  };
  delete env.PI_DESKTOP_CAPTURE;
  delete env.ELECTRON_RENDERER_URL;
  delete env.FCODE_BENCH_ROOTS;

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
    if (r?.exceptionDetails) {
      const msg = r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails);
      throw new Error(`Renderer eval error: ${msg}`);
    }
    return r?.result?.value;
  };

  // Force 1440×900 viewport to match reference screenshots.
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  // Wait for app to initialise: __PI_DESKTOP__ + settings IPC.
  display("[shoot] Waiting for renderer…");
  const dl = Date.now() + 40000;
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

  display("[shoot] IPC ready. Seeding island state…");

  // 1. Set island layout.
  await eval_(`window.__PI_DESKTOP__?.setNavLayout("island")`);
  await sleep(600);

  // 2. Enable capture mode flag.
  await eval_(`(window.__PI_CAPTURE__ = 1, true)`);

  // 3. Suppress backend-down banner (no host binary during captures).
  await eval_(`
    (() => {
      if (document.getElementById("pi-capture-overrides")) return;
      const s = document.createElement("style");
      s.id = "pi-capture-overrides";
      s.textContent = ".backend-banner { display: none !important; }";
      document.head.appendChild(s);
    })()
  `);

  // 4. Seed sessions, avatar, flags synchronously (no IPC calls).
  await eval_(`window.__PI_DESKTOP__?.seedVisualState?.()`);

  // 5. Enable feature flags (kanban + raven) — seedVisualState already sets these
  //    but also call the direct API to ensure NavRail picks them up.
  await eval_(`window.__PI_DESKTOP__?.enableFeatureFlags?.({ kanban: true, raven: true })`);

  await sleep(400);

  // 6. Seed bench card status (sidebar) — sets __PI_BENCH_OVERRIDE__ for useBenchContext.
  await eval_(`(async () => {
    await window.__PI_DESKTOP__?.seedBenchStatus?.({
      benchPath: ${JSON.stringify(COALE_BENCH_PATH)},
      siteCount: 3,
    });
  })()`);

  // 7. Seed bench IPC intercept — makes BenchPage show 5 seeded benches + coale_v16 running.
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedBenchList?.(); })()`);

  // 8. Seed 7 notifications (3 unread TODAY + 4 read: 3 TODAY + 2 YESTERDAY).
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedNotifications?.(7); })()`);

  // 9. Seed kanban board (5 columns, 12 tasks, 2 running).
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedKanbanBoard?.(1); })()`);

  // 10. Seed scheduled tasks (5 tasks + 24 run history).
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedScheduledTasks?.(1); })()`);

  // 11. Seed plugins (5 plugins: 2 active, 1 turned off, 1 needs attention, 1 update).
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedPlugins?.(5); })()`);

  // 12. Seed pull requests (5 PRs with check states).
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedPullRequests?.(1); })()`);

  // 13. Seed OMP settings (for settings page).
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedOmpSettings?.(); })()`);

  await sleep(800);

  // Navigate to chat, let React settle.
  await eval_(`window.__PI_DESKTOP__?.setPage("chat")`);
  await sleep(1000);

  const domCheck = await eval_(`JSON.stringify({
    navLayout: document.documentElement.dataset.navLayout,
    theme:     document.documentElement.dataset.theme,
    sessions:  document.querySelectorAll("[data-sidebar-session-row]").length,
    bench:     !!document.querySelector(".d3-sb-bench"),
    pinned:    document.querySelectorAll(".d3-sb-pinned-row").length,
    avatar:    document.querySelector(".shell-navbar-avatar-initials")?.textContent ?? "none",
  })`);
  display("[shoot] DOM: " + domCheck);

  // Seed approval card for the chat shot (pending permission card must be visible).
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedApprovalCard?.(); })()`);
  await sleep(600);

  const prov = [];
  async function shot(name, beforeFn, extraWait = 0) {
    if (beforeFn) { await beforeFn(); await sleep(600 + extraWait); }
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
  await theme("light"); await sleep(400);

  // Assert .permission-card is in DOM before chat shot.
  const hasPermCard = await eval_(`!!document.querySelector(".permission-card")`);
  if (!hasPermCard) {
    display("[shoot] WARN: .permission-card not found for chat shot; re-seeding…");
    await eval_(`(async () => { await window.__PI_DESKTOP__?.seedApprovalCard?.(); })()`);
    await sleep(800);
  }

  await shot("D3-light-chat");

  // Bench: open first 2 bench detail tabs then show "All benches" table.
  // After clicking btns[0], tab changes to coale_v16 detail (AllBenches unmounts).
  // Must return to "All benches" before clicking btns[1].
  await shot("D3-light-bench", async () => {
    await goto("bench");
    await sleep(2400); // wait for seeded bench list to load
    const openBenchTab = async (idx) => {
      // Ensure All benches table is visible, then click row[idx].
      await eval_(`
        (() => {
          const allTab = document.getElementById("bench-tab-all");
          if (allTab && !allTab.classList.contains("is-active")) allTab.click();
        })()
      `);
      await sleep(200);
      await eval_(`
        (() => {
          const btns = document.querySelectorAll(".wb-link-btn.wb-table-name");
          if (btns[${idx}]) btns[${idx}].click();
        })()
      `);
      await sleep(300);
    };
    await openBenchTab(0); // opens coale_v16 detail tab
    await openBenchTab(1); // opens dev_bench detail tab
    // Final: show "All benches" table with both tabs in the tab strip.
    await eval_(`
      (() => {
        const allTab = document.getElementById("bench-tab-all");
        if (allTab) allTab.click();
      })()
    `);
  }, 400);

  await shot("D3-light-build",         () => goto("build"));
  await shot("D3-light-kanban",        () => goto("kanban"));
  await shot("D3-light-raven",         () => goto("raven"));
  await shot("D3-light-filebird",      () => goto("filebird"));
  await shot("D3-light-scheduled",     () => goto("scheduled"));
  await shot("D3-light-notifications", () => goto("notifications"));
  await shot("D3-light-plugins",       () => goto("plugins"));
  await shot("D3-light-pulls",         () => goto("pulls"));
  await shot("D3-light-settings",      async () => {
    await goto("settings"); await sleep(400);
    await eval_(`(async () => { await window.__PI_DESKTOP__?.seedOmpSettings?.(); })()`);
  });

  // ── DARK ─────────────────────────────────────────────────────────────────
  await theme("dark"); await sleep(400);

  await shot("D3-dark-chat",           async () => {
    await goto("chat");
    // Re-seed approval card for dark theme shot.
    await eval_(`(async () => { await window.__PI_DESKTOP__?.seedApprovalCard?.(); })()`);
  });
  await shot("D3-dark-bench", async () => {
    await goto("bench");
    await sleep(2400);
    const openBenchTabD = async (idx) => {
      await eval_(`
        (() => {
          const allTab = document.getElementById("bench-tab-all");
          if (allTab && !allTab.classList.contains("is-active")) allTab.click();
        })()
      `);
      await sleep(200);
      await eval_(`
        (() => {
          const btns = document.querySelectorAll(".wb-link-btn.wb-table-name");
          if (btns[${idx}]) btns[${idx}].click();
        })()
      `);
      await sleep(300);
    };
    await openBenchTabD(0);
    await openBenchTabD(1);
    await eval_(`
      (() => {
        const allTab = document.getElementById("bench-tab-all");
        if (allTab) allTab.click();
      })()
    `);
  }, 400);
  await shot("D3-dark-build",          () => goto("build"));
  await shot("D3-dark-kanban",         () => goto("kanban"));
  await shot("D3-dark-raven",          () => goto("raven"));
  await shot("D3-dark-filebird",       () => goto("filebird"));
  await shot("D3-dark-scheduled",      () => goto("scheduled"));
  await shot("D3-dark-notifications",  () => goto("notifications"));
  await shot("D3-dark-plugins",        () => goto("plugins"));
  await shot("D3-dark-settings",       () => goto("settings"));

  await writeFile(join(SHOTS_DIR, "provenance.json"),
    JSON.stringify({ lane: "H-island", shots: prov }, null, 2));

  cdp.close();
  try { proc.kill(); } catch {}
  return { shots: prov };
}
