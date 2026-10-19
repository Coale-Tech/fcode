import { existsSync, readFileSync } from "node:fs";

import { RacpClient, wsClientTransport } from "@pi-desktop/racp";
import { RACP_WS_PATH } from "@pi-desktop/shared";

export type Endpoint = { url: string; token: string; pid: number; version: string };

const NOT_RUNNING = "fcode: Fcode is not running. Start the app and try again.";

/** Read the endpoint file or exit(2). */
export function readEndpoint(): Endpoint {
  const file = process.env.FCODE_ENDPOINT_FILE;
  if (!file || !existsSync(file)) {
    process.stderr.write(`${NOT_RUNNING}\n`);
    process.exit(2);
  }
  let data: Endpoint;
  try {
    data = JSON.parse(readFileSync(file, "utf8")) as Endpoint;
  } catch {
    process.stderr.write(`${NOT_RUNNING}\n`);
    process.exit(2);
  }
  try {
    process.kill(data.pid, 0);
  } catch {
    process.stderr.write(`${NOT_RUNNING}\n`);
    process.exit(2);
  }
  return data;
}

/** Connect to the local RACP server; exits 2 if the app is not running. */
export async function connect(): Promise<RacpClient> {
  const ep = readEndpoint();
  const client = new RacpClient({
    transport: wsClientTransport({ url: `${ep.url}${RACP_WS_PATH}`, token: ep.token }),
    client: { name: "fcode-cli", version: "1.0.0" },
    // turn/start waits on the agent runtime's cold start; worktree/add on provisioning copies.
    requestTimeoutMs: 120_000,
  });
  await client.connect();
  return client;
}

/** Exit 1 with a message on stderr — stable exit contract used across all commands. */
export function fail(message: string): never {
  process.stderr.write(`fcode: ${message}\n`);
  process.exit(1);
}

/** Print compact human text or raw JSON; used by every command. */
export function printResult(data: unknown, asJson: boolean): void {
  if (asJson) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
    return;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) { process.stdout.write("(none)\n"); return; }
    if (typeof data[0] === "object" && data[0] !== null) {
      const keys = Object.keys(data[0] as object);
      const rows = (data as Record<string, unknown>[]).map((row) =>
        keys.map((k) => String(row[k] ?? "")).join("\t"),
      );
      process.stdout.write([keys.join("\t"), ...rows].join("\n") + "\n");
      return;
    }
    process.stdout.write(data.map(String).join("\n") + "\n");
    return;
  }
  if (typeof data === "object" && data !== null) {
    process.stdout.write(
      Object.entries(data as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join("\n") + "\n",
    );
    return;
  }
  process.stdout.write(String(data) + "\n");
}
