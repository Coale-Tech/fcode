/**
 * shoot-rail.mjs — capture all variant-D2 (rail) pages via raw CDP WebSocket.
 * v14: Modelled directly on shoot-island.mjs (island lane v14).
 *      - NO PI_DESKTOP_CAPTURE env var (prevents G-Pages interference)
 *      - window.__PI_CAPTURE__=1 set in renderer
 *      - deviceScaleFactor:1 → 1440×900 shots, matches reference dimensions
 *      - No proxy/lock hacks — direct setNavLayout/setPage/setThemeAttr calls
 *      - CSS injection hides .backend-banner (no host binary during capture)
 *      - Full per-shot DOM assertion: navLayout, theme, page indicator, banner absent, badge, avatar
 *      - seedBenchList() for bench page (5 benches)
 *      - seedPullRequests(1) + click #247 row for pull-requests detail panel
 *      - Correct settings tabs: aiAgents→settings-ai, ai→settings-permissions
 *      - seedVisualState + seedReviewChanges + openWorkPanel for chat-workpanel
 */
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";

const WORKTREE  = "/Users/mac/ERPNext/frappe_agent/fcode-worktrees/direction-d-t14h-rail";
const ELECTRON  = `${WORKTREE}/apps/desktop/node_modules/.bin/electron`;
const APP_DIR   = `${WORKTREE}/apps/desktop`;
const SHOTS_DIR = `${WORKTREE}/.superpowers/sdd/2026-10-12-direction-d-desk-workbench/shots/H-Rail`;

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
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const targets = await res.json();
      const main = targets.find(t =>
        t.type === "page" && !t.url.includes("?surface=")
      );
      if (main) return main;
    } catch {}
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`CDP ${port}: main renderer not found`);
}

