#!/usr/bin/env node
/**
 * Bundle the fcode CLI into a single file that Electron can run as-node.
 * Output: dist-bundle/cli.js (copied into the app by electron-builder extraResources).
 *
 * Uses esbuild's JS API: `esbuild/bin/esbuild` is a Node script, which Windows
 * cannot spawn directly (ENOENT in the v0.21.1 Windows release build).
 */
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const out = join(app, "dist-bundle", "cli.js");

rmSync(dirname(out), { recursive: true, force: true });
mkdirSync(dirname(out), { recursive: true });

await build({
  entryPoints: [join(app, "src/cli.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["bufferutil", "utf-8-validate"],
  outfile: out,
  // CJS interop banner (ws uses require internally in some paths)
  banner: {
    js: "import { createRequire as __fcCreateRequire } from 'node:module'; const require = __fcCreateRequire(import.meta.url);",
  },
});
console.log(`bundled ${out}`);
