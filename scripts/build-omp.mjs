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
 * Platform support: macOS (arm64 + x64), Linux (arm64 + x64), and Windows (x64).
 * The omp runtime itself is cross-platform; Fcode's own bench supervisor still
 * requires a POSIX shell, so Windows builds ship without working Bench support.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PINNED_OMP_COMMIT = "ba344f5e69f28535e7e9a2cf09e5af3643861b73";
// SHA256 of the darwin-x64 `bin/omp` built from the commit above, checked by
// apps/desktop/test/omp-protocol-smoke.test.mjs as a drift guard.
// NOTE: Bun's --compile output here is NOT byte-reproducible across rebuilds
// of the identical commit — packages/coding-agent's generate-client-bundle.ts
// regenerates the embedded web client fresh every build and does not embed it
// deterministically (confirmed: two back-to-back builds of this exact commit
// on the same machine differed in ~1.4MB of the ~364MB binary). A later
// rebuild of this same pinned commit is expected to need a fresh hash here,
// not to reproduce this one — re-run this script and copy the printed
// SHA256 whenever this constant needs updating.
const OMP_BINARY_SHA256 = "24bc28b65cb897248738781aef207cbbbd2e18b57c94bc15b09b1d6da52705c7";

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
      "  git clone https://github.com/can1357/oh-my-pi ../oh-my-pi",
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

// ── Verify dependencies installed ────────────────────────────────────────────
if (!existsSync(join(ompSource, "node_modules"))) {
  console.error(
    `build-omp: oh-my-pi dependencies are not installed\n` +
      `  Run: (cd ${ompSource} && bun install)`,
  );
  process.exit(1);
}

// ── Build + stage per target ─────────────────────────────────────────────────
// Each target is built by setting CROSS_TARGET before invoking coding-agent's
// own build script — Bun's --compile cross-compiles without needing that
// platform's hardware (packages/coding-agent/scripts/build-binary.ts). Binaries
// are staged immediately after each build so one target's failure never
// discards another target's already-built, already-staged binary.
console.log(`build-omp: building omp from ${ompSource} (${PINNED_OMP_COMMIT.slice(0, 12)})`);

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
console.log(`build-omp: ${hostTarget} SHA256 = ${sha256}`);
console.log("build-omp: if bumping PINNED_OMP_COMMIT, update OMP_BINARY_SHA256 below to the value above");

console.log(`build-omp: done (${staged.length}/${crossTargets.length} targets staged: ${staged.join(", ")})`);
