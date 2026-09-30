#!/usr/bin/env node
/**
 * build-omp.mjs — build the omp sidecar binary and stage it into resources/bin/.
 *
 * Wired as apps/desktop/package.json "bundle:runtime" so it runs alongside the
 * agent-runtime bundle step before electron-builder packages the app.
 *
 * Source: vendored snapshot in omp/ (diverged from oh-my-pi ba344f5e69; no upstream sync).
 * After changing omp/, re-run this script; the protocol smoke test
 * (apps/desktop/test/omp-protocol-smoke.test.mjs) detects a stale binary and
 * confirms protocol v2 is still negotiated.
 *
 * Platform support: macOS (arm64 + x64), Linux (arm64 + x64), and Windows (x64).
 * The omp runtime itself is cross-platform; Fcode's own bench supervisor still
 * requires a POSIX shell, so Windows builds ship without working Bench support.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
// scripts/ lives at repo root; omp/ is the vendored source snapshot
const repoRoot = resolve(scriptDir, "..");
const ompSource = resolve(repoRoot, "omp");
const destDir = resolve(repoRoot, "apps", "desktop", "resources", "bin");


// ── Verify source + dependencies ─────────────────────────────────────────────
if (!existsSync(join(ompSource, "package.json"))) {
  console.error(`build-omp: omp source not found at ${ompSource}`);
  process.exit(1);
}
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`build-omp: \`${cmd} ${args.join(" ")}\` failed in ${cwd}`);
    process.exit(1);
  }
};
if (!existsSync(join(ompSource, "node_modules"))) {
  run("bun", ["install", "--frozen-lockfile"], ompSource);
}
// Native addon: compiled once per machine (slow when cold); CI restores it from cache.
const nativeDir = join(ompSource, "packages", "natives", "native");
const hasAddon = existsSync(nativeDir) && readdirSync(nativeDir).some((f) => f.endsWith(".node"));
if (!hasAddon) {
  run("bun", ["--cwd=packages/natives", "run", "build"], ompSource);
}

// ── Build + stage per target ─────────────────────────────────────────────────
// Each target is built by setting CROSS_TARGET before invoking coding-agent's
// own build script — Bun's --compile cross-compiles without needing that
// platform's hardware (packages/coding-agent/scripts/build-binary.ts). Binaries
// are staged immediately after each build so one target's failure never
// discards another target's already-built, already-staged binary.
console.log(`build-omp: building omp from ${ompSource}`);

const codingAgentDir = join(ompSource, "packages", "coding-agent");
const distDir = join(codingAgentDir, "dist");
const hostTarget = `${process.platform}-${process.arch}`;
// Host target first so a later cross-target failure never costs us the one
// binary this dev machine can actually run and test locally. In CI, each
// release.yml matrix job packages only its own platform, so the other 4
// targets would just be discarded, guaranteed-to-fail noise in the log —
// skip them there and only build the one target that job actually ships.
const ALL_TARGETS = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"];
const crossTargets = process.env.CI
  ? [hostTarget]
  : [hostTarget, ...ALL_TARGETS.filter((t) => t !== hostTarget)];
// Bun's --compile always appends .exe for a Windows target regardless of the
// outfile given (oh-my-pi build-binary.ts requests "omp-<target>" with no
// extension) — every staged filename for that target must carry it too.
const exeSuffix = (target) => (target.startsWith("win32-") ? ".exe" : "");

mkdirSync(destDir, { recursive: true });

const staged = [];
for (const crossTarget of crossTargets) {
  console.log(`build-omp: building omp for ${crossTarget}`);
  const result = spawnSync("bun", ["run", "build"], {
    cwd: codingAgentDir,
    stdio: "inherit",
    env: { ...process.env, CROSS_TARGET: crossTarget },
  });
  if (result.status !== 0) {
    console.warn(`build-omp: build failed for ${crossTarget} (status ${result.status}) — skipping`);
    continue;
  }
  const suffix = exeSuffix(crossTarget);
  const src = join(distDir, `omp-${crossTarget}${suffix}`);
  if (!existsSync(src)) {
    console.warn(`build-omp: build reported success but ${src} is missing — skipping`);
    continue;
  }
  const dest = join(destDir, `omp-${crossTarget}${suffix}`);
  cpSync(src, dest);
  console.log(`build-omp: staged ${src} → ${dest}`);
  staged.push(crossTarget);
}

if (!staged.includes(hostTarget)) {
  console.error(`build-omp: host target ${hostTarget} failed to build — no local binary available`);
  process.exit(1);
}

// Also stage a bare `omp` matching this host, for local dev/test use —
// apps/desktop/test/omp-protocol-smoke.test.mjs resolves exactly this path.
// electron-builder does the equivalent per-arch rename at packaging time via
// apps/desktop/package.json's extraResources "omp-${arch}" → "bin/omp".
const hostSuffix = exeSuffix(hostTarget);
const hostBareDest = join(destDir, `omp${hostSuffix}`);
cpSync(join(destDir, `omp-${hostTarget}${hostSuffix}`), hostBareDest);
const sha256 = createHash("sha256").update(readFileSync(hostBareDest)).digest("hex");
console.log(`build-omp: staged host binary → ${hostBareDest}`);
console.log(`build-omp: ${hostTarget} SHA256 = ${sha256} (informational; builds are not byte-reproducible)`);

// Staleness guard: apps/desktop/test/omp-protocol-smoke.test.mjs recomputes this.
const sourceHash = createHash("sha256")
  .update(execFileSync("git", ["ls-files", "-s", "omp"], { cwd: repoRoot }))
  .digest("hex");
writeFileSync(
  join(destDir, "omp.build.json"),
  JSON.stringify({ sourceHash, builtAt: new Date().toISOString() }, null, 2),
);

console.log(`build-omp: done (${staged.length}/${crossTargets.length} targets staged: ${staged.join(", ")})`);
