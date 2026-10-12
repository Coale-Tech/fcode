#!/usr/bin/env bun
/**
 * gen-omp-settings-manifest.mjs — generate omp-settings-manifest.json from the
 * vendored omp registry.
 *
 * Run as: bun scripts/gen-omp-settings-manifest.mjs
 * Check:  bun scripts/gen-omp-settings-manifest.mjs --check
 *
 * --check mode exits non-zero when the manifest's sourceHash no longer matches
 * the current omp source tree (i.e. omp was updated without re-running the
 * generator).  build-omp.mjs calls this script after a successful build.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const ompRoot = join(repoRoot, "omp");
const outFile = join(repoRoot, "apps", "desktop", "resources", "omp-settings-manifest.json");

// ── sourceHash (same git-tree hash used by build-omp.mjs / omp.build.json) ──
const sourceHash = createHash("sha256")
  .update(execFileSync("git", ["ls-files", "-s", "omp"], { cwd: repoRoot }))
  .digest("hex");

// ── --check mode: verify existing manifest is fresh ──────────────────────────
if (process.argv.includes("--check")) {
  if (!existsSync(outFile)) {
    console.error("gen-omp-settings-manifest: manifest missing — run without --check first");
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(outFile, "utf8"));
  if (manifest.sourceHash !== sourceHash) {
    console.error(
      `gen-omp-settings-manifest: stale manifest (manifest hash ${manifest.sourceHash?.slice(0, 12)} ≠ current ${sourceHash.slice(0, 12)}) — re-run build-omp.mjs`,
    );
    process.exit(1);
  }
  console.log("gen-omp-settings-manifest: manifest is fresh ✓");
  process.exit(0);
}

// ── Import omp registry ───────────────────────────────────────────────────────
// We import all-settings.ts directly (Bun handles TypeScript natively).
// settings-ui.ts is intentionally NOT imported — it pulls in TERMINAL from
// @oh-my-pi/pi-tui, which initialises the terminal at module load time.
// orderedSettings() is safe: it only registers setting handles in a module Map.
const { orderedSettings } = await import(
  join(ompRoot, "packages/coding-agent/src/config/all-settings.ts")
);

// ── Map AnySetting → OmpSettingDescriptor ────────────────────────────────────
const descriptors = [];
for (const s of orderedSettings()) {
  const ui = s.ui;
  if (!ui) continue; // registry-only settings have no ui — omp's own rule

  // Resolve enum values (AnySetting.enumValues is readonly string[] | undefined).
  const enumValues = s.enumValues ?? undefined;

  // options: ui.options may be an array of {value, label, description?} or "runtime"
  let options;
  if (Array.isArray(ui.options)) {
    options = ui.options.map(({ value, label }) => ({ value: String(value), label: String(label) }));
  }

  /** @type {import("../packages/shared/src/types/omp.ts").OmpSettingDescriptor} */
  const d = {
    id: s.id,
    type: s.type,
    tab: ui.tab,
    group: ui.group,
    label: ui.label,
    ...(ui.description !== undefined && { description: ui.description }),
    // Credentials: emit secret:true marker; never emit the default value.
    ...(s.isCredential && { secret: true }),
    // Default: omit for credentials; emit for all other types.
    ...(!s.isCredential && s.default !== undefined && { default: s.default }),
    // Enum values list.
    ...(enumValues !== undefined && { values: enumValues }),
    // Options list (submenu choices for string/number/enum/array).
    ...(options !== undefined && { options }),
  };
  descriptors.push(d);
}

// ── Write manifest ────────────────────────────────────────────────────────────
const manifest = { sourceHash, descriptors };
writeFileSync(outFile, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `gen-omp-settings-manifest: wrote ${descriptors.length} descriptors → ${outFile}`,
);
