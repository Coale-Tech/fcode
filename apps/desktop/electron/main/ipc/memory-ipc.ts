/** Memory IPC: config get/set (token write-only) and live status from omp. */
import { IPC } from "@pi-desktop/shared";
import type { MemoryConfig, MemoryConfigView, OmpMemoryStatusResult } from "@pi-desktop/shared";
import type { HostProcess } from "../host-process";
import type { AgentSidecar } from "../agent-sidecar";
import { MEMORY_TOKEN_SECRET_REF, readMemoryConfig, validateMemoryConfig, writeMemoryConfig } from "../memory-config";
import type { IpcRegistrar } from "./types";

export type MemoryIpcDependencies = {
  registrar: IpcRegistrar;
  dataDir: string;
  getHost: () => HostProcess | null;
  getSidecar: () => AgentSidecar | null;
  restartSidecar: () => Promise<void>;
};

export function registerMemoryIpc({ registrar, dataDir, getHost, getSidecar, restartSidecar }: MemoryIpcDependencies): void {
  const { handle } = registrar;

  const hasToken = async (): Promise<boolean> => {
    try {
      const res = await getHost()?.call<{ has: boolean }>("secrets.has", { secretRef: MEMORY_TOKEN_SECRET_REF });
      return res?.has === true;
    } catch {
      return false;
    }
  };

  const view = async (): Promise<MemoryConfigView> => ({ ...readMemoryConfig(dataDir), hasToken: await hasToken() });

  handle(IPC.invoke.memoryGetConfig, view);

  handle(IPC.invoke.memorySetConfig, async (input: Partial<MemoryConfig> & { token?: string } = {}) => {
    const config = validateMemoryConfig(input);
    const host = getHost();
    if (input.token && host) {
      await host.call("secrets.set", { secretRef: MEMORY_TOKEN_SECRET_REF, value: input.token });
    }
    writeMemoryConfig(dataDir, config);
    await restartSidecar();
    return view();
  });

  handle(IPC.invoke.ompMemoryStatus, async () => {
    const sidecar = getSidecar();
    if (!sidecar) throw Object.assign(new Error("omp sidecar unavailable"), { errorCode: "AGENT_UNAVAILABLE" });
    return sidecar.call<OmpMemoryStatusResult>("omp.memory.status");
  });
}
