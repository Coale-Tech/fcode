/**
 * IPC handlers for omp non-RPC modes (Slice I):
 *   - ompTuiOpen   — write a temp launch script and return its path + cwd
 *   - ompAcpInfo   — return ACP command + Zed/JetBrains editor snippets
 */
import { writeFileSync } from "node:fs";
import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { IPC } from "@pi-desktop/shared";
import type { OmpTuiOpenResult, OmpAcpInfoResult } from "@pi-desktop/shared";
import { ompProviderEnv } from "@pi-desktop/host-runtime";
import type { IpcRegistrar } from "./types";
import type { HostProcess } from "../host-process";
import type { HostProviderRecord } from "@pi-desktop/host-runtime";
import { ompAgentDir } from "../omp-agent-dir";
import { resolveOmpBin } from "../omp-binary";

// ── Script builder ─────────────────────────────────────────────────────────────

/** Single-quote a shell argument, escaping embedded single quotes. */
export function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/**
 * Pure: build the TUI launch script content as a string.
 * Self-delete (`rm -f -- "$0"`) comes before env exports so secrets
 * are removed from disk even if exec fails partway through the env block.
 */
export function buildTuiScriptContent(
  binaryPath: string,
  sessionDir: string,
  overlayPath: string,
  env: Record<string, string>,
): string {
  const lines: string[] = ["#!/bin/sh", "set -e", 'rm -f -- "$0"'];
  for (const [k, v] of Object.entries(env)) {
    lines.push(`export ${k}=${shellQuote(v)}`);
  }
  lines.push(
    `exec ${shellQuote(binaryPath)} --config ${shellQuote(overlayPath)} --session-dir ${shellQuote(sessionDir)}`,
    "",
  );
  return lines.join("\n");
}

function buildTuiScript(
  binaryPath: string,
  sessionDir: string,
  overlayPath: string,
  env: Record<string, string>,
  dataDir: string,
): string {
  const scriptPath = join(dataDir, `omp-tui-${Date.now()}.sh`);
  writeFileSync(scriptPath, buildTuiScriptContent(binaryPath, sessionDir, overlayPath, env), { mode: 0o600 });
  return scriptPath;
}

/** Sweep stale omp-tui-*.sh files older than 24 h from dataDir. Best-effort. */
export async function sweepStaleTuiScripts(dataDir: string): Promise<void> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let entries: string[];
  try { entries = await readdir(dataDir); } catch { return; }
  for (const name of entries) {
    if (!name.startsWith("omp-tui-") || !name.endsWith(".sh")) continue;
    const p = join(dataDir, name);
    try {
      const s = await stat(p);
      if (s.mtimeMs < cutoff) await unlink(p);
    } catch { /* best-effort */ }
  }
}


// ── ACP info builder ──────────────────────────────────────────────────────────

export function buildAcpInfo(binaryPath: string, overlayPath: string): OmpAcpInfoResult {
  const command = `${binaryPath} acp --config ${overlayPath}`;
  const zedSnippet = JSON.stringify(
    {
      omp: {
        name: "omp",
        command: binaryPath,
        args: ["acp", "--config", overlayPath],
      },
    },
    null,
    2,
  );
  const jetbrainsSnippet = JSON.stringify(
    {
      name: "omp",
      command: binaryPath,
      args: ["acp", "--config", overlayPath],
    },
    null,
    2,
  );
  return { command, binaryPath, overlayPath, zedSnippet, jetbrainsSnippet };
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerOmpNonRpcIpc({
  registrar,
  dataDir,
  getHost,
  listRuntimeProviders,
}: {
  registrar: IpcRegistrar;
  dataDir: string;
  getHost: () => HostProcess | null;
  listRuntimeProviders: (filtered: boolean) => Promise<HostProviderRecord[]>;
}): void {
  const overlayPath = join(dataDir, "omp-overlay.yml");

  registrar.handle(IPC.invoke.ompTuiOpen, async (_event, input: { sessionId: string; projectPath?: string }) => {
    void sweepStaleTuiScripts(dataDir); // best-effort, non-blocking
    const binaryPath = resolveOmpBin();
    const sessionDir = join(dataDir, "omp-threads", encodeURIComponent(input.sessionId));

    let env: Record<string, string> = {};
    const host = getHost();
    if (host) {
      try {
        env = await ompProviderEnv(host, await listRuntimeProviders(false), dataDir);
      } catch {
        // Non-fatal — TUI starts without provider injection.
      }
    }
    env = { ...env, PI_CODING_AGENT_DIR: ompAgentDir() };

    const scriptPath = buildTuiScript(binaryPath, sessionDir, overlayPath, env, dataDir);
    return { scriptPath, cwd: input.projectPath ?? null } satisfies OmpTuiOpenResult;
  });

  registrar.handle(IPC.invoke.ompAcpInfo, async () => {
    return buildAcpInfo(resolveOmpBin(), overlayPath) satisfies OmpAcpInfoResult;
  });
}
