/**
 * Centralised omp binary resolution and child-process env for the desktop main process.
 *
 * resolveOmpBin(): string
 *   Priority: OMP_BIN env → <resourcesPath>/bin/omp[.exe] (packaged)
 *             → <resourcesPath>/bin/omp-<platform>-<arch> (dev staged via build-omp.mjs)
 *             → "omp" on PATH (warns).
 *   Mirrors packages/omp-bridge/src/bridge.ts resolveOmpBinary semantics.
 *
 * ompChildEnv(extra?): NodeJS.ProcessEnv
 *   Returns process.env merged with PI_CODING_AGENT_DIR (Fcode's isolated omp agent dir)
 *   plus any caller extras.  Pass to every execFile/spawn of the bundled omp binary so
 *   the child sees the same isolated config as the running bridge session.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergePathParts } from "./user-login-path";
import { ompAgentDir } from "./omp-agent-dir";

/**
 * Directory holding the bundled `bin/`, `fcode-agents/`, `fcode-skills/`, manifest.
 * Packaged: `process.resourcesPath`. Dev: Electron's own Resources dir has none of
 * these, so fall back to `apps/desktop/resources` (same relative path from the
 * bundled `out/main` and from this source file).
 */
export function appResourcesPath(): string {
  const rp = process.resourcesPath ?? "";
  if (rp && existsSync(join(rp, "fcode-agents"))) return rp;
  return fileURLToPath(new URL("../../resources", import.meta.url));
}

/** Resolve the bundled omp binary. Never throws. */
export function resolveOmpBin(): string {
  if (process.env.OMP_BIN) return process.env.OMP_BIN;
  const rp = appResourcesPath();
  // Packaged binary (production Electron build)
  for (const c of [join(rp, "bin", "omp"), join(rp, "bin", "omp.exe")]) {
    if (existsSync(c)) return c;
  }
  // Dev staged binary: scripts/build-omp.mjs places omp-<platform>-<arch> here
  const devBin = join(rp, "bin", `omp-${process.platform}-${process.arch}`);
  if (existsSync(devBin)) return devBin;
  process.stderr.write(
    "[fcode] WARNING: omp binary not found in resources or dev staging dir; " +
    "falling back to PATH 'omp'. Set OMP_BIN to specify the path explicitly.\n",
  );
  return "omp";
}

/**
 * Directory holding the bundled CLI tools (ruff): `<resources>/tools` when packaged,
 * the per-target dir scripts/fetch-ruff.mjs stages in dev. Undefined when absent.
 */
export function bundledToolsDir(rp = appResourcesPath()): string | undefined {
  const exe = process.platform === "win32" ? "ruff.exe" : "ruff";
  for (const dir of [join(rp, "tools"), join(rp, "tools", `${process.platform}-${process.arch}`)]) {
    if (existsSync(join(dir, exe))) return dir;
  }
  return undefined;
}

/**
 * `env` with the bundled tools dir appended to PATH. Appended, not prepended: a
 * project's own or the user's ruff keeps winning, and a Dock-launched app (minimal
 * PATH) still finds the bundled one.
 */
export function withBundledTools(
  env: NodeJS.ProcessEnv,
  dir: string | undefined,
  win32 = process.platform === "win32",
): NodeJS.ProcessEnv {
  if (!dir) return env;
  const key = (win32 && Object.keys(env).find((k) => k.toLowerCase() === "path")) || "PATH";
  return { ...env, [key]: mergePathParts(env[key], dir) };
}

/** Build the child-process env for bundled omp spawns. */
export function ompChildEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  return { ...process.env, PI_CODING_AGENT_DIR: ompAgentDir(), ...extra };
}
