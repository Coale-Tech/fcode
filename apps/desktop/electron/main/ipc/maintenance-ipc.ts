/**
 * IPC handlers for maintenance features: omp cleanse and autoresearch mode.
 *
 * cleanse      — runs `omp cleanse [args]` in the workspace via bundled binary (CLI path).
 *                /cleanse only has handleTui in omp, so the CLI is the reliable path.
 * autoresearch — dispatches `/autoresearch [goal]` to the active RPC session via
 *                the bridge's `omp.autoresearch` method (slash command has a `handle`).
 */
import { execFile, type ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";
import { ErrorCodes, IPC } from "@pi-desktop/shared";
import type { OmpCleanseResult, OmpAutoresearchResult } from "@pi-desktop/shared";
import type { AgentSidecar } from "../agent-sidecar";
import { resolveOmpBin, ompChildEnv } from "../omp-binary";
import type { IpcRegistrar } from "./types";

const execFileP = promisify(execFile);

// Path guard: reject null bytes — execFile is not a shell, but a null byte
// would silently truncate the path on some platforms.
const SAFE_PATH_RE = /^[^\0]+$/;

// ── Pure helpers (exported for unit testing) ──────────────────────────────────

/** Build argv for `omp cleanse`. */
export function buildCleanseArgs(opts: { request?: string; all?: boolean }): string[] {
  const args: string[] = ["cleanse"];
  if (opts.all === true) args.push("--all");
  if (typeof opts.request === "string" && opts.request.trim()) {
    args.push(opts.request.trim());
  }
  return args;
}

/** Extract a human-readable output string from an execFile rejection. */
export function parseCleanseError(rawErr: unknown): { ok: false; output: string } {
  let output = rawErr instanceof Error ? rawErr.message : String(rawErr);
  if (rawErr !== null && typeof rawErr === "object") {
    const e = rawErr as Record<string, unknown>;
    if (typeof e.message === "string" && e.message) output = e.message;
    const combined = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
    if (combined) output = combined;
  }
  return { ok: false, output };
}

/**
 * Build the slash-command message sent to the omp session.
 * Mirrors the bridge's `omp.autoresearch` case logic; exported for testing.
 */
export function buildAutoresearchMessage(goal?: string): string {
  const g = typeof goal === "string" ? goal.trim() : "";
  return g ? `/autoresearch ${g}` : "/autoresearch";
}

// ── IPC registration ──────────────────────────────────────────────────────────

export type MaintenanceIpcDependencies = {
  registrar: IpcRegistrar;
  getSidecar: () => AgentSidecar | null;
};

export function registerMaintenanceIpc({ registrar, getSidecar }: MaintenanceIpcDependencies): void {
  const { handle } = registrar;

  // ── omp cleanse ────────────────────────────────────────────────────────────
  // Runs `omp cleanse [request]` (optionally with --all) via the bundled binary
  // in the given workspace cwd. Times out after 5 minutes.
  handle(
    IPC.invoke.ompCleanse,
    async (input: { workspace?: unknown; request?: unknown; all?: unknown } = {}): Promise<OmpCleanseResult> => {
      const workspace = typeof input?.workspace === "string" ? input.workspace.trim() : "";
      if (!workspace)
        throw Object.assign(new Error("workspace path is required"), { errorCode: ErrorCodes.INVALID_ARGUMENT });
      if (!SAFE_PATH_RE.test(workspace))
        throw Object.assign(new Error("workspace path contains invalid characters"), { errorCode: ErrorCodes.INVALID_ARGUMENT });

      const bin = resolveOmpBin();
      const args = buildCleanseArgs({
        request: typeof input?.request === "string" ? input.request : undefined,
        all: input?.all === true,
      });
      const opts: ExecFileOptions = { cwd: workspace, timeout: 300_000, env: ompChildEnv() };
      try {
        const { stdout, stderr } = await execFileP(bin, args, opts) as { stdout: string; stderr: string };
        return { ok: true, output: (stdout + stderr).trim() };
      } catch (rawErr) {
        return parseCleanseError(rawErr);
      }
    },
  );

  // ── omp autoresearch ───────────────────────────────────────────────────────
  // Sends `/autoresearch [goal]` (or `/autoresearch off`) to the active omp
  // session via the bridge's `omp.autoresearch` RPC method.
  handle(
    IPC.invoke.ompAutoresearch,
    async (input: { goal?: unknown } = {}): Promise<OmpAutoresearchResult> => {
      const sidecar = getSidecar();
      if (!sidecar)
        throw Object.assign(new Error("omp sidecar unavailable"), { errorCode: ErrorCodes.AGENT_UNAVAILABLE });
      const goal = typeof input?.goal === "string" ? input.goal.trim() : "";
      return sidecar.call<OmpAutoresearchResult>("omp.autoresearch", goal ? { goal } : {});
    },
  );
}
