/**
 * Bench IPC — registers every `pi-desktop/bench/*` channel.
 *
 * `list` delegates to `bench/discovery.ts` (owner: agent P, lane
 * feat/omp-bridge, DX10). All other channels drive `bench/supervisor.ts`.
 */
import { ErrorCodes, IPC } from "@pi-desktop/shared";
import { discoverBenches } from "../bench/discovery";
import { benchSupervisor, shouldAutoApproveVerb } from "../bench/supervisor";
import type { IpcRegistrar } from "./types";
import type { BrowserWindow } from "electron";

export type BenchIpcDependencies = {
  registrar: IpcRegistrar;
  mainWindow: () => BrowserWindow | null;
};

export function registerBenchIpc({ registrar, mainWindow }: BenchIpcDependencies): void {
  const { handle } = registrar;

  // Forward supervisor log events to the renderer
  benchSupervisor.on("log", ({ process: proc, line }) => {
    mainWindow()?.webContents.send(IPC.event.benchLog, { process: proc, line });
  });

  benchSupervisor.on("status", (status) => {
    mainWindow()?.webContents.send(IPC.event.benchLog, {
      process: "start",
      line: { ts: Date.now(), text: `[status] ${status}` },
    });
  });

  handle(IPC.invoke.benchList, async () => {
    return { benches: await discoverBenches() };
  });

  handle(IPC.invoke.benchStatus, async () => {
    return {
      running: benchSupervisor.getStatus() === "running",
      status: benchSupervisor.getStatus(),
      benchPath: benchSupervisor.activeBenchPath,
      site: benchSupervisor.activeSite,
    };
  });

  handle(IPC.invoke.benchStart, async (input: { benchPath?: string } = {}) => {
    const benchPath = String(input.benchPath ?? "").trim();
    if (!benchPath) {
      throw Object.assign(new Error("benchPath is required"), {
        errorCode: ErrorCodes.INVALID_ARGUMENT,
      });
    }
    await benchSupervisor.start(benchPath);
    return { started: true };
  });

  handle(IPC.invoke.benchStop, async (input: { benchPath?: string } = {}) => {
    const benchPath = String(input.benchPath ?? "").trim();
    if (!benchPath) {
      throw Object.assign(new Error("benchPath is required"), {
        errorCode: ErrorCodes.INVALID_ARGUMENT,
      });
    }
    if (benchSupervisor.activeBenchPath !== benchPath) {
      // The caller's idea of "the active bench" is stale (e.g. it selected a
      // different bench in the UI) — refuse instead of stopping whichever
      // bench the supervisor actually has running (cross-bench Stop bug).
      throw Object.assign(new Error(`bench "${benchPath}" is not the active bench`), {
        errorCode: ErrorCodes.CONFLICT,
      });
    }
    benchSupervisor.stop();
    return { stopped: true };
  });

  handle(
    IPC.invoke.benchRun,
    async (input: { benchPath?: string; site?: string; verb?: string; args?: string[] } = {}) => {
      const benchPath = String(input.benchPath ?? benchSupervisor.activeBenchPath ?? "").trim();
      const site = input.site != null ? String(input.site).trim() : benchSupervisor.activeSite;
      const verb = String(input.verb ?? "").trim();

      if (!benchPath || !verb) {
        throw Object.assign(new Error("benchPath and verb are required"), {
          errorCode: ErrorCodes.INVALID_ARGUMENT,
        });
      }

      if (!shouldAutoApproveVerb(verb)) {
        throw Object.assign(
          new Error(`bench verb "${verb}" is not on the allow-list; use benchStart/benchStop for lifecycle`),
          { errorCode: ErrorCodes.FORBIDDEN },
        );
      }

      const result = await benchSupervisor.runOneShot({
        benchPath,
        site: site ?? null,
        verb,
        args: input.args ?? [],
      });

      return result;
    },
  );
}
