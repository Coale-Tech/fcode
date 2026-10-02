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
const RENDERER_DIR = process.env.PARITY_RENDERER_DIR ?? join(REPO, "apps/desktop/out/renderer");
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
 * Build a flat map of all CSS custom properties from :root and @theme blocks.
 * Follows multi-hop var() chains up to depth 8.
 */
function buildTokenMap(css) {
  const map = {};
  // Match :root and @theme blocks (non-nested)
  const blockRe = /(?::root(?:\[data-[^\]]*\])?|@theme(?:\s+\w+)?)\s*\{([^}]*)\}/gs;
  let m;
  while ((m = blockRe.exec(css)) !== null) {
    const propRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let p;
    while ((p = propRe.exec(m[1])) !== null) {
      // Prefer :root values over @theme (cascade order: @theme is Tailwind util, :root wins)
      if (!(p[1] in map)) map[p[1]] = p[2].trim();
    }
  }
  return map;
}

/** Resolve a CSS var() chain using the token map; returns the terminal literal or null. */
function resolveVar(tokenMap, value, depth = 0) {
  if (depth > 8) return null;
  const m = value.trim().match(/^var\((--[\w-]+)(?:\s*,\s*(.+))?\)$/);
  if (!m) return value.trim();
  const resolved = tokenMap[m[1]] ?? m[2];
  if (resolved === undefined) return null;
  return resolveVar(tokenMap, resolved.trim(), depth + 1);
}

/**
 * Extract a CSS property value from the first block matching `selector`.
 * Handles simple shorthand expansion for padding-*, border-*-radius, transition-*.
 */
