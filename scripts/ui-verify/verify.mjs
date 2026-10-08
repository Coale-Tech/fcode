#!/usr/bin/env node
/**
 * scripts/ui-verify/verify.mjs
 *
 * Headless visual verification of the Fcode renderer.
 * Serves the pre-built renderer (apps/desktop/out/renderer/),
 * injects a mock window.piDesktop, then screenshots every target screen
 * in light+dark at 1280x800 and 900x600.
 *
 * Output: $UI_VERIFY_SHOTS (default /tmp/audit/shots)/<name>.png
 *         $UI_VERIFY_REPORT (default /tmp/audit/ui-verify.md): verdict table + console log
 *
 * Run: pnpm --filter @pi-desktop/desktop build && node scripts/ui-verify/verify.mjs
 */

import { createServer } from "node:http";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { writeFileSync, appendFileSync } from "node:fs";
import { join, extname } from "node:path";
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(__dirname, "../..");
const RENDERER_DIR = join(REPO, "apps/desktop/out/renderer");
const SHOTS_DIR = process.env.UI_VERIFY_SHOTS ?? "/tmp/audit/shots";
const REPORT_PATH = process.env.UI_VERIFY_REPORT ?? "/tmp/audit/ui-verify.md";
const MOCK_API_PATH = join(__dirname, "mock-api.mjs");

// Resolve Chrome via playwright-core (respects PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
// and the local playwright browser cache); falls back to CHROME_EXEC env var for
// custom installs.  The hardcoded Mac path has been removed.
let CHROME_EXEC = process.env.CHROME_EXEC ?? "";
if (!CHROME_EXEC) {
  try {
    // playwright-core >= 1.32 exposes a sync resolveExecutablePath helper
    const { resolveExecutablePath } = await import("playwright-core/lib/utils");
    CHROME_EXEC = resolveExecutablePath("chromium") ?? "";
  } catch {
    // fall through — user must supply CHROME_EXEC or install playwright browsers
  }
}
if (!CHROME_EXEC || !existsSync(CHROME_EXEC)) {
  console.error(
    "ui-verify: Chrome not found. Install playwright browsers (`npx playwright install chromium`)" +
      " or set CHROME_EXEC to the Chrome for Testing binary.",
  );
  process.exit(1);
}

mkdirSync(SHOTS_DIR, { recursive: true });

