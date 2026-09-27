#!/usr/bin/env node
/**
 * build-omp.mjs — build the omp sidecar binary and stage it into resources/bin/.
 *
 * Wired as apps/desktop/package.json "bundle:runtime" so it runs alongside the
 * agent-runtime bundle step before electron-builder packages the app.
 *
 * Pinned oh-my-pi commit: ba344f5e69f28535e7e9a2cf09e5af3643861b73
 * Update this SHA when bumping omp, then re-run the protocol smoke test
 * (apps/desktop/test/omp-protocol-smoke.test.mjs) to confirm protocol v2 is
 * still negotiated successfully.
 *
 * Platform support: macOS (arm64 + x64) and Linux (arm64 + x64).
 * Windows is explicitly unsupported until a bench transport exists there.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PINNED_OMP_COMMIT = "ba344f5e69f28535e7e9a2cf09e5af3643861b73";

const scriptDir = dirname(fileURLToPath(import.meta.url));
// scripts/ lives at repo root; oh-my-pi is a sibling checkout
const repoRoot = resolve(scriptDir, "..");
const ompSource = resolve(repoRoot, "..", "oh-my-pi");
const destDir = resolve(repoRoot, "apps", "desktop", "resources", "bin");

// ── Locate oh-my-pi ─────────────────────────────────────────────────────────
if (!existsSync(ompSource)) {
  console.error(
    `build-omp: oh-my-pi checkout not found at ${ompSource}\n` +
      "Clone it as a sibling of this repo:\n" +
      "  git clone https://github.com/coaletech/oh-my-pi ../oh-my-pi",
  );
  process.exit(1);
}

// ── Verify pinned commit ─────────────────────────────────────────────────────
const actualCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: ompSource,
  encoding: "utf8",
}).trim();

if (!actualCommit.startsWith(PINNED_OMP_COMMIT)) {
  console.error(
    `build-omp: oh-my-pi HEAD is ${actualCommit}\n` +
      `  Expected pinned commit: ${PINNED_OMP_COMMIT}\n` +
      "  Run: git -C ../oh-my-pi checkout " +
      PINNED_OMP_COMMIT,
  );
  process.exit(1);
}

// ── Build ────────────────────────────────────────────────────────────────────
console.log(`build-omp: building omp from ${ompSource} (${PINNED_OMP_COMMIT.slice(0, 12)})`);

const result = spawnSync("bun", ["run", "build"], {
  cwd: ompSource,
  stdio: "inherit",
  env: { ...process.env },
});

if (result.status !== 0) {
  console.error("build-omp: bun run build failed");
  process.exit(result.status ?? 1);
}

// ── Stage binaries ───────────────────────────────────────────────────────────
// The omp build script emits platform binaries.  We expect them at the paths
// documented in oh-my-pi/packages/coding-agent/scripts/build-binary.ts:
//   dist/omp-darwin-arm64, dist/omp-darwin-x64,
//   dist/omp-linux-arm64,  dist/omp-linux-x64
//   dist/omp-win32-x64.exe  (not staged — Windows unsupported)
const distDir = join(ompSource, "packages", "coding-agent", "dist");

/** @type {Array<{ src: string; dest: string }>} */
const targets = [
  { src: join(distDir, "omp-darwin-arm64"), dest: join(destDir, "omp-darwin-arm64") },
  { src: join(distDir, "omp-darwin-x64"), dest: join(destDir, "omp-darwin-x64") },
  { src: join(distDir, "omp-linux-arm64"), dest: join(destDir, "omp-linux-arm64") },
  { src: join(distDir, "omp-linux-x64"), dest: join(destDir, "omp-linux-x64") },
];

mkdirSync(destDir, { recursive: true });

for (const { src, dest } of targets) {
  if (!existsSync(src)) {
    console.warn(`build-omp: expected binary not found: ${src} (skipping)`);
    continue;
  }
  cpSync(src, dest);
  console.log(`build-omp: staged ${src} → ${dest}`);
}

console.log("build-omp: done");
