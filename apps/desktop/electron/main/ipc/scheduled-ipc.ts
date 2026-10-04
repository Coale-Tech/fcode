import { readFile, writeFile } from "node:fs/promises";
import { IPC } from "@pi-desktop/shared";
import type { HostProcess } from "../host-process";
import type { IpcRegistrar } from "./types";
import { executeScheduledTask, getSchedulerHealth } from "../runtime/scheduled-runner";

export type ScheduledIpcDependencies = {
  registrar: IpcRegistrar;
  getHost: () => HostProcess | null;
  scheduledRunsBySession: Map<string, string>;
  invoke: (channel: string, args: readonly unknown[]) => Promise<unknown>;
  isQuitting: () => boolean;
  /** Save-dialog path for an export, or null when cancelled (keeps this module electron-free). */
  pickExportPath: () => Promise<string | null>;
  /** Open-dialog path for an import, or null when cancelled. */
  pickImportPath: () => Promise<string | null>;
};

export function registerScheduledIpc({
  registrar,
  getHost,
  scheduledRunsBySession,
  invoke,
  isQuitting,
  pickExportPath,
  pickImportPath,
}: ScheduledIpcDependencies): void {
  registrar.handle(IPC.invoke.scheduledListRuns, async () => {
    const host = getHost();
    if (!host) throw new Error("host unavailable");
    return host.call("scheduled.listRuns", { limit: 100 });
  });
  registrar.handle(IPC.invoke.scheduledExecute, async (id: string, automatic = false) => {
    if (typeof id !== "string" || typeof automatic !== "boolean") throw new Error("invalid task request");
    const host = getHost();
    if (!host) throw new Error("host unavailable");
    return executeScheduledTask({
      host, id, automatic, runs: scheduledRunsBySession,
      isCurrent: () => !isQuitting() && getHost() === host,
      prompt: (sessionId, content) => invoke(IPC.invoke.agentPrompt, [{ sessionId, content }]),
    });
  });
  const handle = (channel: string, fn: (...args: any[]) => Promise<any>) => {
    registrar.handle(channel, async (...args) => fn(getHost(), ...args));
  };

  handle(IPC.invoke.scheduledList, async (host: HostProcess | null) => {
    if (!host) throw new Error("host unavailable");
    const result = await host.call<{ tasks: unknown[] }>("scheduled.list");
    return { ...result, health: getSchedulerHealth() };
  });
  handle(IPC.invoke.scheduledCreate, async (host: HostProcess | null, input: any = {}) => {
    if (!host) throw new Error("host unavailable");
    const prompt = String(input.prompt || "").trim();
    if (!prompt) throw new Error("prompt required");
    return host.call("scheduled.create", { ...input, prompt });
  });
  handle(IPC.invoke.scheduledUpdate, async (host: HostProcess | null, input: any = {}) => {
    if (!host) throw new Error("host unavailable");
    return host.call("scheduled.update", input);
  });
  handle(IPC.invoke.scheduledDelete, async (host: HostProcess | null, id: string) => {
    if (!host) throw new Error("host unavailable");
    return host.call("scheduled.delete", { id });
  });
  handle(IPC.invoke.scheduledRun, async (host: HostProcess | null, id: string) => {
    if (!host) throw new Error("host unavailable");
    const result = await host.call<{
      sessionId: string;
      prompt: string;
      task: unknown;
      runId: string;
    }>("scheduled.run", { id });
    scheduledRunsBySession.set(result.sessionId, result.runId);
    return result;
  });
  handle(IPC.invoke.scheduledExport, async (host: HostProcess | null) => {
    if (!host) throw new Error("host unavailable");
    const { tasks } = await host.call<{ tasks: unknown[] }>("scheduled.list");
    const path = await pickExportPath();
    if (!path) return null;
    await writeFile(path, JSON.stringify(tasks, null, 2));
    return { path, count: tasks.length };
  });
  handle(IPC.invoke.scheduledImport, async (host: HostProcess | null) => {
    if (!host) throw new Error("host unavailable");
    const path = await pickImportPath();
    if (!path) return null;
    const tasks: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(tasks)) throw new Error("expected a JSON array of scheduled tasks");
    // Host inserts by id with INSERT OR IGNORE: re-importing the same file is a no-op.
    // Tasks arrive paused: execution stays device-local, as in config sync.
    return host.call<{ imported: number }>("scheduled.import", {
      tasks: tasks.map((task) => ({ ...task, enabled: false })),
    });
  });
}
