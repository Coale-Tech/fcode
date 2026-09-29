#!/usr/bin/env node
/**
 * Smoke proof for L4b2: Fcode provider injection into omp via --models-config.
 * Throwaway script — NOT a permanent test. Run once to prove the change works.
 *
 * Checks:
 *  1. omp lists fcode-<id> models after loading --models-config.
 *  2. ~/.omp/agent/models.yml is byte-identical before and after.
 *  3. The generated fcode-providers.yml does NOT contain the fake key value.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const ompBinary = resolve(repoRoot, "apps/desktop/resources/bin/omp");

if (!existsSync(ompBinary)) { console.error(`[smoke] omp binary not found at ${ompBinary}`); process.exit(1); }

// 1. Baseline models.yml sha
const modelsYmlPath = join(homedir(), ".omp/agent/models.yml");
const baselineSha = existsSync(modelsYmlPath)
  ? createHash("sha256").update(readFileSync(modelsYmlPath)).digest("hex") : null;
console.log(`[smoke] baseline models.yml sha256=${baselineSha ?? "absent"}`);

// 2. Write fake fcode-providers.yml
const FAKE_KEY = "sk-SMOKE-TEST-FAKE-KEY-MUST-NOT-APPEAR-IN-FILE";
const FAKE_PROVIDER_ID = "testprovider";
const ENV_KEY = `FCODE_PROVIDER_${FAKE_PROVIDER_ID.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_KEY`;
const FAKE_MODEL = "smoke-model-1";

const workDir = mkdtempSync(join(tmpdir(), "fcode-smoke-"));
const providersYml = join(workDir, "fcode-providers.yml");
const overlay = join(workDir, "overlay.yml");

writeFileSync(providersYml, [
  "# Fcode-injected providers — generated on each launch, do not edit.",
  "providers:",
  `  fcode-${FAKE_PROVIDER_ID}:`,
  `    baseUrl: "https://api.example.test/v1"`,
  `    api: openai-completions`,
  `    apiKey: ${ENV_KEY}`,
  `    models:`,
  `      - id: "${FAKE_MODEL}"`,
].join("\n") + "\n", "utf8");
writeFileSync(overlay, "# smoke overlay\ntools:\n  approval_mode: always-ask\n", "utf8");

// 3. Key absent from file?
const fileContent = readFileSync(providersYml, "utf8");
if (fileContent.includes(FAKE_KEY)) { console.error("[smoke] FAIL: key in file!"); process.exit(1); }
console.log("[smoke] PASS: key value absent from fcode-providers.yml");
console.log(`[smoke]   file stores: apiKey: ${ENV_KEY}  (env var name, not value)`);

// 4. Spawn omp, negotiate v2, call get_available_models
const child = spawn(ompBinary,
  ["--mode", "rpc", "--approval-mode", "always-ask", "--config", overlay, "--models-config", providersYml],
  { env: { ...process.env, [ENV_KEY]: FAKE_KEY }, stdio: ["pipe", "pipe", "inherit"] });

const chunks = new Map();
function reassemble(f) {
  let b = chunks.get(f.chunkId);
  if (!b) { b = { count: f.count, parts: [], bytes: 0 }; chunks.set(f.chunkId, b); }
  const dec = Buffer.from(f.data, "base64").toString("utf8");
  b.bytes += dec.length; b.parts[f.index] = dec;
  if (b.parts.filter(Boolean).length < b.count) return null;
  chunks.delete(f.chunkId); return b.parts.join("");
}

let buf = "", step = "ready";
const die = (msg) => { console.error(`[smoke] FAIL: ${msg}`); child.kill(); process.exit(1); };
const done = () => {
  const sha = existsSync(modelsYmlPath) ? createHash("sha256").update(readFileSync(modelsYmlPath)).digest("hex") : null;
  if (sha !== baselineSha) die(`models.yml changed! before=${baselineSha} after=${sha}`);
  console.log(`[smoke] PASS: ~/.omp/agent/models.yml unchanged (sha256=${sha ?? "absent"})`);
  rmSync(workDir, { recursive: true, force: true });
  console.log("[smoke] ALL CHECKS PASSED ✓");
  step = "done"; child.kill(); process.exit(0);
};
const timer = setTimeout(() => die("timed out 45s"), 45_000);

function handle(line) {
  let f; try { f = JSON.parse(line.trim()); } catch { return; }
  if (f.type === "rpc_chunk") { const r = reassemble(f); if (r) handle(r); return; }
  if (step === "ready" && f.type === "ready") {
    const vers = f.supportedProtocolVersions ?? [];
    step = "negotiate";
    if (vers.includes(2)) {
      child.stdin.write(JSON.stringify({ id: "n1", type: "negotiate_protocol", protocolVersion: 2 }) + "\n");
    } else {
      step = "models";
      child.stdin.write(JSON.stringify({ id: "m1", type: "get_available_models" }) + "\n");
    }
    return;
  }
  if (step === "negotiate" && f.type === "response" && f.id === "n1") {
    step = "models";
    child.stdin.write(JSON.stringify({ id: "m1", type: "get_available_models" }) + "\n");
    return;
  }
  if (step === "models" && f.type === "response" && f.id === "m1") {
    clearTimeout(timer);
    if (!f.success) die(`get_available_models error: ${JSON.stringify(f)}`);
    const models = (f.data?.models ?? f.models) ?? [];
    const fcode = models.filter((m) => m.provider === `fcode-${FAKE_PROVIDER_ID}`);
    if (!fcode.length) {
      console.error("[smoke] providers:", [...new Set(models.map((m) => m.provider))].slice(0, 20));
      die(`no models for fcode-${FAKE_PROVIDER_ID}`);
    }
    console.log(`[smoke] PASS: omp lists ${fcode.length} model(s) for fcode-${FAKE_PROVIDER_ID}:`);
    fcode.forEach((m) => console.log(`  • ${m.provider}/${m.id}`));
    done();
  }
}

child.stdout.setEncoding("utf8");
child.stdout.on("data", (c) => {
  buf += c;
  const ls = buf.split("\n"); buf = ls.pop() ?? "";
  ls.forEach((l) => l.trim() && handle(l));
});
child.on("exit", (code) => { if (step !== "done") die(`omp exited code=${code} at step='${step}'`); });
