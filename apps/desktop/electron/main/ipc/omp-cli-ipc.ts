/**
 * IPC handlers for omp CLI subcommands (slice F).
 *
 *   ompCliRun    — start an allowlisted omp subcommand; returns { runId } immediately.
 *   ompCliCancel — kill an in-flight run by runId.
 *
 * Output chunks arrive as `ompCliOutput` events; completion fires `ompCliDone`.
 * All spawns go through omp-cli.ts which enforces the allowlist and uses
 * the bundled binary (no shell, no PATH omp).
 *
 * PI_CODING_AGENT_DIR comes from omp-agent-dir.ts (slice G) so spawned commands
 * see the same auth/config as the running session.
 */
import { ErrorCodes, IPC } from "@pi-desktop/shared";
import type { OmpCliSubcommand } from "../omp-cli";
import { cancelRun, startOmpCli, validateOmpCliArgs } from "../omp-cli";
import type { IpcRegistrar } from "./types";

export type OmpCliIpcDependencies = {
  registrar: IpcRegistrar;
  sendToRenderer: (channel: string, payload: unknown) => void;
};

export function registerOmpCliIpc({ registrar, sendToRenderer }: OmpCliIpcDependencies): void {
  const { handle } = registrar;

  // ── ompCliRun ───────────────────────────────────────────────────────────────
  handle(
    IPC.invoke.ompCliRun,
    async (input: { subcommand?: unknown; args?: unknown } = {}): Promise<{ runId: string }> => {
      const subcommand = typeof input?.subcommand === "string" ? input.subcommand.trim() : "";
      const rawArgs = Array.isArray(input?.args) ? input.args : [];
      const args = rawArgs.map((a) => (typeof a === "string" ? a : String(a)));

      const validationError = validateOmpCliArgs(subcommand, args);
      if (validationError) {
        throw Object.assign(new Error(validationError), {
          errorCode: ErrorCodes.INVALID_ARGUMENT,
        });
      }

      const runId = startOmpCli({
        subcommand: subcommand as OmpCliSubcommand,
        userArgs: args,
        onChunk(chunk, stream) {
          sendToRenderer(IPC.event.ompCliOutput, { runId, chunk, stream });
        },
        onDone(exitCode, killed) {
          sendToRenderer(IPC.event.ompCliDone, { runId, exitCode, killed });
        },
      });

      return { runId };
    },
  );

  // ── ompCliCancel ────────────────────────────────────────────────────────────
  handle(
    IPC.invoke.ompCliCancel,
    async (input: { runId?: unknown } = {}): Promise<void> => {
      const runId = typeof input?.runId === "string" ? input.runId.trim() : "";
      if (runId) cancelRun(runId);
    },
  );
}
