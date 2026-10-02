#!/usr/bin/env node
/**
 * scripts/ui-verify/settings-parity.mjs
 *
 * Raven ↔ Fcode settings parity check.
 * Builds on the existing scripts/ui-verify/{verify,mock-api}.mjs infrastructure.
 *
 * MODE A — Renderer (preferred): serves the pre-built renderer, opens Settings
 *   under the mock API, dumps computed styles for each mapped element, and
 *   compares against expected Raven reference values from settings-element-map.mjs.
 *   Requires: apps/desktop/out/renderer/ (run `pnpm build` first).
 *
 * MODE B — CSS source (fallback): reads the compiled CSS from src/styles/ and
 *   extracts property values via regex.  Does not require a renderer build.
 *   Emits a partial baseline (compiled-style values only, no computed-style
 *   inheritance or theme resolution).
 *
 * Raven login: no authenticated session is available on the coaletecherp bench,
 * so panel-level parity (Raven vs Fcode computed styles) is UNPROVEN. The
 * expected values in settings-element-map.mjs come from reading Raven source
 * (components/ui/*.tsx, settings-dialog.tsx, espresso-*.css) directly.
 *
 * Run:
 *   # Mode A (after build):
 *   node scripts/ui-verify/settings-parity.mjs
 *
 *   # Mode B (CSS only, no build needed):
 *   PARITY_CSS_ONLY=1 node scripts/ui-verify/settings-parity.mjs
 *
 * Output:
 *   stdout: mismatch table (Markdown)
 *   $PARITY_SHOTS (default /tmp/parity/shots): light + dark screenshots per tab
 *   $PARITY_REPORT (default /tmp/parity/settings-parity.md): full report
 */