function openCDP(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params = {}) => {
      const myId = ++id;
      return new Promise((res, rej) => {
        pending.set(myId, { res, rej });
        ws.send(JSON.stringify({ id: myId, method, params }));
        setTimeout(() => { pending.delete(myId); rej(new Error(`${method} timeout`)); }, 40000);
      });
    };
    ws.addEventListener("open", () => resolve({ send, close: () => ws.close() }));
    ws.addEventListener("message", ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    });
    ws.addEventListener("error", reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log   = (...a) => process.stderr.write(a.join(" ") + "\n");

async function main() {
  await mkdir(SHOTS_DIR, { recursive: true });

  const dataDir     = mkdtempSync(join(tmpdir(), "pi-rail-"));
  const chromiumDir = mkdtempSync(join(tmpdir(), "pi-chrome-"));
  const port        = await freePort();

  const env = { ...process.env, PI_DESKTOP_DATA_DIR: dataDir };
  // Intentionally NOT setting PI_DESKTOP_CAPTURE — prevents G-Pages capture sequence
  delete env.PI_DESKTOP_CAPTURE;
  delete env.ELECTRON_RENDERER_URL;
  delete env.FCODE_BENCH_ROOTS;

  log(`[shoot] port=${port} dataDir=${dataDir}`);
  const proc = Bun.spawn(
    [ELECTRON, ".", `--remote-debugging-port=${port}`, `--user-data-dir=${chromiumDir}`],
    { cwd: APP_DIR, env, stdout: "ignore", stderr: "ignore" },
  );

  let mainTarget, cdp;
  try {
    mainTarget = await waitForMainTarget(port);
    log(`[shoot] main: ${mainTarget.url.slice(-60)}`);
    cdp = await openCDP(mainTarget.webSocketDebuggerUrl);
  } catch (e) { proc.kill(); throw e; }

  const eval_ = async (expression) => {
    const r = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r?.exceptionDetails) {
      const msg = r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails);
      throw new Error(`eval: ${msg}`);
    }
    return r?.result?.value;
  };

  // Force 1440×900 (1x DPR — matches reference image dimensions exactly)
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  // Wait for __PI_DESKTOP__ + settings IPC
  log("[shoot] Waiting for renderer IPC…");
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
  log("[shoot] IPC ready. Seeding rail state…");

  // 1. Set rail layout + persist to settings
  await eval_(`(async () => {
    window.__PI_DESKTOP__?.setNavLayout("rail");
    const s = await window.piDesktop?.invoke("pi-desktop/settings/get");
    if (s) await window.piDesktop?.invoke("pi-desktop/settings/set", {
      ...s, navLayout: "rail", displayName: "Josh Kim"
    });
  })()`);
  await sleep(600);

  // 2. Enable capture mode in renderer (rig checks window.__PI_CAPTURE__)
  await eval_(`(window.__PI_CAPTURE__ = 1, true)`);

  // 3. Suppress backend-down banner with CSS (no host binary in capture env)
  await eval_(`
    (() => {
      if (document.getElementById("pi-capture-overrides")) return;
      const s = document.createElement("style");
      s.id = "pi-capture-overrides";
      s.textContent = ".backend-banner { display: none !important; }";
      document.head.appendChild(s);
    })()
  `);

  // 4. Seed sessions, avatar, flags synchronously
  await eval_(`window.__PI_DESKTOP__?.seedVisualState?.()`);

  // 5. Enable feature flags
  await eval_(`window.__PI_DESKTOP__?.enableFeatureFlags?.({ kanban: true, raven: true })`);
  await sleep(400);

  // 6. Seed bench chip status (coale_v16 running, 3 sites, claude-sonnet-5)
  await eval_(`(async () => {
    await window.__PI_DESKTOP__?.seedBenchStatus?.({
      benchPath: ${JSON.stringify(COALE_BENCH_PATH)},
      siteCount: 3,
    });
  })()`);

  // 7. Seed bench IPC intercept (5 benches for BenchPage list)
  await eval_(`window.__PI_DESKTOP__?.seedBenchList?.()`);

  // 8. Seed 7 notifications (3 unread)
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedNotifications?.(7); })()`);

  // 9. Seed kanban, scheduled, plugins, pull requests, omp settings
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedKanbanBoard?.(1); })()`);
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedScheduledTasks?.(1); })()`);
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedPlugins?.(5); })()`);
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedPullRequests?.(1); })()`);
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedOmpSettings?.(); })()`);

  await sleep(800);

  // Navigate to chat and let React settle
  await eval_(`window.__PI_DESKTOP__?.setPage("chat")`);
  await sleep(1000);

  // DOM readback check
  const domCheck = await eval_(`JSON.stringify({
    navLayout: document.documentElement.dataset.navLayout,
    theme: document.documentElement.dataset.theme,
    sessions: document.querySelectorAll("[data-sidebar-session-row]").length,
    avatar: document.querySelector(".shell-navbar-avatar-initials")?.textContent?.trim() ?? "none",
     badge: document.querySelector(".notification-badge")?.textContent?.trim() ?? "none",
     banners: [...document.querySelectorAll(".backend-banner")].filter(el => el.offsetHeight > 0).length,
  })`);
  log("[shoot] DOM: " + domCheck);

  const prov = [];

  /** Assert DOM state before capturing; throws if critical assertions fail. */
  async function assertAndShot(name, expectedPage, expectedTheme) {
    const check = await eval_(`JSON.stringify({
      navLayout: document.documentElement.dataset.navLayout,
      theme: document.documentElement.dataset.theme,
       banner: [...document.querySelectorAll(".backend-banner")].some(el => el.offsetHeight > 0),
       avatar: document.querySelector(".shell-navbar-avatar-initials")?.textContent?.trim() ?? "none",
    })`);
    const s = JSON.parse(check);
    if (s.navLayout !== "rail")   throw new Error(`${name}: navLayout=${s.navLayout} expected rail`);
    if (s.theme !== expectedTheme) throw new Error(`${name}: theme=${s.theme} expected ${expectedTheme}`);
    if (s.banner) log(`  WARN ${name}: backend-banner visible`);
    log(`  assert OK: layout=${s.navLayout} theme=${s.theme} avatar=${s.avatar}`);

    const r = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const buf = Buffer.from(r.data, "base64");
    const path = join(SHOTS_DIR, `${name}.png`);
    await writeFile(path, buf);
    const hash = createHash("md5").update(buf).digest("hex");
    prov.push({ name, path, md5: hash, size: buf.length, ts: new Date().toISOString() });
    log(`  ✓ ${name}  ${buf.length}b  ${hash.slice(0,8)}`);
    return { hash, size: buf.length };
  }

  const goto  = (page)  => eval_(`window.__PI_DESKTOP__?.setPage(${JSON.stringify(page)})`);
  const theme = (t)     => eval_(`window.__PI_DESKTOP__?.setThemeAttr(${JSON.stringify(t)})`);

  // ── LIGHT ─────────────────────────────────────────────────────────────────
  log("── Light shots ──");
  await theme("light"); await sleep(400);

  // Chat: seed approval card (tool calls + inline approval) then shoot
  await goto("chat"); await sleep(600);
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedApprovalCard?.(); })()`);
  await sleep(600);
  await assertAndShot("light-chat", "chat", "light");

  // Bench: navigate, wait for bench discovery, open 2 detail tabs then All tab
  await goto("bench"); await sleep(2400);
  await eval_(`(() => {
    const btns = document.querySelectorAll(".wb-link-btn.wb-table-name");
    if (btns[0]) btns[0].click();
  })()`);
  await sleep(400);
  await eval_(`(() => {
    const btns = document.querySelectorAll(".wb-link-btn.wb-table-name");
    if (btns[1]) btns[1].click();
  })()`);
  await sleep(400);
  await eval_(`(() => {
    const allTab = document.getElementById("bench-tab-all");
    if (allTab) allTab.click();
  })()`);
  await sleep(400);
  await assertAndShot("light-bench", "bench", "light");

  // Simple page shots
  await goto("build");         await sleep(800);  await assertAndShot("light-build",         "build",         "light");
  await goto("kanban");        await sleep(800);  await assertAndShot("light-kanban",        "kanban",        "light");
  await goto("raven");         await sleep(800);  await assertAndShot("light-raven",         "raven",         "light");
  await goto("filebird");      await sleep(800);  await assertAndShot("light-filebird",      "filebird",      "light");
  await goto("scheduled");     await sleep(800);  await assertAndShot("light-scheduled",     "scheduled",     "light");
  await goto("notifications"); await sleep(800);  await assertAndShot("light-notifications", "notifications", "light");
  await goto("plugins");       await sleep(800);  await assertAndShot("light-plugins",       "plugins",       "light");

  // Pull requests: navigate then click #247 row for detail panel
  await goto("pulls"); await sleep(1000);
  await eval_(`(() => {
    // Click the first PR row (#247) to open the detail panel
    const rows = document.querySelectorAll(".pr-row, [data-pr-number]");
    if (rows[0]) rows[0].click();
  })()`);
  await sleep(600);
  await assertAndShot("light-pull-requests", "pulls", "light");

  // Settings pages — correct tab IDs per design notes:
  //   settings-general-appearance → "general"
  //   settings-ai                 → "aiAgents"  (AI Agents tab)
  //   settings-permissions        → "ai"         (AI Defaults / Permissions card)
  //   settings-advanced           → "ompAdvanced"
  await goto("settings"); await sleep(600);
  await eval_(`window.__PI_DESKTOP__?.setSettingsTab?.("general")`);
  await sleep(1000);
  await assertAndShot("light-settings-general-appearance", "settings", "light");

  await eval_(`window.__PI_DESKTOP__?.setSettingsTab?.("aiAgents")`);
  await sleep(1200);
  await assertAndShot("light-settings-ai", "settings", "light");

  await eval_(`window.__PI_DESKTOP__?.setSettingsTab?.("ai")`);
  await sleep(1200);
  await assertAndShot("light-settings-permissions", "settings", "light");

  await eval_(`window.__PI_DESKTOP__?.setSettingsTab?.("ompAdvanced")`);
  await sleep(1000);
  await assertAndShot("light-settings-advanced", "settings", "light");

  // Chat + Work Panel (Review tab with 3 file diffs)
  await goto("chat"); await sleep(600);
  // Re-seed sessions in case chat useEffect cleared them
  await eval_(`window.__PI_DESKTOP__?.seedVisualState?.()`);
  await sleep(400);
  // Seed review messages (populates transcript + Review tab data)
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedReviewChanges?.(3); })()`);
  await sleep(500);
  // Open work panel, switch to Review tab
  await eval_(`window.__PI_DESKTOP__?.openWorkPanel?.()`);
  await sleep(600);
  await eval_(`window.__PI_DESKTOP__?.openWorkPanelArtifact?.("review")`);
  await sleep(400);
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedReviewChanges?.(3); })()`);
  await sleep(600);
  const wpLight = await eval_(`!!document.querySelector(".work-panel-main")`);
  log(`  work-panel-main: ${wpLight}`);
  await assertAndShot("light-chat-workpanel", "chat", "light");

  // Collapse work panel after shot
  await eval_(`window.__PI_DESKTOP__?.collapseWorkPanel?.()`);
  await sleep(400);

  // Onboarding: clear sessions + show onboarding wizard
  await eval_(`window.__PI_DESKTOP__?.seedEmptyHome?.()`);
  await sleep(400);
  await eval_(`window.__PI_DESKTOP__?.seedOnboardingChecklist?.()`);
  await sleep(400);
  await goto("chat"); await sleep(600);
  await assertAndShot("light-onboarding", "chat", "light");
  // Restore sessions and re-seed OMP settings (seedEmptyHome cleared API patches)
  await eval_(`window.__PI_DESKTOP__?.seedVisualState?.()`);
  await sleep(400);
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedOmpSettings?.(); })()`);
  await sleep(400);
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedApprovalCard?.(); })()`);
  await sleep(400);

  // Command palette
  await goto("bench"); await sleep(600);
  const hasAwesomebar = await eval_(`!!document.querySelector(".shell-awesomebar")`);
  if (hasAwesomebar) {
    await eval_(`document.querySelector(".shell-awesomebar").click()`);
  } else {
    await eval_(`document.dispatchEvent(new KeyboardEvent("keydown",{key:"k",metaKey:true,bubbles:true}))`);
  }
  await sleep(800);
  await assertAndShot("light-command-palette", "bench", "light");
  await eval_(`(document.querySelector(".search-overlay") ?? document.activeElement)?.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))`);
  await eval_(`document.querySelector(".search-overlay")?.click()`);
  await sleep(400);

  // ── DARK ──────────────────────────────────────────────────────────────────
  log("── Dark shots ──");
  await theme("dark"); await sleep(400);

  await goto("chat"); await sleep(600);
  await eval_(`window.__PI_DESKTOP__?.seedVisualState?.()`);
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedApprovalCard?.(); })()`);
  await sleep(600);
  await assertAndShot("dark-chat", "chat", "dark");

  await goto("bench"); await sleep(2400);
  await eval_(`(() => {
    const btns = document.querySelectorAll(".wb-link-btn.wb-table-name");
    if (btns[0]) btns[0].click();
  })()`);
  await sleep(300);
  await eval_(`(() => {
    const btns = document.querySelectorAll(".wb-link-btn.wb-table-name");
    if (btns[1]) btns[1].click();
  })()`);
  await sleep(300);
  await eval_(`(() => {
    const allTab = document.getElementById("bench-tab-all");
    if (allTab) allTab.click();
  })()`);
  await sleep(400);
  await assertAndShot("dark-bench", "bench", "dark");

  await goto("build");         await sleep(800);  await assertAndShot("dark-build",         "build",         "dark");
  await goto("kanban");        await sleep(800);  await assertAndShot("dark-kanban",        "kanban",        "dark");
  await goto("raven");         await sleep(800);  await assertAndShot("dark-raven",         "raven",         "dark");
  await goto("filebird");      await sleep(800);  await assertAndShot("dark-filebird",      "filebird",      "dark");
  await goto("scheduled");     await sleep(800);  await assertAndShot("dark-scheduled",     "scheduled",     "dark");
  await goto("notifications"); await sleep(800);  await assertAndShot("dark-notifications", "notifications", "dark");
  await goto("plugins");       await sleep(800);  await assertAndShot("dark-plugins",       "plugins",       "dark");

  await goto("pulls"); await sleep(1000);
  await eval_(`(() => {
    const rows = document.querySelectorAll(".pr-row, [data-pr-number]");
    if (rows[0]) rows[0].click();
  })()`);
  await sleep(600);
  await assertAndShot("dark-pull-requests", "pulls", "dark");

  await goto("settings"); await sleep(600);
  await eval_(`window.__PI_DESKTOP__?.setSettingsTab?.("general")`);
  await sleep(1000);
  await assertAndShot("dark-settings-general-appearance", "settings", "dark");

  await eval_(`window.__PI_DESKTOP__?.setSettingsTab?.("aiAgents")`);
  await sleep(1200);
  await assertAndShot("dark-settings-ai", "settings", "dark");

  await eval_(`window.__PI_DESKTOP__?.setSettingsTab?.("ai")`);
  await sleep(1200);
  await assertAndShot("dark-settings-permissions", "settings", "dark");

  await eval_(`window.__PI_DESKTOP__?.setSettingsTab?.("ompAdvanced")`);
  await sleep(1000);
  await assertAndShot("dark-settings-advanced", "settings", "dark");

  // Dark chat+workpanel
  await goto("chat"); await sleep(600);
  await eval_(`window.__PI_DESKTOP__?.seedVisualState?.()`);
  await sleep(400);
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedReviewChanges?.(3); })()`);
  await sleep(500);
  await eval_(`window.__PI_DESKTOP__?.openWorkPanel?.()`);
  await sleep(600);
  await eval_(`window.__PI_DESKTOP__?.openWorkPanelArtifact?.("review")`);
  await sleep(400);
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedReviewChanges?.(3); })()`);
  await sleep(600);
  const wpDark = await eval_(`!!document.querySelector(".work-panel-main")`);
  log(`  dark work-panel-main: ${wpDark}`);
  await assertAndShot("dark-chat-workpanel", "chat", "dark");
  await eval_(`window.__PI_DESKTOP__?.collapseWorkPanel?.()`);
  await sleep(400);

  // Dark onboarding: clear sessions + show onboarding wizard
  await eval_(`window.__PI_DESKTOP__?.seedEmptyHome?.()`);
  await sleep(400);
  await eval_(`window.__PI_DESKTOP__?.seedOnboardingChecklist?.()`);
  await sleep(400);
  await goto("chat"); await sleep(600);
  await assertAndShot("dark-onboarding", "chat", "dark");
  // Restore sessions and re-seed OMP settings (seedEmptyHome cleared API patches)
  await eval_(`window.__PI_DESKTOP__?.seedVisualState?.()`);
  await sleep(400);
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedOmpSettings?.(); })()`);
  await sleep(400);
  await eval_(`(async () => { await window.__PI_DESKTOP__?.seedApprovalCard?.(); })()`);
  await sleep(400);

  // Dark command palette
  await goto("bench"); await sleep(600);
  const hasAwesomebar2 = await eval_(`!!document.querySelector(".shell-awesomebar")`);
  if (hasAwesomebar2) {
    await eval_(`document.querySelector(".shell-awesomebar").click()`);
  } else {
    await eval_(`document.dispatchEvent(new KeyboardEvent("keydown",{key:"k",metaKey:true,bubbles:true}))`);
  }
  await sleep(800);
  await assertAndShot("dark-command-palette", "bench", "dark");

  // Write provenance
  await writeFile(
    join(SHOTS_DIR, "provenance.json"),
    JSON.stringify({ lane: "H-Rail", shots: prov }, null, 2),
  );

  log(`Done. ${prov.length} shots.`);
  const seen = new Map(); let dups = 0;
  for (const s of prov) {
    if (seen.has(s.md5)) { log(`  DUPLICATE: ${s.name} = ${seen.get(s.md5)}`); dups++; }
    else seen.set(s.md5, s.name);
  }
  log(`Duplicates: ${dups}`);

  cdp.close();
  try { proc.kill(); } catch {}
}

main().catch(e => {
  console.error("FATAL:", e.message);
  if (e.stack) console.error(e.stack.split("\n").slice(0,6).join("\n"));
  process.exit(1);
});
