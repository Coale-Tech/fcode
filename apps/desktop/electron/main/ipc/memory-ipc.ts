/**
 * Memory IPC: config get/set (token write-only), live status from omp, and
 * Hindsight extras — mental-model list/refresh and Frappe bench bootstrap.
 */
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { IPC } from "@pi-desktop/shared";
import type {
  BenchBootstrapResult,
  HindsightListMentalModelsResult,
  HindsightRefreshMentalModelResult,
  HindsightSetBankMissionResult,
  MemoryConfig,
  MemoryConfigView,
  OmpMemoryStatusResult,
  OmpMemoryBudgetResult,
} from "@pi-desktop/shared";
import type { HostProcess } from "../host-process";
import type { AgentSidecar } from "../agent-sidecar";
import { MEMORY_TOKEN_SECRET_REF, readMemoryConfig, validateMemoryConfig, writeMemoryConfig } from "../memory-config";
import {
  hindsightCreateBank,
  hindsightListMentalModels,
  hindsightRefreshMentalModel,
  hindsightRetain,
} from "../hindsight-http";
import { benchSupervisor } from "../bench/supervisor";
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

  const getToken = async (): Promise<string | null> => {
    try {
      const res = await getHost()?.call<{ value: string | null }>("secrets.get", { secretRef: MEMORY_TOKEN_SECRET_REF });
      return res?.value ?? null;
    } catch {
      return null;
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

  handle(IPC.invoke.ompMemoryBudget, async () => {
    const sidecar = getSidecar();
    if (!sidecar) throw Object.assign(new Error("omp sidecar unavailable"), { errorCode: "AGENT_UNAVAILABLE" });
    return sidecar.call<OmpMemoryBudgetResult>("omp.memory.budget");
  });

  // ── Hindsight mental-model list ──────────────────────────────────────────

  handle(IPC.invoke.hindsightListMentalModels, async (): Promise<HindsightListMentalModelsResult> => {
    const config = readMemoryConfig(dataDir);
    if (config.backend !== "hindsight" || !config.hindsightUrl) {
      throw Object.assign(new Error("Hindsight is not configured"), { errorCode: "INVALID_STATE" });
    }
    const token = await getToken();
    const bankId = config.hindsightBank ?? "omp";
    const raw = await hindsightListMentalModels(config.hindsightUrl, token, bankId);
    return {
      models: raw.map((m) => ({
        id: m.id,
        name: m.name,
        content: m.content,
        tags: m.tags,
        updatedAt: m.updated_at,
      })),
    };
  });

  // ── Hindsight mental-model refresh ───────────────────────────────────────

  handle(
    IPC.invoke.hindsightRefreshMentalModel,
    async (input: { modelId?: unknown } = {}): Promise<HindsightRefreshMentalModelResult> => {
      const modelId = typeof input?.modelId === "string" ? input.modelId.trim() : "";
      if (!modelId) throw Object.assign(new Error("modelId required"), { errorCode: "INVALID_ARGUMENT" });
      const config = readMemoryConfig(dataDir);
      if (config.backend !== "hindsight" || !config.hindsightUrl) {
        throw Object.assign(new Error("Hindsight is not configured"), { errorCode: "INVALID_STATE" });
      }
      const token = await getToken();
      const bankId = config.hindsightBank ?? "omp";
      const res = await hindsightRefreshMentalModel(config.hindsightUrl, token, bankId, modelId);
      return { operationId: res.operation_id };
    },
  );

  // ── Hindsight bank mission update ────────────────────────────────────────

  handle(
    IPC.invoke.hindsightSetBankMission,
    async (input: { bankMission?: unknown; retainMission?: unknown } = {}): Promise<HindsightSetBankMissionResult> => {
      const config = readMemoryConfig(dataDir);
      if (config.backend !== "hindsight" || !config.hindsightUrl) {
        throw Object.assign(new Error("Hindsight is not configured"), { errorCode: "INVALID_STATE" });
      }
      const bankMission = typeof input?.bankMission === "string" ? input.bankMission.trim() : undefined;
      const retainMission = typeof input?.retainMission === "string" ? input.retainMission.trim() : undefined;
      const token = await getToken();
      const bankId = config.hindsightBank ?? "omp";
      await hindsightCreateBank(config.hindsightUrl, token, bankId, {
        reflectMission: bankMission || undefined,
        retainMission: retainMission || undefined,
      });
      // Persist mission text locally so it pre-fills on next open.
      writeMemoryConfig(dataDir, {
        ...config,
        hindsightBankMission: bankMission || undefined,
        hindsightRetainMission: retainMission || undefined,
      });
      return { ok: true };
    },
  );

  // ── Frappe bench bootstrap ───────────────────────────────────────────────

  handle(IPC.invoke.benchBootstrapMemory, async (): Promise<BenchBootstrapResult> => {
    const config = readMemoryConfig(dataDir);

    // Determine which bench to seed from: prefer the active supervisor bench,
    // fall back to the first discovered bench.
    const benchPath = benchSupervisor.activeBenchPath ?? null;
    if (!benchPath) {
      throw Object.assign(new Error("No active bench — start a bench first"), { errorCode: "INVALID_STATE" });
    }

    // Read installed apps (top-level directories in apps/).
    const appsDir = join(benchPath, "apps");
    let apps: string[] = [];
    try {
      const entries = await readdir(appsDir, { withFileTypes: true });
      apps = entries
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .map((d) => d.name);
    } catch {
      // apps dir unreadable; proceed with empty list
    }

    // Read sites from sites/ directory.
    const sitesDir = join(benchPath, "sites");
    let sites: string[] = [];
    try {
      const entries = await readdir(sitesDir, { withFileTypes: true });
      sites = entries
        .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "assets")
        .map((d) => d.name);
    } catch {
      // sites dir unreadable
    }

    const benchName = benchPath.split("/").pop() ?? benchPath;
    const content =
      `Frappe bench identity:\n` +
      `- Bench path: ${benchPath}\n` +
      `- Bench name: ${benchName}\n` +
      `- Installed apps: ${apps.length > 0 ? apps.join(", ") : "(none detected)"}\n` +
      `- Sites: ${sites.length > 0 ? sites.join(", ") : "(none detected)"}`;

    if (config.backend === "hindsight" && config.hindsightUrl) {
      const token = await getToken();
      const bankId = config.hindsightBank ?? "omp";
      // Ensure bank exists before retaining.
      await hindsightCreateBank(config.hindsightUrl, token, bankId, {});
      await hindsightRetain(config.hindsightUrl, token, bankId, content, {
        source: "bench-bootstrap",
        bench: benchName,
      });
      return { ok: true, benchPath, sites, apps, retained: true };
    }

    if (config.backend === "mnemopi") {
      // Mnemopi is managed automatically by the omp agent; manual seeding is
      // not needed. Return ok with a note.
      return {
        ok: true,
        benchPath,
        sites,
        apps,
        retained: false,
        message: "Mnemopi manages context automatically — no manual seeding needed.",
      };
    }

    return {
      ok: false,
      benchPath,
      sites,
      apps,
      retained: false,
      message: "Memory backend is off.",
    };
  });
}
