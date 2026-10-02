#!/usr/bin/env node
/**
 * Kanban-only visual verification — light+dark, 1280×800 only.
 * Output: /tmp/kanban-shots/<name>.png
 */
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(__dirname, "../..");
const RENDERER_DIR = join(REPO, "apps/desktop/out/renderer");
const SHOTS_DIR = process.env.UI_VERIFY_SHOTS ?? "/tmp/kanban-shots";
const CHROME_EXEC =
  "/Users/mac/Library/Caches/ms-playwright/chromium-1208/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const MOCK_API_PATH = join(__dirname, "mock-api.mjs");

mkdirSync(SHOTS_DIR, { recursive: true });

const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".woff": "font/woff", ".ttf": "font/ttf",
};

function startServer(dir) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let urlPath = req.url.split("?")[0];
      if (urlPath === "/" || urlPath === "") urlPath = "/index.html";
      const file = join(dir, urlPath);
      const mime = MIME[extname(file)] ?? "application/octet-stream";
      try {
        let content = readFileSync(file);
        if (urlPath === "/index.html") {
          let html = content.toString();
          html = html.replace("connect-src 'self';", "connect-src *;");
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
          return;
        }
        res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
        res.end(content);
      } catch { res.writeHead(404); res.end("not found"); }
    });
    server.listen(0, "127.0.0.1", () => { resolve({ server, port: server.address().port }); });
  });
}

const MOCK_SCRIPT = readFileSync(MOCK_API_PATH, "utf8")
  .replace(/^export\s+/gm, "")
  .replace(/^import\s+.+?from\s+['"].+?['"];?\s*$/gm, "");

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.crashes = [];
  await page.addInitScript(`
    window.__MOCK_MEMORY_STATE__ = "active";
    window.__PI_CAPTURE__ = true;
    ${MOCK_SCRIPT}
  `);
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("mock] unhandled") && !text.includes("ResizeObserver")) {
        console.error("[renderer]", text.slice(0, 200));
        if (text.startsWith("UI crash")) page.crashes.push(text);
      }
    }
  });
  page.on("pageerror", (err) => {
    console.error("[pageerror]", err.message);
    page.crashes.push(err.message);
  });
  return page;
}

async function waitReady(page) {
  await page.waitForFunction(() =>
    window.__PI_DESKTOP__ != null &&
    (document.querySelector(".nav-rail") != null ||
     document.querySelector('[class*="app-shell"]') != null ||
     document.querySelector("main") != null),
    { timeout: 12000 }
  ).catch(() => console.warn("waitReady timed out"));
  await page.waitForTimeout(500);
}

async function shot(page, name) {
  await page.waitForTimeout(300);
  const path = join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`  📸 ${name}`);
  if (page.crashes.length) throw new Error(`crash: ${page.crashes[0]}`);
  return path;
}

async function run() {
  const { server, port } = await startServer(RENDERER_DIR);
  const BASE = `http://127.0.0.1:${port}`;
  console.log(`Serving renderer at ${BASE}`);

  const browser = await chromium.launch({
    executablePath: CHROME_EXEC,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const results = [];

  for (const theme of ["dark", "light"]) {
    for (const [name, fn] of [
      ["kanban-board", async (page, label) => {
        await page.evaluate(() => window.__PI_DESKTOP__?.setPage("kanban"));
        await page.waitForTimeout(900);
        return shot(page, label);
      }],
      ["settings-kanban", async (page, label) => {
        await page.evaluate(() => {
          window.__PI_DESKTOP__?.setPage("settings");
          window.__PI_DESKTOP__?.setSettingsTab("kanban");
        });
        await page.waitForTimeout(600);
        return shot(page, label);
      }],
    ]) {
      const label = `${name}-${theme}-1280x800`;
      console.log(`\n▶ ${label}`);
      let page;
      try {
        page = await newPage(browser);
        await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 15000 });
        await waitReady(page);
        await page.evaluate((t) => window.__PI_DESKTOP__?.setThemeAttr(t), theme);
        await page.waitForTimeout(150);
        const screenshotPath = await fn(page, label);
        results.push({ label, status: "ok", path: screenshotPath });
      } catch (err) {
        console.error(`  ✗ ${label}: ${err.message}`);
        results.push({ label, status: "defect", error: err.message.slice(0, 120) });
      } finally {
        await page?.close().catch(() => {});
      }
    }
  }

  await browser.close();
  server.close();

  console.log("\n── Results ──");
  for (const r of results) {
    const icon = r.status === "ok" ? "✓" : "✗";
    console.log(`${icon} ${r.label}${r.error ? `: ${r.error}` : ""}`);
  }

  const defects = results.filter((r) => r.status === "defect");
  process.exit(defects.length > 0 ? 1 : 0);
}

run().catch((err) => { console.error(err); process.exit(1); });