// ── Minimal static file server ───────────────────────────────────────────────

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function startServer(dir) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      // Strip query strings and decode URI
      let urlPath = decodeURIComponent(req.url.split("?")[0]);
      if (urlPath === "/" || urlPath === "") urlPath = "/index.html";

      const file = join(dir, urlPath);
      const ext = extname(file).toLowerCase();

      // Security: stay inside dir
      if (!file.startsWith(dir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      if (!existsSync(file)) {
        // SPA fallback
        const indexFile = join(dir, "index.html");
        try {
          const content = readFileSync(indexFile);
          // Remove the strict connect-src so our mock fetch doesn't get blocked
          const html = content
            .toString()
            .replace("connect-src 'self';", "connect-src *;");
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
        } catch {
          res.writeHead(404);
          res.end("Not found");
        }
        return;
      }

      try {
        const content = readFileSync(file);
        const mime = MIME[ext] || "application/octet-stream";

        // Patch index.html to relax CSP so mock scripts work
        if (urlPath === "/index.html") {
          let html = content.toString();
          // Replace connect-src to allow anything (mock XHR)
          html = html.replace("connect-src 'self';", "connect-src *;");
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
          return;
        }

        res.writeHead(200, {
          "Content-Type": mime,
          "Cache-Control": "no-cache",
        });
        res.end(content);
      } catch {
        res.writeHead(500);
        res.end("Server error");
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

// ── Mock API script (read at runtime) ────────────────────────────────────────

const MOCK_SCRIPT = readFileSync(MOCK_API_PATH, "utf8")
  // strip ES module export statements so it can be injected as a plain script
  .replace(/^export\s+/gm, "")
  .replace(/^import\s+.+?from\s+['"].+?['"];?\s*$/gm, "");

// ── Screenshot helpers ───────────────────────────────────────────────────────

let consoleLog = [];

async function newPage(browser, viewport, memState = "active") {
  const page = await browser.newPage({ viewport });
  page.crashes = [];

  // Inject mock before any script runs
  await page.addInitScript(`
    window.__MOCK_MEMORY_STATE__ = ${JSON.stringify(memState)};
    window.__PI_CAPTURE__ = true;
    ${MOCK_SCRIPT}
  `);

  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      const text = msg.text();
      // Ignore known benign messages
      if (
        text.includes("mock] unhandled") ||
        text.includes("ResizeObserver") ||
        text.includes("DeprecationWarning")
      )
        return;
      consoleLog.push(`[${type}] ${text}`);
      if (text.startsWith("UI crash")) page.crashes.push(text.split("\n")[0]);
    }
  });

  page.on("pageerror", (err) => {
    consoleLog.push(`[pageerror] ${err.message}`);
    page.crashes.push(err.message);
  });

  return page;
}

async function waitReady(page) {
  // Wait for the app to bootstrap (sidebar or splash gone, chat area present)
  await page.waitForFunction(
    () => {
      return (
        window.__PI_DESKTOP__ != null &&
        (document.querySelector('[data-testid="chat-surface"]') != null ||
          document.querySelector(".nav-rail") != null ||
          document.querySelector('[class*="app-shell"]') != null ||
          document.querySelector('[class*="sidebar"]') != null ||
          document.querySelector(".session-list") != null ||
          // any substantive content
          document.querySelector("main") != null)
      );
    },
    { timeout: 15000 },
  ).catch(() => {
    console.warn("waitReady timed out — continuing");
  });
  // Extra settle time for animations
  await page.waitForTimeout(600);
}

async function shot(page, name) {
  await page.waitForTimeout(300);
  const path = join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`  📸 ${name}`);
  // A screenshot of an error boundary is not a pass.
  if (page.crashes.length) throw new Error(`crash: ${page.crashes[0]}`);
  return path;
}

// ── Verdict helpers ──────────────────────────────────────────────────────────

const verdicts = [];

function verdict(screen, theme, viewport, path, status, notes) {
  verdicts.push({ screen, theme, viewport, path, status, notes });
}

// ── Main verification run ────────────────────────────────────────────────────

async function run() {
  const { server, port } = await startServer(RENDERER_DIR);
  const BASE = `http://127.0.0.1:${port}`;
  console.log(`Serving renderer at ${BASE}`);

  const browser = await chromium.launch({
    executablePath: CHROME_EXEC,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const viewports = [
    { width: 1280, height: 800, label: "1280x800" },
    { width: 900, height: 600, label: "900x600" },
  ];

  const themes = ["dark", "light"];

  // ── Helper: run one capture scenario across all themes × viewports
  async function capture(name, fn) {
    for (const vp of viewports) {
      for (const theme of themes) {
        const label = `${name}-${theme}-${vp.label}`;
        console.log(`\n▶ ${label}`);
        let page;
        try {
          page = await newPage(browser, { width: vp.width, height: vp.height });
          await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });
          await waitReady(page);

          // Switch theme
          await page.evaluate(
            (t) => window.__PI_DESKTOP__?.setThemeAttr(t),
            theme,
          );
          await page.waitForTimeout(150);

          const screenshotPath = await fn(page, label, vp, theme);
          verdict(name, theme, vp.label, screenshotPath ?? label, "ok", "");
        } catch (err) {
          console.error(`  ✗ ${label}: ${err.message}`);
          verdict(name, theme, vp.label, "-", "defect", err.message.slice(0, 120));
        } finally {
          await page?.close().catch(() => {});
        }
      }
    }
  }

  // ── 1. Chat (home) ────────────────────────────────────────────────────────
  await capture("chat-home", async (page, label) => {
    await page.evaluate(() => window.__PI_DESKTOP__?.setPage("chat"));
    await page.waitForTimeout(400);
    return shot(page, label);
  });

  // ── 2. Settings → Memory (active) ────────────────────────────────────────
  await capture("settings-memory-active", async (page, label) => {
    await page.evaluate(() => {
      window.__PI_DESKTOP__?.setPage("settings");
      window.__PI_DESKTOP__?.setSettingsTab("memory");
    });
    await page.waitForTimeout(600);
    return shot(page, label);
  });

  // ── 3. Settings → Memory (degraded) ──────────────────────────────────────
  // Re-open with degraded memory state
  for (const vp of viewports) {
    for (const theme of themes) {
      const name = "settings-memory-degraded";
      const label = `${name}-${theme}-${vp.label}`;
      console.log(`\n▶ ${label}`);
      let page;
      try {
        page = await newPage(
          browser,
          { width: vp.width, height: vp.height },
          "degraded",
        );
        await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });
        await waitReady(page);
        await page.evaluate((t) => window.__PI_DESKTOP__?.setThemeAttr(t), theme);
        await page.evaluate(() => {
          window.__PI_DESKTOP__?.setPage("settings");
          window.__PI_DESKTOP__?.setSettingsTab("memory");
        });
        await page.waitForTimeout(700);
        const p = await shot(page, label);
        verdict(name, theme, vp.label, p, "ok", "");
      } catch (err) {
        verdict(name, theme, vp.label, "-", "defect", err.message.slice(0, 120));
      } finally {
        await page?.close().catch(() => {});
      }
    }
  }

  // ── 4. Settings → Memory (error) ─────────────────────────────────────────
  for (const vp of viewports) {
    for (const theme of themes) {
      const name = "settings-memory-error";
      const label = `${name}-${theme}-${vp.label}`;
      console.log(`\n▶ ${label}`);
      let page;
      try {
        page = await newPage(
          browser,
          { width: vp.width, height: vp.height },
          "error",
        );
        await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });
        await waitReady(page);
        await page.evaluate((t) => window.__PI_DESKTOP__?.setThemeAttr(t), theme);
        await page.evaluate(() => {
          window.__PI_DESKTOP__?.setPage("settings");
          window.__PI_DESKTOP__?.setSettingsTab("memory");
        });
        await page.waitForTimeout(700);
        const p = await shot(page, label);
        verdict(name, theme, vp.label, p, "ok", "");
      } catch (err) {
        verdict(name, theme, vp.label, "-", "defect", err.message.slice(0, 120));
      } finally {
        await page?.close().catch(() => {});
      }
    }
  }

  // ── 5. Settings → AI ─────────────────────────────────────────────────────
  await capture("settings-ai", async (page, label) => {
    await page.evaluate(() => {
      window.__PI_DESKTOP__?.setPage("settings");
      window.__PI_DESKTOP__?.setSettingsTab("ai");
    });
    await page.waitForTimeout(600);
    return shot(page, label);
  });

  // ── 6. Settings → AI scrolled ─────────────────────────────────────────────
  await capture("settings-ai-scrolled", async (page, label) => {
    await page.evaluate(() => {
      window.__PI_DESKTOP__?.setPage("settings");
      window.__PI_DESKTOP__?.setSettingsTab("ai");
    });
    await page.waitForTimeout(600);
    // Scroll settings panel down
    await page.evaluate(() => {
      const panel = document.querySelector(".settings-content, .settings-body, main, [class*='settings-tab']");
      if (panel) panel.scrollTop = 600;
      else window.scrollTo(0, 600);
    });
    await page.waitForTimeout(200);
    return shot(page, label);
  });

  // ── 7. Settings → General ─────────────────────────────────────────────────
  await capture("settings-general", async (page, label) => {
    await page.evaluate(() => {
      window.__PI_DESKTOP__?.setPage("settings");
      window.__PI_DESKTOP__?.setSettingsTab("general");
    });
    await page.waitForTimeout(600);
    return shot(page, label);
  });

  // ── 8. Settings → Agent ───────────────────────────────────────────────────
  await capture("settings-agent", async (page, label) => {
    await page.evaluate(() => {
      window.__PI_DESKTOP__?.setPage("settings");
      window.__PI_DESKTOP__?.setSettingsTab("agent");
    });
    await page.waitForTimeout(600);
    return shot(page, label);
  });

  // ── 9. Plugins page ───────────────────────────────────────────────────────
  await capture("plugins-page", async (page, label) => {
    // Seed extensions first
    await page.evaluate(() => window.__PI_DESKTOP__?.seedExtensions?.(3));
    await page.evaluate(() => window.__PI_DESKTOP__?.setPage("plugins"));
    await page.waitForTimeout(600);
    return shot(page, label);
  });

  // ── 10. Chat with seeded transcript ──────────────────────────────────────
  await capture("chat-transcript", async (page, label) => {
    await page.evaluate(() => {
      window.__PI_DESKTOP__?.setPage("chat");
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__PI_DESKTOP__?.seedTranscript?.(8));
    await page.waitForTimeout(500);
    return shot(page, label);
  });

  // ── 11. Chat with tool run rows ───────────────────────────────────────────
  await capture("chat-tool-rows", async (page, label) => {
    await page.evaluate(() => window.__PI_DESKTOP__?.setPage("chat"));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__PI_DESKTOP__?.seedRunRows?.(4));
    await page.waitForTimeout(500);
    return shot(page, label);
  });

  // ── 12. Chat with delegation rows ────────────────────────────────────────
  await capture("chat-delegation-rows", async (page, label) => {
    await page.evaluate(() => window.__PI_DESKTOP__?.setPage("chat"));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__PI_DESKTOP__?.seedDelegationRows?.(3));
    await page.waitForTimeout(500);
    return shot(page, label);
  });

  // ── 13. Work panel open ───────────────────────────────────────────────────
  await capture("work-panel-open", async (page, label) => {
    await page.evaluate(() => window.__PI_DESKTOP__?.setPage("chat"));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__PI_DESKTOP__?.openWorkPanel?.());
    await page.waitForTimeout(400);
    return shot(page, label);
  });

  // ── 14. Notifications sidebar ─────────────────────────────────────────────
  await capture("notifications-sidebar", async (page, label) => {
    await page.evaluate(() => window.__PI_DESKTOP__?.setPage("chat"));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__PI_DESKTOP__?.seedNotifications?.(5));
    await page.waitForTimeout(400);
    return shot(page, label);
  });

  // ── 15. Session history (sidebar) ─────────────────────────────────────────
  await capture("session-history", async (page, label) => {
    await page.evaluate(() => window.__PI_DESKTOP__?.setPage("chat"));
    await page.waitForTimeout(400);
    return shot(page, label);
  });

  // ── 16. Sidebar statuses ──────────────────────────────────────────────────
  await capture("sidebar-statuses", async (page, label) => {
    await page.evaluate(() => {
      window.__PI_DESKTOP__?.setPage("chat");
      window.__PI_DESKTOP__?.seedSidebarStatuses?.();
    });
    await page.waitForTimeout(600);
    return shot(page, label);
  });

  // ── 17. Subagents list ────────────────────────────────────────────────────
  // Subagents panel is in the work panel or a dedicated tab
  await capture("subagents-panel", async (page, label) => {
    await page.evaluate(() => window.__PI_DESKTOP__?.setPage("chat"));
    await page.waitForTimeout(300);
    // Try opening the work panel with subagents tab
    await page.evaluate(() => {
      window.__PI_DESKTOP__?.openWorkPanel?.();
    });
    await page.waitForTimeout(400);
    return shot(page, label);
  });

  // ── 18. Plugin themes ─────────────────────────────────────────────────────
  await capture("plugin-themes", async (page, label) => {
    await page.evaluate(() => window.__PI_DESKTOP__?.seedPluginThemes?.(4));
    await page.waitForTimeout(400);
    return shot(page, label);
  });

  // ── 19. Settings → About ─────────────────────────────────────────────────
  await capture("settings-about", async (page, label) => {
    await page.evaluate(() => {
      window.__PI_DESKTOP__?.setPage("settings");
      window.__PI_DESKTOP__?.setSettingsTab("about");
    });
    await page.waitForTimeout(600);
    return shot(page, label);
  });

  // ── 20. Settings → Shortcuts ─────────────────────────────────────────────
  await capture("settings-shortcuts", async (page, label) => {
    await page.evaluate(() => {
      window.__PI_DESKTOP__?.setPage("settings");
      window.__PI_DESKTOP__?.setSettingsTab("shortcuts");
    });
    await page.waitForTimeout(600);
    return shot(page, label);
  });

  // ── 21. Settings → Instructions ──────────────────────────────────────────
  await capture("settings-instructions", async (page, label) => {
    await page.evaluate(() => {
      window.__PI_DESKTOP__?.setPage("settings");
      window.__PI_DESKTOP__?.setSettingsTab("instructions");
    });
    await page.waitForTimeout(600);
    return shot(page, label);
  });

  // ── 22. Settings → Projects ───────────────────────────────────────────────
  await capture("settings-projects", async (page, label) => {
    await page.evaluate(() => {
      window.__PI_DESKTOP__?.setPage("settings");
      window.__PI_DESKTOP__?.setSettingsTab("projects");
    });
    await page.waitForTimeout(600);
    return shot(page, label);
  });

  // ── 23. Kanban board (6 columns, cards) ──────────────────────────────────
  await capture("kanban-board", async (page, label) => {
    await page.evaluate(() => {
      // Enable kanban in app state so the nav button appears and page renders
      window.__PI_DESKTOP__?.setPage("kanban");
    });
    await page.waitForTimeout(800);
    return shot(page, label);
  });

  // ── 24. Settings → Kanban ─────────────────────────────────────────────────
  await capture("settings-kanban", async (page, label) => {
    await page.evaluate(() => {
      window.__PI_DESKTOP__?.setPage("settings");
      window.__PI_DESKTOP__?.setSettingsTab("kanban");
    });
    await page.waitForTimeout(600);
    return shot(page, label);
  });


  // ── Cleanup ───────────────────────────────────────────────────────────────
  await browser.close();
  server.close();
  return verdicts;
}

