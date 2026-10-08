#!/usr/bin/env node
/**
 * e2e-settings-skills — Settings → Extensions (Skills) panels.
 *
 * Mounts OmpSettingsSections(part="extensions") and MemoryBudgetBar in an
 * isolated Electron renderer with fully mocked IPC and asserts:
 *
 *   E2E-SKILLS-001  SkillPackSection card renders
 *   E2E-SKILLS-002  SkillCuratorSection card renders
 *   E2E-SKILLS-003  SkillReviewSection card renders
 *   E2E-SKILLS-004  MemoryBudgetBar renders with correct fill text
 *   E2E-SKILLS-005  Toggling skills.review.enabled fires ompSettingsSet IPC
 *                   with the new boolean value (true)
 *
 * Prereqs: pnpm build:js (workspace package builds only; renderer is not
 * needed — this test bundles its own entry via esbuild).
 * No host-core binary, no omp sidecar, no network required.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronBinary } from "./e2e/boot.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "packages/agent-runtime/package.json"));
const { build } = require("esbuild");
const { electronBinary } = resolveElectronBinary(root);

const temp = await mkdtemp(join(tmpdir(), "pi-settings-skills-"));

const consoleErrors = [];

try {
  // Bundle the fixture
  await build({
    entryPoints: [join(root, "scripts/e2e/settings-skills.jsx")],
    outfile: join(temp, "renderer.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
      "import.meta.env.DEV": "false",
      "import.meta.env.PROD": "true",
    },
    loader: { ".css": "empty", ".svg": "empty", ".png": "empty" },
    alias: {
      "@pi-desktop/i18n": join(root, "packages/i18n/src/index.ts"),
      "@pi-desktop/shared": join(root, "packages/shared/src/index.ts"),
      react: join(root, "apps/desktop/node_modules/react"),
      "react-dom": join(root, "apps/desktop/node_modules/react-dom"),
      i18next: join(root, "apps/desktop/node_modules/i18next"),
      "react-i18next": join(root, "apps/desktop/node_modules/react-i18next"),
    },
    nodePaths: [join(root, "apps/desktop/node_modules")],
    logLevel: "error",
  });

  await writeFile(
    join(temp, "index.html"),
    `<!doctype html>
<html data-platform="darwin">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:">
</head>
<body>
<div id="root"></div>
<script src="renderer.js"></script>
</body>
</html>`,
  );

  await writeFile(
    join(temp, "main.cjs"),
    `
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
app.setPath("userData", path.join(__dirname, "profile"));
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
      // sandbox: false for CI (--no-sandbox passed at Electron level; renderer
      // sandbox disabled to avoid seccomp issues on constrained Linux hosts).
      sandbox: false,
      contextIsolation: false,
      nodeIntegration: false,
      backgroundThrottling: false,
  });
  const consoleErrors = [];
  win.webContents.on("console-message", (_event, level, message) => {
    // level: 0=verbose, 1=info, 2=warning, 3=error
    if (level >= 3) consoleErrors.push(message);
    if (level >= 2) console.error("[renderer:" + level + "] " + message);
  });
  try {
    await win.loadFile(path.join(__dirname, "index.html"));
    // Give async effects time to settle
    await new Promise((r) => setTimeout(r, 800));
    const result = await win.webContents.executeJavaScript("window.skillsProbe()");
    console.log("SKILLS_PROBE " + JSON.stringify({ ...result, consoleErrors }));
    app.exit(result?.ok === true ? 0 : 1);
  } catch (error) {
    console.error("SKILLS_PROBE error:", error.message);
    console.log("SKILLS_PROBE " + JSON.stringify({ ok: false, error: String(error), consoleErrors }));
    app.exit(1);
  }
});
`,
  );

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  // On Linux CI, Electron needs --no-sandbox because user namespaces are
  // typically unavailable.  On macOS and Windows this flag is a no-op.
  const electronArgs =
    process.platform === "linux"
      ? ["--no-sandbox", join(temp, "main.cjs")]
      : [join(temp, "main.cjs")];
  const child = spawn(electronBinary, electronArgs, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      output += chunk;
    });
  }

  const killTimer = setTimeout(() => {
    child.kill("SIGKILL");
  }, 45_000);

  let code;
  try {
    code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
  } finally {
    clearTimeout(killTimer);
  }

  const probeLine = output
    .split(/\r?\n/)
    .find((l) => l.startsWith("SKILLS_PROBE "));

  assert(
    probeLine,
    `renderer returned no probe (exit=${code}):\n${output.slice(-4000)}`,
  );

  const probe = JSON.parse(probeLine.slice("SKILLS_PROBE ".length));
  console.log(probeLine);

  // Report failures clearly
  if (!probe.ok) {
    const failing = Object.entries(probe.checks ?? {})
      .filter(([, v]) => !v)
      .map(([k]) => k);
    console.error("Failing checks:", failing);
    console.error("settingsSetCalls:", JSON.stringify(probe.settingsSetCalls));
    console.error("consoleErrors:", JSON.stringify(probe.consoleErrors));
  }

  assert.equal(
    probe.ok,
    true,
    `Skills settings probe failed. Checks: ${JSON.stringify(probe.checks)}`,
  );
  assert.deepEqual(
    probe.consoleErrors ?? [],
    [],
    `Unexpected console errors: ${JSON.stringify(probe.consoleErrors)}`,
  );

  // code is null on macOS (SIGTERM after app.exit); on Linux it is 0
  assert(
    code === 0 || code === null,
    `Electron exited with unexpected code ${code}:\n${output.slice(-2000)}`,
  );

  console.log("e2e-settings-skills: all checks passed ✓");
} finally {
  await rm(temp, { recursive: true, force: true });
}
