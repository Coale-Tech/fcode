#!/usr/bin/env node
/**
 * parity-counts.mjs — recompute missing/partial row counts from the parity matrix.
 * Usage: node scripts/parity-counts.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const text = readFileSync(
  join(root, "docs/superpowers/specs/2026-09-30-omp-fcode-parity-matrix.md"),
  "utf8",
);
const missing = (text.match(/\| missing \|/g) ?? []).length;
const partial = (text.match(/\| partial \|/g) ?? []).length;
console.log(`${missing} missing / ${partial} partial`);
