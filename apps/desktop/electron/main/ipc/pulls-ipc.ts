import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { IPC } from "@pi-desktop/shared";
import type { HostProcess } from "../host-process";
import type { IpcRegistrar } from "./types";

const execFileP = promisify(execFile);

export type PullsIpcDependencies = {
  registrar: IpcRegistrar;
  getHost: () => HostProcess | null;
};

export function registerPullsIpc({
  registrar,
  getHost,
}: PullsIpcDependencies): void {
  const workspacePath = async () => {
    const host = getHost();
    if (!host) throw new Error("host unavailable");
    const res = (await host.call("workspace.get")) as {
      workspace: { path: string; name: string } | null;
    };
    return res.workspace?.path;
  };

  registrar.handle(IPC.invoke.gitBranchList, async () => {
    const dir = await workspacePath();
    if (!dir) return { branches: [], error: "NO_WORKSPACE" as const };
    try {
      const { stdout } = await execFileP("git", ["-C", dir, "branch", "--format=%(refname:short)"], {
        timeout: 10_000,
      });
      return { branches: stdout.split("\n").map((branch) => branch.trim()).filter(Boolean) };
    } catch {
      return { branches: [], error: "GIT_FAILED" as const };
    }
  });

  registrar.handle(IPC.invoke.pullsList, async () => {
    const cwd = await workspacePath();
    if (!cwd) {
      return { pulls: [], error: "NO_WORKSPACE" as const };
    }
    const run = (cmd: string, args: string[]) =>
      new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const child = spawn(cmd, args, { cwd, env: process.env });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (data) => (stdout += String(data)));
        child.stderr.on("data", (data) => (stderr += String(data)));
        child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
        child.on("error", (error) =>
          resolve({ code: 1, stdout: "", stderr: String(error) }),
        );
      });
    const result = await run("gh", [
      "pr",
      "list",
      "--limit",
      "30",
      "--json",
      "number,title,url,author,headRefName,baseRefName,updatedAt,isDraft",
    ]);
    if (result.code !== 0) {
      return {
        pulls: [],
        error: result.stderr.trim() || result.stdout.trim() || "GH_FAILED",
      };
    }
    try {
      const pulls = JSON.parse(result.stdout || "[]") as Array<Record<string, unknown>>;
      return {
        pulls: pulls.map((pull) => ({
          number: Number(pull.number),
          title: String(pull.title || ""),
          url: String(pull.url || ""),
          author:
            typeof pull.author === "object" && pull.author
              ? String((pull.author as { login?: unknown }).login || "")
              : undefined,
          headRefName: pull.headRefName ? String(pull.headRefName) : undefined,
          baseRefName: pull.baseRefName ? String(pull.baseRefName) : undefined,
          updatedAt: pull.updatedAt ? String(pull.updatedAt) : undefined,
          isDraft: Boolean(pull.isDraft),
        })),
      };
    } catch (error) {
      return { pulls: [], error: error instanceof Error ? error.message : String(error) };
    }
  });
}