function cssExtract(css, selector, property, tokenMap) {
  const selectorRe = selector
    .replace(/[.[\]()*+?^${}|\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");

  // Find a block body that contains the selector (handles multi-selector rules).
  // Scan for the selector text in CSS, then find the nearest `{ ... }` block.
  let body;
  const anchored = new RegExp("(?:^|\\n)\\s*" + selectorRe + "(?:\\s*[,{\\n])", "ms");
  const anchM = anchored.exec(css);
  if (anchM) {
    const after = css.slice(anchM.index + anchM[0].length);
    const openIdx = css.indexOf("{", anchM.index);
    const closeIdx = openIdx !== -1 ? css.indexOf("}", openIdx) : -1;
    if (openIdx !== -1 && closeIdx !== -1) body = css.slice(openIdx + 1, closeIdx);
  }
  if (!body) return undefined;

  /** Resolve a raw CSS value: follow var() chains, extract calc(Npx) for font-scale. */
  const resolve = (raw) => {
    if (!tokenMap) return raw;
    let v = raw.trim();
    if (v.startsWith("var(")) v = resolveVar(tokenMap, v) ?? v;
    if (v.startsWith("calc(")) {
      const m = v.match(/calc\((\d+(?:\.\d+)?px)/);
      if (m) return m[1];
    }
    return v;
  };

  // Exact property match
  const exactM = new RegExp(property.replace(/-/g, "\\-") + "\\s*:\\s*([^;]+);").exec(body);
  if (exactM) return resolve(exactM[1].trim());

  const sides = { top: 0, right: 1, bottom: 2, left: 3 };

  // padding-* from padding shorthand (correctly handles CSS 2-value: V H)
  if (property.startsWith("padding-")) {
    const side = property.slice("padding-".length);
    const idx = sides[side];
    if (idx !== undefined) {
      const padM = /\bpadding\s*:\s*([^;]+);/.exec(body);
      if (padM) {
        const val = padM[1].trim();
        const parts = [];
        let depth = 0, cur = "";
        for (const ch of val) {
          if (ch === "(") { depth++; cur += ch; }
          else if (ch === ")") { depth--; cur += ch; }
          else if (ch === " " && depth === 0 && cur) { parts.push(cur); cur = ""; }
          else if (ch !== " " || depth > 0) cur += ch;
        }
        if (cur) parts.push(cur);
        // 2-value: first = vertical (top/bottom), second = horizontal (right/left)
        const v = parts.length === 1 ? parts[0] :
                  parts.length === 2 ? (idx % 2 === 0 ? parts[0] : parts[1]) :
                  parts.length === 3 ? (idx === 0 ? parts[0] : idx === 2 ? parts[2] : parts[1]) :
                  parts[idx] ?? parts[0];
        return resolve(v.trim());
      }
    }
  }

  // border-*-*-radius from border-radius shorthand
  if (property.startsWith("border-") && property.endsWith("-radius")) {
    const radM = /\bborder-radius\s*:\s*([^;]+);/.exec(body);
    if (radM) return resolve(radM[1].trim().split(/\s+/)[0]);
  }

  // transition-duration / transition-timing-function from transition shorthand
  if (property === "transition-duration" || property === "transition-timing-function") {
    const tM = /\btransition\s*:\s*([^;]+);/.exec(body);
    if (tM) {
      const first = tM[1].split(",")[0].trim().split(/\s+/);
      const durationRe = /^\d+(?:\.\d+)?m?s$/;
      const easingRe = /^(ease|ease-in|ease-out|ease-in-out|linear|cubic-bezier)/;
      if (property === "transition-duration") return first.find((t) => durationRe.test(t)) ?? null;
      return first.find((t) => easingRe.test(t)) ?? null;
    }
  }

  return undefined;
}

/** Resolve a CSS custom property from :root and @theme blocks. */
function resolveCssVar(css, varName, tokenMap) {
  if (tokenMap) return tokenMap[varName] ?? undefined;
  const rootBlockRe = /(?::root|@theme\b)\s*\{([^}]*)\}/gs;
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

  // Build a flat token map for var() resolution (handles @theme + :root)
  const tokenMap = buildTokenMap(css);

  const mismatches = [];
  const ok = [];

  for (const entry of SETTINGS_ELEMENT_MAP) {
    if (entry.exception) {
      ok.push({ id: entry.id, label: entry.label, status: "EXCEPTION", note: entry.exception });
      continue;
    }

    for (const [prop, expectedRaw] of Object.entries(entry.expected)) {
      const actual = cssExtract(css, entry.selector, prop, tokenMap);

      if (actual === undefined || actual === null) {
        // CSS defaults: no rule = transparent background, no rule = 0px radius
        const defaultMatch =
          (prop === "background-color" && (expectedRaw === "rgba(0, 0, 0, 0)" || expectedRaw === "transparent")) ||
          (prop.endsWith("-radius") && (expectedRaw === "0px" || expectedRaw === "0"));
        if (defaultMatch) {
          ok.push({ id: entry.id, label: entry.label, property: prop, status: "OK (CSS default)" });
          continue;
        }
        mismatches.push({
          id: entry.id, label: entry.label, selector: entry.selector,
          property: prop, expected: expectedRaw,
          actual: "(not found in CSS source)",
          mode: "css",
        });
        continue;
      }

      // Numeric comparison (tolerates 0.5px rounding)
      const expNum = parseFloat(expectedRaw);
      const actNum = parseFloat(actual);
      const numericMatch = !isNaN(expNum) && !isNaN(actNum) && Math.abs(expNum - actNum) < 0.5;
      const exactMatch = actual === expectedRaw;

      // For color/background, allow "transparent" to match rgba(0,0,0,0)
      const transparentMatch =
        expectedRaw === "rgba(0, 0, 0, 0)" &&
        (actual === "transparent" || actual === "rgba(0,0,0,0)" || actual === "rgba(0, 0, 0, 0)");

      if (!numericMatch && !exactMatch && !transparentMatch) {
        mismatches.push({
          id: entry.id, label: entry.label, selector: entry.selector,
          property: prop, expected: expectedRaw, actual,
          mode: "css",
        });
      } else {
        ok.push({ id: entry.id, label: entry.label, property: prop, status: "OK" });
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
    // Track last tab to avoid redundant navigations
    let currentTab = "general";
    for (const entry of SETTINGS_ELEMENT_MAP) {
      if (entry.exception) continue;

      // Navigate to the tab where this element is expected to live
      const targetTab = entry.tab ?? "general";
      if (targetTab !== currentTab) {
        await page.evaluate((t) => {
          window.__PI_DESKTOP__?.setPage("settings");
          window.__PI_DESKTOP__?.setSettingsTab(t);
        }, targetTab);
        await page.waitForTimeout(400);
        currentTab = targetTab;
      }

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

        /** Normalize a CSS time value to ms (browsers return s for 300ms+). */
        const toMs = (v) => {
          const m = v.trim().match(/^([\d.]+)s$/);
          return m ? String(Math.round(parseFloat(m[1]) * 1000)) + "ms" : v.trim();
        };

        // Normalize time units on both sides so "300ms" == "0.3s"
        const expN = prop.includes("duration") ? toMs(expectedRaw) : expectedRaw;
        // Actual may be comma-separated when multiple transitions are declared.
        const actParts = actRaw.split(/,\s*/);
        const actN = prop.includes("duration")
          ? actParts.map(toMs).join(", ")
          : actRaw;

        // For transition-duration or transition-timing-function, the browser
        // repeats the value once per transition; accept if every part matches.
        const multiMatch = (prop === "transition-timing-function" || prop === "transition-duration") &&
          actParts.map((p) => prop.includes("duration") ? toMs(p) : p.trim()).every((p) => p === expN);

        const expNum = parseFloat(expN);
        const actNum = parseFloat(actN);
        const numericMatch = !isNaN(expNum) && !isNaN(actNum) && Math.abs(expNum - actNum) < 0.5;
        const exactMatch = actN === expN;

        if (!multiMatch && !numericMatch && !exactMatch) {
          mismatches.push({
            id: entry.id,
            label: `${entry.label} [${theme}]`,
            selector: entry.selector,
            property: prop,
            expected: expN,
            actual: actN,
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
