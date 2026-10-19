import { existsSync } from "node:fs";
import { chmod, mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { app } from "electron";

import type { AgentHost } from "@pi-desktop/agent-host";
import {
  DeviceTokenAuthenticator,
  MemoryCredentialStore,
  RacpServer,
  bindRacpWebSocket,
  hashToken,
  newDeviceToken,
  type RacpHostOperations,
  type WsBinding,
} from "@pi-desktop/racp";
import { APP_VERSION } from "@pi-desktop/shared";

export type LocalRacpServer = {
  port: number;
  token: string;
  close(): Promise<void>;
};

type StartDeps = {
  agentHost: AgentHost;
  operations: RacpHostOperations;
  log: (level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) => void;
};

export async function startLocalRacpServer(deps: StartDeps): Promise<LocalRacpServer> {
  const store = new MemoryCredentialStore();
  const authenticator = new DeviceTokenAuthenticator(store);

  // Mint one owner token directly — no pairing flow needed (correction 2).
  const token = newDeviceToken();
  await store.saveDevice({
    deviceId: "fcode-cli",
    label: "fcode-cli",
    roles: ["owner"],
    tokenHash: hashToken(token),
    createdAt: new Date().toISOString(),
  });

  const server = new RacpServer({
    agentHost: deps.agentHost,
    operations: deps.operations,
    authenticator,
    hostId: "fcode-desktop-local",
    serverName: "fcode",
    serverVersion: APP_VERSION,
    log: deps.log,
  });

  const binding: WsBinding = await bindRacpWebSocket({
    server,
    authenticator,
    host: "127.0.0.1",
    port: 0, // OS-assigned
    log: deps.log,
  });

  const { port } = binding.address;
  const endpointPath = join(app.getPath("userData"), "cli-endpoint.json");

  await writeFile(
    endpointPath,
    JSON.stringify({ url: `ws://127.0.0.1:${port}`, token, pid: process.pid, version: APP_VERSION }),
    { mode: 0o600 },
  );

  // Write shims so agents can call `fcode` from the integrated terminal.
  await writeCliShims(endpointPath, deps.log);

  return {
    port,
    token,
    async close() {
      server.close();
      await binding.close();
      await unlink(endpointPath).catch(() => undefined);
    },
  };
}

/**
 * Resolve the bundled CLI entry point. Packaged: `<resourcesPath>/fcode-cli/cli.js`.
 * Dev: `dist-bundle/cli.js` → `dist/cli.js` fallbacks.
 */
export function cliEntry(): string | null {
  // Packaged app (electron-builder copies it via extraResources)
  if (app.isPackaged) {
    const packed = join(process.resourcesPath, "fcode-cli", "cli.js");
    if (existsSync(packed)) return packed;
  }

  // Development: repo-relative paths
  const appRoot = join(app.getAppPath(), "..", "..");
  for (const rel of ["apps/fcode-cli/dist-bundle/cli.js", "apps/fcode-cli/dist/cli.js"]) {
    const p = join(appRoot, rel);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Write a shell shim at `<userData>/cli/bin/fcode` (and `.cmd` on win32) that
 * invokes Electron-as-Node so no system `node` is required (correction 12).
 * Sets `process.env.FCODE_CLI_DIR` so FileBird's PTY prepends it to PATH.
 */
export async function writeCliShims(
  endpointPath: string,
  log?: (level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) => void,
): Promise<void> {
  const entry = cliEntry();
  if (!entry) {
    log?.("warn", "fcode-cli bundle not found; CLI shim skipped", {});
    return;
  }

  const shimDir = join(app.getPath("userData"), "cli", "bin");
  await mkdir(shimDir, { recursive: true });

  // Export FCODE_CLI_DIR so FileBird's shellEnvironment prepends it to PATH.
  process.env.FCODE_CLI_DIR = shimDir;

  const execPath = process.execPath;

  // Unix shim (macOS + Linux)
  // Single-quote for sh: JSON quoting would still expand `$` and backticks in a path.
  const sq = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;
  const shimUnix = [
    "#!/bin/sh",
    `FCODE_ENDPOINT_FILE=${sq(endpointPath)} ELECTRON_RUN_AS_NODE=1 exec ${sq(execPath)} ${sq(entry)} "$@"`,
  ].join("\n");

  const unixPath = join(shimDir, "fcode");
  await writeFile(unixPath, shimUnix, "utf8");
  await chmod(unixPath, 0o755);

  // Windows batch shim
  if (process.platform === "win32") {
    const shimCmd = [
      "@echo off",
      `set FCODE_ENDPOINT_FILE=${endpointPath}`,
      `set ELECTRON_RUN_AS_NODE=1`,
      `"${execPath}" "${entry}" %*`,
    ].join("\r\n");
    await writeFile(join(shimDir, "fcode.cmd"), shimCmd, "utf8");
  }
}
