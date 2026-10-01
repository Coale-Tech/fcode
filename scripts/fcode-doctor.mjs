#!/usr/bin/env node
/**
 * fcode-doctor.mjs — check all contributor prerequisites before building Fcode.
 *
 * Run via: pnpm fcode:doctor
 *
 * Checks:
 *   • Node.js >= 22.19
 *   • pnpm >= 10
 *   • Rust stable toolchain (cargo)
 *   • Bun >= 1.2
 *   • Vendored omp source present (omp/)
 *   • Platform (macOS, Linux, or Windows; Bench tab needs macOS/Linux/WSL2)
 *
 * Exits 0 if all checks pass, 1 if any check fails.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_NODE_MAJOR = 22;
const REQUIRED_NODE_MINOR = 19;
const REQUIRED_PNPM_MAJOR = 10;
const REQUIRED_BUN_MAJOR = 1;
const REQUIRED_BUN_MINOR = 2;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

let allPassed = true;

function pass(label) {
  console.log(`  ✓  ${label}`);
}

function fail(label, detail) {
  console.error(`  ✗  ${label}`);
  if (detail) console.error(`       ${detail}`);
  allPassed = false;
}

function warn(label, detail) {
  console.warn(`  ⚠  ${label}`);
  if (detail) console.warn(`       ${detail}`);
}

function tryExec(cmd, args, cwd) {
  try {
    // Windows needs a shell to run .cmd shims (pnpm, npm-installed bun); keep args literal (paths go via cwd).
    return execFileSync(cmd, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: process.platform === "win32",
    }).trim();
  } catch {
    return null;
  }
}

function parseVersion(str) {
  if (!str) return null;
  const m = str.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
}

console.log("\nFcode contributor prerequisite check\n");

// ── Platform ─────────────────────────────────────────────────────────────────
if (process.platform === "win32") {
  warn(
    "Platform: Windows",
    "The app builds and runs on Windows, but the Bench tab requires a Frappe bench,\n" +
      "       which is not supported natively on Windows. Use WSL2, macOS, or Linux for bench work.",
  );
} else {
  pass(`Platform: ${process.platform}`);
}

// ── Node.js ──────────────────────────────────────────────────────────────────
{
  const raw = tryExec("node", ["--version"]);
  const v = parseVersion(raw);
  if (!v) {
    fail("Node.js: not found", "Install from https://nodejs.org/ (>= 22.19)");
  } else if (v[0] < REQUIRED_NODE_MAJOR || (v[0] === REQUIRED_NODE_MAJOR && v[1] < REQUIRED_NODE_MINOR)) {
    fail(`Node.js: ${raw}`, `Requires >= ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR}. Install from https://nodejs.org/`);
  } else {
    pass(`Node.js: ${raw}`);
  }
}

// ── pnpm ─────────────────────────────────────────────────────────────────────
{
  const raw = tryExec("pnpm", ["--version"]);
  const v = parseVersion(raw);
  if (!v) {
    fail("pnpm: not found", "Install with: npm install -g pnpm@latest");
  } else if (v[0] < REQUIRED_PNPM_MAJOR) {
    fail(`pnpm: ${raw}`, `Requires >= ${REQUIRED_PNPM_MAJOR}. Upgrade with: npm install -g pnpm@latest`);
  } else {
    pass(`pnpm: ${raw}`);
  }
}

// ── Rust / cargo ─────────────────────────────────────────────────────────────
{
  const raw = tryExec("cargo", ["--version"]);
  if (!raw) {
    fail("Rust / cargo: not found", "Install from https://rustup.rs/");
  } else {
    pass(`Rust: ${raw}`);
  }
}

// ── Bun ──────────────────────────────────────────────────────────────────────
{
  const raw = tryExec("bun", ["--version"]);
  const v = parseVersion(raw);
  if (!v) {
    fail("Bun: not found", "Install from https://bun.sh/ (>= 1.2)");
  } else if (v[0] < REQUIRED_BUN_MAJOR || (v[0] === REQUIRED_BUN_MAJOR && v[1] < REQUIRED_BUN_MINOR)) {
    fail(`Bun: ${raw}`, `Requires >= ${REQUIRED_BUN_MAJOR}.${REQUIRED_BUN_MINOR}. Install from https://bun.sh/`);
  } else {
    pass(`Bun: ${raw}`);
  }
}

// ── vendored omp source ──────────────────────────────────────────────────────
{
  if (!existsSync(resolve(repoRoot, "omp", "package.json"))) {
    fail("omp: vendored source missing at omp/", "Restore it: git checkout -- omp");
  } else if (!existsSync(resolve(repoRoot, "omp", "node_modules"))) {
    pass("omp: source present (dependencies install on first `pnpm -C apps/desktop bundle:runtime`)");
  } else {
    pass("omp: source present, dependencies installed");
  }
}

// ── Result ───────────────────────────────────────────────────────────────────
console.log();
if (allPassed) {
  console.log("All checks passed. Run: pnpm fcode:dev\n");
  process.exit(0);
} else {
  console.error("One or more checks failed. Fix the issues above before building.\n");
  process.exit(1);
}
