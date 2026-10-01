/** Tool approval mode IPC: get/set persisted host-side mode. */
import { IPC } from "@pi-desktop/shared";
import type { ToolApprovalMode } from "@pi-desktop/shared";
import { readApprovalMode, validateApprovalMode, writeApprovalMode } from "../approval-mode-config";
import type { IpcRegistrar } from "./types";

export type ApprovalModeIpcDependencies = {
  registrar: IpcRegistrar;
  dataDir: string;
  restartSidecar: () => Promise<void>;
};

export function registerApprovalModeIpc({ registrar, dataDir, restartSidecar }: ApprovalModeIpcDependencies): void {
  const { handle } = registrar;

  handle(IPC.invoke.toolApprovalModeGet, async (): Promise<ToolApprovalMode> => readApprovalMode(dataDir));

  handle(IPC.invoke.toolApprovalModeSet, async (input: { mode?: unknown } = {}): Promise<ToolApprovalMode> => {
    const mode = validateApprovalMode(input?.mode);
    writeApprovalMode(dataDir, mode);
    await restartSidecar();
    return mode;
  });
}