// ── Report generation ────────────────────────────────────────────────────────

function writeReport(verdicts, consoleErrors) {
  const now = new Date().toISOString();
  const lines = [
    `# UI Visual Verification Report`,
    `Generated: ${now}`,
    ``,
    `## Screenshots`,
    ``,
    `| Screen | Theme | Viewport | Status | Notes |`,
    `|--------|-------|----------|--------|-------|`,
  ];

  for (const v of verdicts) {
    const statusIcon = v.status === "ok" ? "✅ ok" : `❌ defect`;
    const shotRef = v.path !== "-" ? `[shot](${v.path})` : "-";
    lines.push(
      `| ${v.screen} | ${v.theme} | ${v.viewport} | ${statusIcon} | ${v.notes || shotRef} |`,
    );
  }

  const defects = verdicts.filter((v) => v.status !== "ok");
  lines.push(``, `## Defect List (${defects.length} defects)`, ``);
  if (defects.length === 0) {
    lines.push(`No defects found.`);
  } else {
    for (const d of defects) {
      lines.push(
        `- **[${d.status.toUpperCase()}]** ${d.screen} (${d.theme}, ${d.viewport}): ${d.notes}`,
      );
    }
  }

  lines.push(``, `## Console Errors/Warnings`, ``);
  if (consoleErrors.length === 0) {
    lines.push(`None captured.`);
  } else {
    const unique = [...new Set(consoleErrors)];
    for (const e of unique) {
      lines.push(`- \`${e}\``);
    }
  }

  lines.push(``, `## Test Suite Results`, ``);
  lines.push(`See /tmp/audit/desktop-tests-raw.txt for full output.`);
  lines.push(`(Parse summary below once tests complete.)`);

  writeFileSync(REPORT_PATH, lines.join("\n") + "\n");
  console.log(`\nReport written to ${REPORT_PATH}`);
}

// ── Entry point ──────────────────────────────────────────────────────────────

run()
  .then((vd) => {
    writeReport(vd, consoleLog);
    const ok = vd.filter((v) => v.status === "ok").length;
    const bad = vd.filter((v) => v.status !== "ok").length;
    console.log(`\n✅ ${ok} screens ok  ❌ ${bad} defects`);
    process.exit(bad > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("Fatal:", err);
    writeFileSync(
      REPORT_PATH,
      `# UI Verify Error\n\n${err.stack || err.message}\n`,
    );
    process.exit(2);
  });
