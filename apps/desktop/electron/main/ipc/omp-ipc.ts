/**
 * OMP IPC — registers all `pi-desktop/omp/*` channels (DX14 / plan §9).
 *
 * Each handler validates its inputs at the main-process trust boundary and
 * forwards the call to the omp sidecar via `sidecar.call("omp.*", params)`.
 * The bridge's `ompCallAndForward` resolves with the `data` field of the omp
 * RPC response and rejects with an error on failure.
 *
 * The `open_url` notification emitted by the bridge during `omp.login.start`
 * is handled in `runtime/sidecar.ts` (wireSidecar), not here.
 */
import { ErrorCodes, IPC } from "@pi-desktop/shared";
import type {
  OmpCommandsListResult,
  OmpLoginProvidersResult,
  OmpLoginStartResult,
  OmpModelsListResult,
  OmpModelsSetResult,
  OmpSessionBranchResult,
  OmpSessionStatsResult,
  OmpShareResult,
  OmpStateResult,
  OmpSubagentListResult,
  OmpSubagentMessagesResult,
  OmpThinkingLevelsResult,
} from "@pi-desktop/shared";
import type { AgentSidecar } from "../agent-sidecar";
import type { IpcRegistrar } from "./types";

export type OmpIpcDependencies = {
  registrar: IpcRegistrar;
  getSidecar: () => AgentSidecar | null;
};

/** Throw a typed INVALID_ARGUMENT error. */
function invalid(message: string): never {
  throw Object.assign(new Error(message), { errorCode: ErrorCodes.INVALID_ARGUMENT });
}

/** Throw a typed AGENT_UNAVAILABLE error. */
function unavailable(): never {
  throw Object.assign(new Error("omp sidecar unavailable"), {
    errorCode: ErrorCodes.AGENT_UNAVAILABLE,
  });
}

/** Register all omp IPC channels. */
export function registerOmpIpc({ registrar, getSidecar }: OmpIpcDependencies): void {
  const { handle } = registrar;

  // ── omp.models.list ────────────────────────────────────────────────────────
  handle(IPC.invoke.ompModelsList, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpModelsListResult>("omp.models.list");
  });

  // ── omp.models.set ─────────────────────────────────────────────────────────
  handle(IPC.invoke.ompModelsSet, async (input: { provider?: unknown; modelId?: unknown } = {}) => {
    const provider = typeof input?.provider === "string" ? input.provider.trim() : "";
    const modelId = typeof input?.modelId === "string" ? input.modelId.trim() : "";
    if (!provider) invalid("provider required");
    if (!modelId) invalid("modelId required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpModelsSetResult>("omp.models.set", { provider, modelId });
  });

  // ── omp.thinking.levels ────────────────────────────────────────────────────
  handle(IPC.invoke.ompThinkingLevels, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpThinkingLevelsResult>("omp.thinking.levels");
  });

  // ── omp.thinking.set ───────────────────────────────────────────────────────
  handle(IPC.invoke.ompThinkingSet, async (input: { level?: unknown } = {}) => {
    const level = typeof input?.level === "string" ? input.level.trim() : "";
    if (!level) invalid("level required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.thinking.set", { level });
  });

  // ── omp.commands.list ──────────────────────────────────────────────────────
  handle(IPC.invoke.ompCommandsList, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpCommandsListResult>("omp.commands.list");
  });

  // ── omp.state ──────────────────────────────────────────────────────────────
  handle(IPC.invoke.ompState, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpStateResult>("omp.state");
  });

  // ── omp.login.providers ────────────────────────────────────────────────────
  handle(IPC.invoke.ompLoginProviders, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpLoginProvidersResult>("omp.login.providers");
  });

  // ── omp.login.start ────────────────────────────────────────────────────────
  handle(IPC.invoke.ompLoginStart, async (input: { providerId?: unknown } = {}) => {
    const providerId = typeof input?.providerId === "string" ? input.providerId.trim() : "";
    if (!providerId) invalid("providerId required");
    const sidecar = getSidecar() ?? unavailable();
    // The bridge may emit a `sidecar.notification { type: "open_url" }` during
    // this call; that notification is handled in runtime/sidecar.ts wireSidecar.
    return sidecar.call<OmpLoginStartResult>("omp.login.start", { providerId });
  });

  // ── omp.session.branch ─────────────────────────────────────────────────────
  handle(IPC.invoke.ompSessionBranch, async (input: { entryId?: unknown } = {}) => {
    const entryId = typeof input?.entryId === "string" ? input.entryId.trim() : "";
    if (!entryId) invalid("entryId required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpSessionBranchResult>("omp.session.branch", { entryId });
  });

  // ── omp.session.rename ─────────────────────────────────────────────────────
  handle(IPC.invoke.ompSessionRename, async (input: { name?: unknown } = {}) => {
    const name = typeof input?.name === "string" ? input.name.trim() : "";
    if (!name) invalid("name required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.session.rename", { name });
  });

  // ── omp.session.stats ──────────────────────────────────────────────────────
  handle(IPC.invoke.ompSessionStats, async () => {
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<OmpSessionStatsResult>("omp.session.stats");
  });

  // ── omp.auto-compaction.set ────────────────────────────────────────────────
  handle(IPC.invoke.ompAutoCompactionSet, async (input: { enabled?: unknown } = {}) => {
    if (typeof input?.enabled !== "boolean") invalid("enabled (boolean) required");
    const sidecar = getSidecar() ?? unavailable();
    return sidecar.call<void>("omp.auto-compaction.set", { enabled: input.enabled });
  });

  // ── omp.subagents.list ─────────────────────────────────────────────────────
  handle(IPC.invoke.ompSubagentList, async () => {
    const sidecar = getSidecar();
    if (!sidecar) unavailable();
    return sidecar.call<OmpSubagentListResult>("omp.subagents.list", {});
  });

  // ── omp.subagents.messages ─────────────────────────────────────────────────
  handle(
    IPC.invoke.ompSubagentMessages,
    async (input: { subagentId?: unknown; sessionFile?: unknown; fromByte?: unknown } = {}) => {
      const sidecar = getSidecar();
      if (!sidecar) unavailable();
      const params: Record<string, unknown> = {};
      if (typeof input.subagentId === "string" && input.subagentId) params.subagentId = input.subagentId;
      if (typeof input.sessionFile === "string" && input.sessionFile) params.sessionFile = input.sessionFile;
      if (typeof input.fromByte === "number") params.fromByte = input.fromByte;
      return sidecar.call<OmpSubagentMessagesResult>("omp.subagents.messages", params);
    },
  );

  // ── omp.share ──────────────────────────────────────────────────────────────
  handle(IPC.invoke.ompShare, async () => {
    const sidecar = getSidecar();
    if (!sidecar) unavailable();
    return sidecar.call<OmpShareResult>("omp.share");
  });
}
