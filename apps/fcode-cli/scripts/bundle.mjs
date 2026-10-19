#!/usr/bin/env node
/**
 * Bundle the fcode CLI into a single file that Electron can run as-node.
 * Output: dist-bundle/cli.js (copied into the app by electron-builder extraResources).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const out = join(app, "dist-bundle", "cli.js");
const require = createRequire(import.meta.url);

rmSync(dirname(out), { recursive: true, force: true });
mkdirSync(dirname(out), { recursive: true });

execFileSync(
  require.resolve("esbuild/bin/esbuild"),
  [
    join(app, "src/cli.ts"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node22",
    "--external:bufferutil",
    "--external:utf-8-validate",
    `--outfile=${out}`,
    // CJS interop banner (ws uses require internally in some paths)
    "--banner:js=import { createRequire as __fcCreateRequire } from 'node:module'; const require = __fcCreateRequire(import.meta.url);",
  ],
  { stdio: "inherit", cwd: app },
);
console.log(`bundled ${out}`);
