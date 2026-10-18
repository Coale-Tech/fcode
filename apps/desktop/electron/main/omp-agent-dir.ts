/**
 * Centralised path for Fcode's isolated omp agent directory.
 *
 * The same path is passed as `PI_CODING_AGENT_DIR` to the omp sidecar process
 * (packages/omp-bridge/src/bridge.ts main()) so the desktop IPC handlers and
 * the bridge launch always agree on a single definition derived from `desktopDataDir()`.
 *
 * Consumer note for E1 (hooks-commands-ipc.ts):
 *   userHooksDir()    → join(ompAgentDir(), "hooks")
 *   userCommandsDir() → join(ompAgentDir(), "commands")
 */
import { join } from "node:path";
import { desktopDataDir } from "./data-paths.js";

/**
 * Fcode's isolated omp agent directory.
 * Equivalent to `join(desktopDataDir(), "omp-agent")`.
 * The directory is created and seeded on first bridge launch
 * (packages/omp-bridge/src/bridge.ts `initFcodeAgentDir`).
 */
export function ompAgentDir(): string {
  return join(desktopDataDir(), "omp-agent");
}
