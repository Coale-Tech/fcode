/**
 * Fan-out orchestrator: start N agent sessions on isolated git worktrees, each
 * receiving the same prompt. Sessions run concurrently under the existing agent
 * host once they are all launched.
 *
 * All side effects come through injected deps (mirrors kanban-runner.ts pattern).
 */
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FanoutAdoptResult, FanoutRun, FanoutVariant, FanoutVariantRun } from "@pi-desktop/shared";

const execFileP = promisify(execFile);

export type FanoutRunnerDeps = {
  /** Create (or reuse) a git worktree on a new branch; returns ok=false on error. */
  createWorktree: (
    repoPath: string,
    branch: string,
  ) => Promise<{ ok: boolean; path?: string; error?: string }>;
  /** Start a session with a worker omp process in the given cwd. */
  createSession: (input: {
    title: string;
    projectPath: string;
    providerId?: string;
    modelId?: string;
  }) => Promise<string>;
  /** Deliver the initial prompt to a session. */
  prompt: (sessionId: string, content: string) => Promise<unknown>;
  /** Stop a session's omp worker process. */
  releaseWorker: (sessionId: string) => void;
};

/** Delegation prefix sent when the variant targets a specific agent (Kanban §352-355 wording). */
function delegationPrefix(agentId: string): string {
  return (
    `**Delegation:** this task matches the \`${agentId}\` agent. Do the work by calling the ` +
    `\`task\` tool with \`agent: "${agentId}"\`, passing this task's full description and ` +
    "working directory, then verify its result before completing.\n\n"
  );
}

