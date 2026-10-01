/** omp settings groups (task/eval/browser/collab) IPC: get/set persisted host-side values. */
import { IPC } from "@pi-desktop/shared";
import type { OmpSettingsValues } from "@pi-desktop/shared";
import { readOmpSettings, validateOmpSettings, writeOmpSettings } from "../omp-settings-config";
import type { IpcRegistrar } from "./types";

export type OmpSettingsIpcDependencies = {
  registrar: IpcRegistrar;
  dataDir: string;
  restartSidecar: () => Promise<void>;
};

export function registerOmpSettingsIpc({ registrar, dataDir, restartSidecar }: OmpSettingsIpcDependencies): void {
  const { handle } = registrar;

  handle(IPC.invoke.ompSettingsGet, async (): Promise<OmpSettingsValues> => readOmpSettings(dataDir));

  handle(IPC.invoke.ompSettingsSet, async (patch: Record<string, unknown> = {}): Promise<OmpSettingsValues> => {
    const validated = validateOmpSettings(patch);
    // Merge with existing settings so a partial UI update doesn't erase other groups.
    const current = readOmpSettings(dataDir);
    const merged = { ...current, ...validated };
    writeOmpSettings(dataDir, merged);
    await restartSidecar();
    return merged;
  });
}
