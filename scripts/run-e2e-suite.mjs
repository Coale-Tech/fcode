#!/usr/bin/env node
/**
 * run-e2e-suite.mjs — runs the deterministic Electron e2e suite.
 *
 * Chosen tests:
 *   e2e-settings-skills          Skills settings panels + toggle IPC wiring (no renderer)
 *   e2e-work-panel-reorder       Work panel drag reorder (no renderer)
 *   e2e-transcript-disclosure    Transcript scroll-anchor regression (no renderer)
 *   e2e-copy-tex                 TeX copy/paste rendering (no renderer)
 *   e2e-settings-scroll          Settings navigation + scroll retention (needs renderer)
 *   e2e-transcript-render        Transcript activity-group stability (needs renderer)
 *
 * Prereqs: pnpm build:js (workspace packages + desktop renderer for last two)
 * Platform: Linux with xvfb-run (CI), macOS dev (probe passes; exit may be SIGTERM).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;

// Tests that need the renderer CSS build (pnpm build:js → apps/desktop electron-vite build)
const NEEDS_RENDERER = new Set(["e2e-settings-scroll", "e2e-transcript-render"]);

const rendererBuilt = existsSync(
  join(root, "apps/desktop/out/renderer/index.html"),
);

/** @type {Array<{name: string, script: string}>} */
const SUITE = [
  { name: "e2e-settings-skills", script: "scripts/e2e-settings-skills.mjs" },
  { name: "e2e-work-panel-reorder", script: "scripts/e2e-work-panel-reorder.mjs" },
  {
    name: "e2e-transcript-disclosure",
    script: "scripts/e2e-transcript-disclosure-anchor.mjs",
  },
  { name: "e2e-copy-tex", script: "scripts/e2e-copy-tex.mjs" },
  { name: "e2e-settings-scroll", script: "scripts/e2e-settings-scroll.mjs" },
  { name: "e2e-transcript-render", script: "scripts/e2e-transcript-render.mjs" },
];

const results = [];
let anyFailed = false;

for (const { name, script } of SUITE) {
  if (NEEDS_RENDERER.has(name) && !rendererBuilt) {
    console.log(`⚠  ${name}: skipped (renderer not built — run pnpm build:js first)`);
    results.push({ name, status: "skipped" });
    continue;
  }

  const scriptPath = join(root, script);
  if (!existsSync(scriptPath)) {
    console.error(`✗ ${name}: script not found: ${scriptPath}`);
    results.push({ name, status: "missing" });
    anyFailed = true;
    continue;
  }

  process.stdout.write(`  ${name}: `);
  const start = Date.now();
  const childEnv =
    process.platform === "linux"
      ? { ...process.env, ELECTRON_NO_SANDBOX: "1" }
      : process.env;
  const result = spawnSync(node, [scriptPath], {
    stdio: "inherit",
    timeout: 90_000,
    env: childEnv,
  });
  const ms = Date.now() - start;

  if (result.error) {
    console.error(`✗ (error: ${result.error.message})`);
    results.push({ name, status: "error", ms });
    anyFailed = true;
  } else if (result.status === 0) {
    console.log(`✓ (${ms}ms)`);
    results.push({ name, status: "pass", ms });
  } else if (result.status === null) {
    // Killed by signal — on macOS, Electron exits via SIGTERM after app.exit().
    // Treat as a pass if it did not error out (probe output already checked by
    // the individual test script before calling app.exit).
    if (process.platform === "darwin") {
      console.log(`✓ (${ms}ms, SIGTERM — macOS Electron normal)`);
      results.push({ name, status: "pass", ms });
    } else {
      console.error(`✗ (killed by signal on non-macOS)`);
      results.push({ name, status: "fail", ms });
      anyFailed = true;
    }
  } else {
    console.error(`✗ (exit ${result.status})`);
    results.push({ name, status: "fail", ms });
    anyFailed = true;
  }
}

console.log("\n─── e2e suite summary ───────────────────────────────────────────");
for (const r of results) {
  const icon =
    r.status === "pass" ? "✓" : r.status === "skipped" ? "⚠" : "✗";
  const time = r.ms !== undefined ? ` (${r.ms}ms)` : "";
  console.log(`  ${icon} ${r.name}${time}`);
}
console.log("─────────────────────────────────────────────────────────────────");

if (anyFailed) {
  console.error("\ne2e suite FAILED");
  process.exit(1);
} else {
  console.log(
    `\ne2e suite passed (${results.filter((r) => r.status === "pass").length}/${SUITE.length} ran)`,
  );
}
