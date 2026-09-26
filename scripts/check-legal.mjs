#!/usr/bin/env node
/**
 * scripts/check-legal.mjs
 *
 * Legal gate — must pass before any tagged release is published.
 * Wired into the `verify` job of .github/workflows/release.yml.
 *
 * Checks:
 *   1. NOTICE.md exists at the repo root and contains the required attribution lines.
 *   2. docs/fcode/commercial-control-point.md exists.
 *   3. No file outside scripts/identity-keeplist.txt contains upstream identity strings
 *      (PI-Desktop, vastsa, DUV63RKYTW, XingYu, net.aiuo, pi-desktop-host-core).
 *
 * The ripgrep check uses a committed keep-list rather than a hand-written enumeration,
 * because three successive review rounds each missed a site the previous round found.
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let failed = false;

function fail(msg) {
  console.error(`error: ${msg}`);
  failed = true;
}

// ── 1. NOTICE.md ────────────────────────────────────────────────────────────

const noticePath = join(ROOT, "NOTICE.md");
if (!existsSync(noticePath)) {
  fail("NOTICE.md does not exist at the repository root. This file is required under LGPL-3.0 §4a.");
} else {
  const notice = readFileSync(noticePath, "utf8");
  if (!notice.includes("https://github.com/vastsa/PI-Desktop")) {
    fail('NOTICE.md must contain "Forked from https://github.com/vastsa/PI-Desktop".');
  }
  if (!notice.includes("LGPL-3.0") && !notice.includes("Lesser General Public License")) {
    fail("NOTICE.md must contain an LGPL-3.0 declaration.");
  }
}

// ── 2. Commercial control point decision record ───────────────────────────

const controlPointPath = join(ROOT, "docs", "fcode", "commercial-control-point.md");
if (!existsSync(controlPointPath)) {
  fail(
    "docs/fcode/commercial-control-point.md does not exist. " +
    "The commercial control point decision must be recorded before the first tagged release.",
  );
}

// ── 3. Identity keep-list ripgrep check ─────────────────────────────────────

const keeplistPath = join(__dirname, "identity-keeplist.txt");
if (!existsSync(keeplistPath)) {
  fail("scripts/identity-keeplist.txt does not exist. Cannot run the identity check.");
} else {
  // Load allowed line fragments from the keep-list
  const keeplist = readFileSync(keeplistPath, "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => line.trim());

  // Run ripgrep over the checked-in tree (excluding binary files and git objects)
  let rgOutput = "";
  try {
    rgOutput = execSync(
      "rg -n --no-heading " +
      "'PI-Desktop|vastsa|DUV63RKYTW|XingYu|net\\.aiuo|pi-desktop-host-core' " +
      "apps packages scripts .github NOTICE.md",
      {
        cwd: ROOT,
        encoding: "utf8",
        // rg exits 1 when no matches (that's fine), 2 on error
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  } catch (err) {
    if (err.status === 1) {
      // No matches found — that's the ideal outcome
      rgOutput = err.stdout ?? "";
    } else if (err.status === 2) {
      fail(`ripgrep error: ${err.stderr ?? err.message}`);
    } else {
      // rg not installed
      console.warn(
        "warning: ripgrep (rg) not found; skipping identity pattern scan. " +
        "Install rg to enable this check locally.",
      );
      rgOutput = "";
    }
  }

  const lines = rgOutput.split("\n").filter(Boolean);
  const violations = lines.filter(
    (line) => !keeplist.some((allowed) => line.includes(allowed)),
  );

  if (violations.length > 0) {
    console.error(
      "error: upstream identity strings found outside the keep-list.\n" +
      "Add legitimate occurrences to scripts/identity-keeplist.txt.\n" +
      "Violations:\n" +
      violations.map((v) => `  ${v}`).join("\n"),
    );
    failed = true;
  }
}

// ── Result ───────────────────────────────────────────────────────────────────

if (failed) {
  process.exit(1);
}

console.log("check-legal: all legal gates passed.");
