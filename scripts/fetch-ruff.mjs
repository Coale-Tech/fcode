#!/usr/bin/env node
/**
 * fetch-ruff.mjs — stage Astral's pinned `ruff` release into
 * apps/desktop/resources/tools/<platform>-<arch>/ruff[.exe].
 *
 * Wired as apps/desktop/package.json "bundle:runtime" next to build-omp.mjs.
 * electron-builder copies the per-arch file to <resources>/tools/ruff[.exe]
 * (extraResources), and the app appends that directory to the agent's PATH so
 * omp's `lsp` tool (ruff language server), the agent's shell and Fix CI all find
 * it (electron/main/omp-binary.ts bundledToolsDir).
 *
 * Every download is verified against the release's published .sha256 file.
 * Targets mirror build-omp.mjs: host first (failure is fatal), the rest are
 * best-effort locally, and CI stages only its own host target.
 */
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Bump deliberately: it changes lint results for every user. */
const RUFF_VERSION = "0.17.1";
// The release archives hold only the binary. The tag's LICENSE (MIT + third-party notices)
// must ship with it, so it is fetched from the tag and pinned by hash.
const LICENSE_SHA256 = "2597d854122b77ddc71971564ca2350a37608575ce324adc5650a2b2051c8f18";
// musl on linux: statically linked, so it runs on any distro.
const ASSETS = {
  "darwin-arm64": "ruff-aarch64-apple-darwin.tar.gz",
  "darwin-x64": "ruff-x86_64-apple-darwin.tar.gz",
  "linux-x64": "ruff-x86_64-unknown-linux-musl.tar.gz",
  "win32-x64": "ruff-x86_64-pc-windows-msvc.zip",
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const toolsDir = join(repoRoot, "apps", "desktop", "resources", "tools");
const hostTarget = `${process.platform}-${process.arch}`;
const targets = process.env.CI ? [hostTarget] : [hostTarget, ...Object.keys(ASSETS).filter((t) => t !== hostTarget)];

async function download(url) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function findFile(dir, name) {
  return readdirSync(dir, { recursive: true }).map(String).find((f) => basename(f) === name);
}

async function stage(target) {
  const asset = ASSETS[target];
  if (!asset) throw new Error(`no ruff asset for ${target}`);
  const exe = target.startsWith("win32-") ? "ruff.exe" : "ruff";
  const outDir = join(toolsDir, target);
  const out = join(outDir, exe);
  const marker = join(outDir, "ruff.version");
  if (existsSync(out) && existsSync(marker) && readFileSync(marker, "utf8").trim() === RUFF_VERSION) {
    console.log(`fetch-ruff: ${target} already at ${RUFF_VERSION}`);
    return;
  }

  const base = `https://github.com/astral-sh/ruff/releases/download/${RUFF_VERSION}/${asset}`;
  const [archive, sumFile] = await Promise.all([download(base), download(`${base}.sha256`)]);
  const expected = sumFile.toString("utf8").trim().split(/\s+/)[0].toLowerCase();
  const actual = createHash("sha256").update(archive).digest("hex");
  if (actual !== expected) throw new Error(`sha256 mismatch for ${asset}: expected ${expected}, got ${actual}`);

  const tmp = mkdtempSync(join(tmpdir(), "fetch-ruff-"));
  try {
    const archivePath = join(tmp, asset);
    writeFileSync(archivePath, archive);
    // bsdtar (macOS, Windows) reads both .tar.gz and .zip. On Windows runners PATH
    // puts Git's GNU tar first, which reads "C:\..." as a remote host; use the system one.
    const tar = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
    const x = spawnSync(tar, ["-xf", archivePath, "-C", tmp], { stdio: "inherit" });
    if (x.status !== 0) throw new Error(`tar failed extracting ${asset} (status ${x.status})`);
    const found = findFile(tmp, exe);
    if (!found) throw new Error(`${exe} not found inside ${asset}`);
    mkdirSync(outDir, { recursive: true });
    copyFileSync(join(tmp, found), out);
    if (!exe.endsWith(".exe")) chmodSync(out, 0o755);
    writeFileSync(marker, `${RUFF_VERSION}\n`);
    console.log(`fetch-ruff: staged ${target} ruff ${RUFF_VERSION} (sha256 ${actual.slice(0, 12)}…)`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function stageLicense() {
  const out = join(toolsDir, "LICENSE-ruff");
  const marker = `${out}.version`;
  if (existsSync(out) && existsSync(marker) && readFileSync(marker, "utf8").trim() === RUFF_VERSION) return;
  const text = await download(`https://raw.githubusercontent.com/astral-sh/ruff/${RUFF_VERSION}/LICENSE`);
  const actual = createHash("sha256").update(text).digest("hex");
  if (actual !== LICENSE_SHA256) throw new Error(`ruff LICENSE sha256 mismatch: expected ${LICENSE_SHA256}, got ${actual}`);
  mkdirSync(toolsDir, { recursive: true });
  writeFileSync(out, text);
  writeFileSync(marker, `${RUFF_VERSION}\n`);
  console.log(`fetch-ruff: staged LICENSE-ruff (${RUFF_VERSION})`);
}

await stageLicense(); // fatal: never ship the binary without its notice

let hostOk = false;
for (const target of targets) {
  try {
    await stage(target);
    if (target === hostTarget) hostOk = true;
  } catch (err) {
    console.warn(`fetch-ruff: ${target} failed — ${err instanceof Error ? err.message : err}`);
  }
}
if (!hostOk && ASSETS[hostTarget]) {
  console.error(`fetch-ruff: host target ${hostTarget} failed — no local ruff available`);
  process.exit(1);
}