import { createServer } from "node:http";
import { readFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(__dirname, "../..");
const RENDERER_DIR = join(REPO, "apps/desktop/out/renderer");
const SHOTS_DIR = process.env.PARITY_SHOTS ?? "/tmp/parity/shots";
const REPORT_PATH = process.env.PARITY_REPORT ?? "/tmp/parity/settings-parity.md";
const CSS_ONLY = process.env.PARITY_CSS_ONLY === "1";

mkdirSync(SHOTS_DIR, { recursive: true });
mkdirSync(dirname(REPORT_PATH), { recursive: true });

// Chrome for Testing path (must match verify.mjs)
const CHROME_EXEC =
  "/Users/mac/Library/Caches/ms-playwright/chromium-1208/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

// ── Import element map ──────────────────────────────────────────────────────

const { SETTINGS_ELEMENT_MAP, DUMP_PROPERTIES } = await import(
  new URL("./settings-element-map.mjs", import.meta.url)
);

// ── MODE B: CSS source analysis ─────────────────────────────────────────────

/**
 * Resolve a selector's property value from the raw CSS text by finding the
 * first matching rule block and extracting the property.
 * Returns undefined when not found; handles :root custom properties.
 */
function cssExtract(css, selector, property) {
  // Escape special chars in selector for use in regex
  const selectorRe = selector
    .replace(/[.[\]()*+?^${}|\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const blockRe = new RegExp(
    selectorRe + "\\s*\\{([^}]*)\\}",
    "s",
  );
  const block = blockRe.exec(css);
  if (!block) return undefined;
  const propRe = new RegExp(
    property.replace(/-/g, "-") + "\\s*:\\s*([^;]+);",
  );
  const match = propRe.exec(block[1]);
  return match ? match[1].trim() : undefined;
}

/** Resolve a CSS custom property from the :root block. */
function resolveCssVar(css, varName) {
  const rootBlockRe = /:root\s*\{([^}]*)\}/gs;
  let m;
  while ((m = rootBlockRe.exec(css)) !== null) {
    const propRe = new RegExp(
      varName.replace(/[[\]()*+?^${}|\\]/g, "\\$&") + "\\s*:\\s*([^;]+);",
    );
    const match = propRe.exec(m[1]);
    if (match) return match[1].trim();
  }
  return undefined;
}

async function runCssMode() {
  // Load the full stylesheet (same as styles.mjs loadStyles)
  const ENTRY = join(REPO, "apps/desktop/src/styles/globals.css");
  const entry = readFileSync(ENTRY, "utf8");
  const IMPORT_RE = /^@import "\.\/([A-Za-z0-9-]+\.css)";$/gm;
  const names = [...entry.matchAll(IMPORT_RE)].map((m) => m[1]);
  let css = entry;
  for (const name of names) {
    const content = readFileSync(join(REPO, "apps/desktop/src/styles", name), "utf8");
    css = css.replace(`@import "./${name}";`, content);
  }

  const mismatches = [];
  const ok = [];

  for (const entry of SETTINGS_ELEMENT_MAP) {
    if (entry.exception) {
      ok.push({ id: entry.id, label: entry.label, status: "EXCEPTION", note: entry.exception });
      continue;
    }

    for (const [prop, expectedRaw] of Object.entries(entry.expected)) {
      // For CSS source mode, we look for the property in the matching block.
      // We also try to resolve CSS variable references one level deep.
      let actual = cssExtract(css, entry.selector, prop);

      // If the actual is a var(), try to resolve one hop
      if (actual?.startsWith("var(")) {
        const varName = actual.match(/var\((--[^,)]+)/)?.[1];
        if (varName) {
          const resolved = resolveCssVar(css, varName);
          if (resolved) actual = `${actual} → ${resolved}`;
        }
      }

      if (actual === undefined) {
        mismatches.push({
          id: entry.id,
          label: entry.label,
          selector: entry.selector,
          property: prop,
          expected: expectedRaw,
          actual: "(rule not found in CSS)",
          mode: "css",
        });
      } else {
        // Loose numeric comparison: strip px, compare as numbers when both are numeric
        const expNum = parseFloat(expectedRaw);
        const actRaw = actual.split("→").pop().trim();
        const actNum = parseFloat(actRaw);
        const numericMatch =
          !isNaN(expNum) && !isNaN(actNum) && Math.abs(expNum - actNum) < 0.5;
        const exactMatch = actRaw === expectedRaw || actual === expectedRaw;

        if (!numericMatch && !exactMatch) {
          mismatches.push({
            id: entry.id,
            label: entry.label,
            selector: entry.selector,
            property: prop,
            expected: expectedRaw,
            actual,
            mode: "css",
          });
        } else {
          ok.push({ id: entry.id, label: entry.label, property: prop, status: "OK" });
        }
      }
    }
  }

  return { mismatches, ok, mode: "css-source" };
}

// ── MODE A: Renderer computed-style analysis ─────────────────────────────────

const MIME = {
  ".html": "text/html", ".js": "application/javascript",
  ".mjs": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
  ".webp": "image/webp", ".gif": "image/gif",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
};

function startServer(dir) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split("?")[0]);
      if (urlPath === "/" || urlPath === "") urlPath = "/index.html";
      const file = join(dir, urlPath);
      const ext = extname(file).toLowerCase();
      if (!file.startsWith(dir)) { res.writeHead(403); res.end("Forbidden"); return; }
      if (!existsSync(file)) {
        try {
          let html = readFileSync(join(dir, "index.html")).toString()
            .replace("connect-src 'self';", "connect-src *;");
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
        } catch { res.writeHead(404); res.end("Not found"); }
        return;
      }
      try {
        const content = readFileSync(file);
        if (urlPath === "/index.html") {
          let html = content.toString().replace("connect-src 'self';", "connect-src *;");
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
        res.end(content);
      } catch { res.writeHead(500); res.end("Server error"); }
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

const MOCK_API_PATH = join(__dirname, "mock-api.mjs");
const MOCK_SCRIPT = readFileSync(MOCK_API_PATH, "utf8")
  .replace(/^export\s+/gm, "")
  .replace(/^import\s+.+?from\s+['"].+?['"];?\s*$/gm, "");

async function runRendererMode() {
  const { chromium } = await import("playwright-core");

  const { server, port } = await startServer(RENDERER_DIR);
  const BASE = `http://127.0.0.1:${port}`;
  console.log(`Serving renderer at ${BASE}`);

  const browser = await chromium.launch({
    executablePath: CHROME_EXEC,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const mismatches = [];
  const ok = [];
  const shots = [];

  const themes = ["light", "dark"];
  const tabs = ["general", "ai", "memory", "agent", "shortcuts", "about"];

  for (const theme of themes) {
    // Open one page per theme for screenshots
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(`
      window.__MOCK_MEMORY_STATE__ = "active";
      window.__PI_CAPTURE__ = true;
      ${MOCK_SCRIPT}
    `);
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });

    // Wait for React to hydrate
    await page.waitForFunction(() => !!window.__PI_DESKTOP__, { timeout: 10000 });
    await page.evaluate((t) => window.__PI_DESKTOP__?.setThemeAttr(t), theme);
    await page.waitForTimeout(200);

    // Navigate to settings
    await page.evaluate(() => {
      window.__PI_DESKTOP__?.setPage("settings");
      window.__PI_DESKTOP__?.setSettingsTab("general");
    });
    await page.waitForTimeout(600);

    // Take screenshots of each tab
    for (const tab of tabs) {
      await page.evaluate((t) => window.__PI_DESKTOP__?.setSettingsTab(t), tab);
      await page.waitForTimeout(400);
      const shotPath = join(SHOTS_DIR, `settings-${tab}-${theme}.png`);
      await page.screenshot({ path: shotPath });
      shots.push(shotPath);
      console.log(`  📸 settings-${tab}-${theme}`);
    }

    // Computed-style dump for element map
    for (const entry of SETTINGS_ELEMENT_MAP) {
      if (entry.exception) continue;

      // Navigate to a tab where the element should be visible
      await page.evaluate(() => {
        window.__PI_DESKTOP__?.setPage("settings");
        window.__PI_DESKTOP__?.setSettingsTab("general");
      });
      await page.waitForTimeout(300);

      const actual = await page.evaluate(
        ({ selector, properties }) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const cs = window.getComputedStyle(el);
          const result = {};
          for (const prop of properties) result[prop] = cs.getPropertyValue(prop).trim();
          return result;
        },
        { selector: entry.selector, properties: entry.properties },
      );

      if (!actual) {
        mismatches.push({
          id: entry.id,
          label: entry.label,
          selector: entry.selector,
          property: "(element)",
          expected: "(present)",
          actual: "(not found in DOM)",
          mode: "renderer",
          theme,
        });
        continue;
      }

      for (const [prop, expectedRaw] of Object.entries(entry.expected)) {
        const actRaw = actual[prop] ?? "(not set)";
        const expNum = parseFloat(expectedRaw);
        const actNum = parseFloat(actRaw);
        const numericMatch = !isNaN(expNum) && !isNaN(actNum) && Math.abs(expNum - actNum) < 0.5;
        const exactMatch = actRaw === expectedRaw;

        if (!numericMatch && !exactMatch) {
          mismatches.push({
            id: entry.id,
            label: `${entry.label} [${theme}]`,
            selector: entry.selector,
            property: prop,
            expected: expectedRaw,
            actual: actRaw,
            mode: "renderer",
            theme,
          });
        } else {
          ok.push({ id: entry.id, property: prop, theme, status: "OK" });
        }
      }
    }

    await page.close();
  }

  await browser.close();
  server.close();

  return { mismatches, ok, shots, mode: "renderer" };
}

// ── Report output ────────────────────────────────────────────────────────────

function formatReport({ mismatches, ok, shots, mode }) {
  const lines = [];
  lines.push("# Settings Parity Report");
  lines.push(`\nMode: **${mode}**`);
  lines.push(`\n> **Note**: Raven panel-level parity is UNPROVEN without a Raven login.`);
  lines.push(`> Reference values come from reading Raven source files directly`);
  lines.push(`> (components/ui/*.tsx, settings-dialog.tsx, espresso-*.css).`);
  lines.push(`> A live Raven session at http://localhost:8054/raven is running but`);
  lines.push(`> no credentials were available to authenticate.`);

  lines.push(`\n## Allowed exceptions (FD5)`);
  const exceptions = SETTINGS_ELEMENT_MAP.filter((e) => e.exception);
  for (const e of exceptions) {
    lines.push(`- **${e.label}**: ${e.exception}`);
  }

  if (mismatches.length === 0) {
    lines.push(`\n## Mismatches\n\n✅ No mismatches found (${ok.length} checks passed).`);
  } else {
    lines.push(`\n## Mismatches (${mismatches.length})`);
    lines.push(`\n| Element | Selector | Property | Expected | Actual |`);
    lines.push(`|---------|----------|----------|----------|--------|`);
    for (const m of mismatches) {
      lines.push(
        `| ${m.label} | \`${m.selector}\` | \`${m.property}\` | \`${m.expected}\` | \`${m.actual}\` |`,
      );
    }
  }

  lines.push(`\n## Checks passed (${ok.length})`);
  lines.push(ok.map((o) => `- ${o.id}: ${o.property ?? ""} ${o.status}`).join("\n"));

  if (shots?.length) {
    lines.push(`\n## Screenshots`);
    lines.push(shots.map((s) => `- ${s}`).join("\n"));
  }

  return lines.join("\n");
}

// ── Entry point ──────────────────────────────────────────────────────────────

let result;

if (CSS_ONLY || !existsSync(RENDERER_DIR)) {
  if (!existsSync(RENDERER_DIR)) {
    console.log(
      "ℹ  Renderer build not found at apps/desktop/out/renderer/.\n" +
      "   Running CSS source analysis (MODE B). Build first for computed-style check.\n",
    );
  } else {
    console.log("ℹ  PARITY_CSS_ONLY=1: running CSS source analysis (MODE B).\n");
  }
  result = await runCssMode();
} else {
  result = await runRendererMode();
}

const report = formatReport(result);
writeFileSync(REPORT_PATH, report, "utf8");

// Print mismatch table to stdout
console.log("\n" + "─".repeat(72));
if (result.mismatches.length === 0) {
  console.log(`✅ Settings parity: 0 mismatches (${result.ok.length} checks passed)`);
} else {
  console.log(`❌ Settings parity: ${result.mismatches.length} mismatch(es)\n`);
  const header = ["Element", "Property", "Expected", "Actual"];
  const rows = result.mismatches.map((m) => [
    m.label.slice(0, 40),
    m.property,
    m.expected,
    typeof m.actual === "string" ? m.actual.slice(0, 50) : String(m.actual),
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length)),
  );
  const fmt = (row) => row.map((c, i) => String(c).padEnd(widths[i])).join(" │ ");
  console.log(fmt(header));
  console.log(widths.map((w) => "─".repeat(w)).join("─┼─"));
  for (const row of rows) console.log(fmt(row));
}
console.log("─".repeat(72));
console.log(`Full report written to: ${REPORT_PATH}`);

process.exit(result.mismatches.length > 0 ? 1 : 0);
