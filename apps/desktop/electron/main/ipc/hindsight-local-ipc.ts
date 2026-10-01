/**
 * IPC for the managed local Hindsight server: detect launchers, start/stop
 * the supervisor, and push state events to the renderer.
 */
import { IPC } from "@pi-desktop/shared";
import type { HindsightLocalState } from "@pi-desktop/shared";
import type { BrowserWindow } from "electron";
import { hindsightSupervisor, HINDSIGHT_DEFAULT_PORT } from "../hindsight-local/supervisor";
import type { IpcRegistrar } from "./types";

export type HindsightLocalIpcDependencies = {
  registrar: IpcRegistrar;
  mainWindow: () => BrowserWindow | null;
};

export function registerHindsightLocalIpc({ registrar, mainWindow }: HindsightLocalIpcDependencies): void {
  const { handle } = registrar;

  // Push status events to renderer
  hindsightSupervisor.on("status", (state: HindsightLocalState) => {
    mainWindow()?.webContents.send(IPC.event.hindsightLocalStatus, state);
  });

  handle(IPC.invoke.hindsightLocalDetect, async () => {
    const launchers = await hindsightSupervisor.detect();
    return { launchers, state: hindsightSupervisor.getState() };
  });

  handle(IPC.invoke.hindsightLocalStart, async (input: { port?: number } = {}) => {
    await hindsightSupervisor.start(input.port ?? HINDSIGHT_DEFAULT_PORT);
    return hindsightSupervisor.getState();
  });

  handle(IPC.invoke.hindsightLocalStop, async () => {
    hindsightSupervisor.stop();
    return hindsightSupervisor.getState();
  });

  handle(IPC.invoke.hindsightLocalStatus, async () => hindsightSupervisor.getState());
}
