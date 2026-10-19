/**
 * Fan-out IPC channels: fanoutStart and fanoutAdopt.
 * createSession and prompt are provided by kanban-wiring so every fan-out session
 * gets its own omp worker process in the correct cwd (same mechanism as Kanban).
 */
import type { FanoutVariant } from "@pi-desktop/shared";
import { IPC } from "@pi-desktop/shared";
import type { IpcRegistrar } from "./types";
import { addWorktree } from "./omp-ipc";
import { createFanoutRunner } from "../runtime/fanout";
import type { WorkerSessionInput } from "../runtime/kanban-wiring";

export type FanoutIpcDeps = {
  registrar: IpcRegistrar;
  createSession: (input: WorkerSessionInput) => Promise<string>;
  prompt: (sessionId: string, content: string) => Promise<void>;
  releaseWorker: (sessionId: string) => void;
  /** Subscribe to every agent turn end. */
  onTurnEnd: (listener: (sessionId: string) => void) => void;
};

export function registerFanoutIpc({ registrar, createSession, prompt, releaseWorker, onTurnEnd }: FanoutIpcDeps): void {
  const { handle } = registrar;

  const runner = createFanoutRunner({
    createWorktree: (repoPath, branch) => addWorktree(repoPath, branch, true),
    createSession,
    prompt,
    releaseWorker,
  });
  onTurnEnd(runner.onTurnEnd);

  handle(IPC.invoke.fanoutStart, async (input: {
    repoPath?: unknown;
    prompt?: unknown;
    variants?: unknown;
  } = {}) => {
    const repoPath = typeof input.repoPath === "string" ? input.repoPath : "";
    const promptText = typeof input.prompt === "string" ? input.prompt : "";
    const rawVariants = Array.isArray(input.variants) ? input.variants : [];
    if (!repoPath) throw Object.assign(new Error("repoPath required"), { errorCode: "VALIDATION" });
    if (!promptText) throw Object.assign(new Error("prompt required"), { errorCode: "VALIDATION" });
    const variants: FanoutVariant[] = rawVariants.map((v: unknown) => {
      if (v == null || typeof v !== "object") return {};
      return {
        ...("branch" in v && typeof v.branch === "string" ? { branch: v.branch } : {}),
        ...("agentId" in v && typeof v.agentId === "string" ? { agentId: v.agentId } : {}),
        ...("modelId" in v && typeof v.modelId === "string" ? { modelId: v.modelId } : {}),
        ...("providerId" in v && typeof v.providerId === "string" ? { providerId: v.providerId } : {}),
      } satisfies FanoutVariant;
    });
    return runner.startFanout({ repoPath, prompt: promptText, variants });
  });

  handle(IPC.invoke.fanoutAdopt, async (input: {
    repoPath?: unknown;
    branch?: unknown;
  } = {}) => {
    const repoPath = typeof input.repoPath === "string" ? input.repoPath : "";
    const branch = typeof input.branch === "string" ? input.branch : "";
    if (!repoPath || !branch) {
      throw Object.assign(new Error("repoPath and branch required"), { errorCode: "VALIDATION" });
    }
    return runner.adoptFanoutVariant({ repoPath, branch });
  });
}
