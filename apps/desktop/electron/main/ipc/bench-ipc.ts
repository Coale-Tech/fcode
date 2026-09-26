/**
 * Bench IPC — scaffold.
 *
 * Registers every `pi-desktop/bench/*` channel (plan Approach step 6). Owner
 * going forward: agent N (lane `feat/bench-cockpit`), which wires `start`,
 * `stop`, `run` and the `pi-desktop/bench/log` event to `bench/supervisor.ts`
 * (DX4, E3, E4, E21) and `status` to the supervisor's live state.
 *
 * `list` is wired now, against the `bench/discovery.ts` stub — agent P
 * (lane `feat/omp-bridge`, DX10) replaces the stub with a real filesystem
 * scan; this handler does not change when that lands.
 */
import { ErrorCodes, IPC } from "@pi-desktop/shared";
import { discoverBenches } from "../bench/discovery";
import type { IpcRegistrar } from "./types";

export type BenchIpcDependencies = {
  registrar: IpcRegistrar;
};

function notImplemented(action: string): never {
  throw Object.assign(new Error(`bench ${action} is not yet implemented`), {
    errorCode: ErrorCodes.UNSUPPORTED,
  });
}

export function registerBenchIpc({ registrar }: BenchIpcDependencies): void {
  const { handle } = registrar;

  handle(IPC.invoke.benchList, async () => {
    return { benches: await discoverBenches() };
  });

  handle(IPC.invoke.benchStatus, async (_benchId: unknown) => {
    return { running: false, benchId: null };
  });

  handle(IPC.invoke.benchStart, async (_benchId: unknown) => {
    notImplemented("start");
  });

  handle(IPC.invoke.benchStop, async (_benchId: unknown) => {
    notImplemented("stop");
  });

  handle(IPC.invoke.benchRun, async (_benchId: unknown, _command: unknown) => {
    notImplemented("run");
  });
}
