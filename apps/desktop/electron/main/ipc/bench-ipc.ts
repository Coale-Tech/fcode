/**
 * Bench IPC — registers every `pi-desktop/bench/*` channel.
 *
 * `list` delegates to `bench/discovery.ts` (owner: agent P, lane
 * feat/omp-bridge, DX10). All other channels drive `bench/supervisor.ts`.
 */
import { resolve } from "node:path";
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

  // Forward supervisor events to the renderer
  benchSupervisor.on("log", ({ process: proc, line }) => {
    mainWindow()?.webContents.send(IPC.event.benchLog, { process: proc, line });
  });

  benchSupervisor.on("status", (status) => {
    mainWindow()?.webContents.send(IPC.event.benchLog, {
      process: "start",
      line: { ts: Date.now(), text: `[status] ${status}` },
    });
  });

  // Gap 1 / T6: forward start-failure to renderer so it can show error UI
  benchSupervisor.on("failure", (payload) => {
    mainWindow()?.webContents.send(IPC.event.benchFailure, payload);
  });

  // Gap 5 / T6: forward port-conflict warnings to renderer
  benchSupervisor.on("warning", (payload) => {
    mainWindow()?.webContents.send(IPC.event.benchWarning, payload);
  });

  handle(IPC.invoke.benchList, async () => {
    // Gap 4 / T6: return failedRoots so the renderer can show PARTIAL/ERROR state
    return discoverBenches();
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
    const result = await benchSupervisor.start(benchPath);
    if (result.conflict) {
      // A different bench is already running/starting — refuse instead of
      // silently no-op'ing while claiming success (cross-bench Start bug).
      throw Object.assign(
        new Error(`bench "${benchSupervisor.activeBenchPath}" is already running; stop it before starting "${benchPath}"`),
        { errorCode: ErrorCodes.CONFLICT },
      );
    }
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

      if (verb === "migrate") {
        // `bench migrate` without a valid --site touches every site (or fails
        // opaquely); demand one that this bench actually has.
        const { benches } = await discoverBenches();
        const bench = benches.find((b) => resolve(b.path) === resolve(benchPath));
        if (!site || !bench?.sites.some((s) => s.name === site)) {
          throw Object.assign(
            new Error(`migrate requires a site that exists in bench "${benchPath}"${site ? ` (got "${site}")` : ""}`),
            { errorCode: ErrorCodes.INVALID_ARGUMENT },
          );
        }
      }

      const rawArgs = Array.isArray(input.args) ? input.args : [];
      const SAFE_ARG_RE = /^[a-zA-Z0-9@_\-.\/]+$/;
      const invalidArg = rawArgs.find((a) => typeof a !== "string" || !SAFE_ARG_RE.test(a));
      if (invalidArg !== undefined) {
        throw Object.assign(new Error(`invalid arg element: ${JSON.stringify(invalidArg)}`), {
          errorCode: ErrorCodes.INVALID_ARGUMENT,
        });
      }
      const result = await benchSupervisor.runOneShot({
        benchPath,
        site: site ?? null,
        verb,
        args: rawArgs as string[],
      });

      return result;
    },
  );
}