export function createFanoutRunner(deps: FanoutRunnerDeps) {
  const { createWorktree, createSession } = deps;

  /** Fan-out sessions whose omp worker is still running; released when their turn ends. */
  const liveWorkers = new Set<string>();
  const onTurnEnd = (sessionId: string) => {
    if (liveWorkers.delete(sessionId)) deps.releaseWorker(sessionId);
  };

  /**
   * Create the worktrees one by one (git serialises `worktree add`), then start
   * every variant's omp worker and prompt concurrently: a cold worker takes ~25s,
   * so starting them in sequence made N variants wait N times as long.
   */
  async function startFanout(input: {
    repoPath: string;
    prompt: string;
    variants: FanoutVariant[];
  }): Promise<FanoutRun> {
    const runId = randomUUID().replace(/-/g, "").slice(0, 8);
    const planned = [];
    for (let i = 0; i < input.variants.length; i++) {
      const variant = input.variants[i]!;
      const branch =
        typeof variant.branch === "string" && variant.branch
          ? variant.branch
          : `fanout/${runId}-${i + 1}`;
      planned.push({ variant, n: i + 1, branch, wt: await createWorktree(input.repoPath, branch) });
    }

    const variantRuns = await Promise.all(
      planned.map(async ({ variant, n, branch, wt }): Promise<FanoutVariantRun> => {
        if (!wt.ok || !wt.path) {
          return {
            n,
            branch,
            worktreePath: null,
            sessionId: null,
            status: "failed",
            error: wt.error ?? "worktree creation failed",
          };
        }
        let sessionId: string | null = null;
        try {
          sessionId = await createSession({
            title: `fanout ${runId}-${n}`,
            projectPath: wt.path,
            ...(variant.providerId ? { providerId: variant.providerId } : {}),
            ...(variant.modelId ? { modelId: variant.modelId } : {}),
          });
          liveWorkers.add(sessionId);
          await deps.prompt(
            sessionId,
            variant.agentId ? delegationPrefix(variant.agentId) + input.prompt : input.prompt,
          );
          return { n, branch, worktreePath: wt.path, sessionId, status: "running" };
        } catch (e) {
          if (sessionId) onTurnEnd(sessionId);
          return {
            n,
            branch,
            worktreePath: wt.path,
            sessionId,
            status: "failed",
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    );

    return {
      id: runId,
      repoPath: input.repoPath,
      prompt: input.prompt,
      variants: variantRuns,
      startedAt: Date.now(),
    };
  }

  /**
   * Merge a finished variant's branch into `repoPath`.
   * - Refuses a dirty main checkout.
   * - Auto-commits uncommitted changes in the variant's worktree before merging.
   * - Uses no-ff merge so the contribution is always a visible merge commit.
   */
  async function adoptFanoutVariant(input: {
    repoPath: string;
    branch: string;
  }): Promise<FanoutAdoptResult> {
    try {
      // 1. Refuse if the main checkout is dirty.
      const { stdout: mainStatus } = await execFileP(
        "git",
        ["-C", input.repoPath, "status", "--porcelain"],
        { timeout: 10_000 },
      );
      if (mainStatus.trim()) {
        return { merged: false, reason: "The main checkout has uncommitted changes." };
      }

      // 2. Find the worktree checked out on this branch.
      const { stdout: wtList } = await execFileP(
        "git",
        ["-C", input.repoPath, "worktree", "list", "--porcelain"],
        { timeout: 10_000 },
      );
      let variantWtPath: string | null = null;
      for (const block of wtList.split("\n\n")) {
        if (block.includes(`branch refs/heads/${input.branch}`)) {
          const pathLine = block.split("\n").find((l) => l.startsWith("worktree "));
          if (pathLine) variantWtPath = pathLine.slice("worktree ".length).trim();
          break;
        }
      }

      // 3. If the worktree has uncommitted changes, commit them.
      if (variantWtPath) {
        const { stdout: wtStatus } = await execFileP(
          "git",
          ["-C", variantWtPath, "status", "--porcelain"],
          { timeout: 10_000 },
        );
        if (wtStatus.trim()) {
          // Resolve committer identity: use git config if set, else a sentinel fallback.
          const userName = await execFileP("git", ["-C", variantWtPath, "config", "user.name"], { timeout: 5_000 })
            .then(({ stdout }) => stdout.trim() || "Fan-out")
            .catch(() => "Fan-out");
          const userEmail = await execFileP("git", ["-C", variantWtPath, "config", "user.email"], { timeout: 5_000 })
            .then(({ stdout }) => stdout.trim() || "fanout@fcode.local")
            .catch(() => "fanout@fcode.local");
          await execFileP(
            "git",
            [
              "-C", variantWtPath,
              "-c", `user.name=${userName}`,
              "-c", `user.email=${userEmail}`,
              "add", "-A",
            ],
            { timeout: 30_000 },
          );
          const { stdout: _out, stderr } = await execFileP(
            "git",
            [
              "-C", variantWtPath,
              "-c", `user.name=${userName}`,
              "-c", `user.email=${userEmail}`,
              "commit", "-m", `Fan-out variant ${input.branch}`,
            ],
            { timeout: 30_000 },
          ).catch((e: unknown) => {
            const msg =
              e != null &&
              typeof e === "object" &&
              "stderr" in e &&
              typeof e.stderr === "string"
                ? e.stderr.trim()
                : e instanceof Error
                  ? e.message
                  : String(e);
            return Promise.reject(new Error(msg || "commit failed"));
          });
          void _out;
          void stderr;
        }
      }

      // 4. Merge via no-ff so the contribution is a visible merge commit.
      await execFileP("git", ["-C", input.repoPath, "merge", "--no-ff", input.branch], {
        timeout: 60_000,
      });
      return { merged: true };
    } catch (e: unknown) {
      let reason: string;
      if (e != null && typeof e === "object" && "stderr" in e && typeof e.stderr === "string") {
        reason = e.stderr.trim() || "merge failed";
      } else if (e instanceof Error) {
        reason = e.message;
      } else {
        reason = String(e);
      }
      return { merged: false, reason };
    }
  }

  return { startFanout, adoptFanoutVariant, onTurnEnd };
}
