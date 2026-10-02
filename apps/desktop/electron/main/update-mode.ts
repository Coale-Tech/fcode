/**
 * Update mode resolution and macOS signing check.
 *
 * Extracted from updater.ts so node --test can import and exercise these
 * functions without pulling in `electron` or `electron-updater`.
 */
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { dirname } from "node:path";
import type { UpdateMode } from "@pi-desktop/shared";

export type WindowsDistribution = "installed" | "zip";

/** Minimal runner signature for codesign injection in tests. */
export type SpawnRunner = (
  cmd: string,
  args: string[],
  opts: { encoding: "utf8"; timeout: number },
) => SpawnSyncReturns<string>;

const _defaultRun: SpawnRunner = (cmd, args, opts) => spawnSync(cmd, args, opts);

export function resolveUpdateMode(
  platform: NodeJS.Platform,
  isPackaged: boolean,
  env: NodeJS.ProcessEnv = process.env,
  distribution?: WindowsDistribution,
  macSigned = true,
): UpdateMode {
  if (!isPackaged) return "disabled";
  if (platform === "win32") {
    return env.PORTABLE_EXECUTABLE_FILE || distribution === "zip"
      ? "manual"
      : "in-app";
  }
  // Squirrel.Mac refuses to swap an app without a real code signature
  // ("Could not get code signature for running application"), so unsigned
  // builds fall back to the download-from-releases flow.
  if (platform === "darwin") return macSigned ? "in-app" : "manual";
  if (platform === "linux" && env.APPIMAGE) return "in-app";
  // non-AppImage linux installs
  return "manual";
}

/** True when the running .app has a non-ad-hoc signature Squirrel.Mac accepts. */
export function isMacAppSigned(run: SpawnRunner = _defaultRun): boolean {
  const bundle = dirname(dirname(dirname(process.execPath)));
  const r = run("codesign", ["-dv", "--verbose=2", bundle], {
    encoding: "utf8",
    timeout: 5000,
  });
  return r.status === 0 && !/Signature=adhoc/.test(`${r.stdout}${r.stderr}`);
}
