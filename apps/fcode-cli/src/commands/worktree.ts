import { execFileSync } from "node:child_process";
import { dirname } from "node:path";

import type { OmpWorktreeAddResult, OmpWorktreeClearResult, OmpWorktreeListResult } from "@pi-desktop/shared";

import { connect, fail, printResult } from "../endpoint.js";

/** Main checkout of the repo containing cwd; also correct when cwd is itself a linked worktree. */
function repoFromCwd(): string {
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return dirname(common);
  } catch {
    return fail("not inside a git repository; pass --repo <path>");
  }
}

export async function worktreeCommand(sub: string, args: string[]): Promise<void> {
  const asJson = args.includes("--json");

  if (sub === "list") {
    const client = await connect();
    try {
      const result = await client.request<OmpWorktreeListResult>("worktree/list", {});
      printResult(result.worktrees ?? [], asJson);
    } finally {
      await client.close();
    }
    return;
  }

  if (sub === "create" || sub === "add") {
    const repoIdx = args.indexOf("--repo");
    const repoPath = repoIdx >= 0 ? args[repoIdx + 1] : undefined;
    // The branch is the first bare argument that is not the value of --repo.
    const branch = args.find((a, i) => !a.startsWith("-") && (repoIdx < 0 || i !== repoIdx + 1));
    if (!branch) fail("worktree create requires a branch name");
    const create = !args.includes("--no-create");
    const resolvedRepo = repoPath ?? repoFromCwd();
    const client = await connect();
    try {
      const result = await client.request<OmpWorktreeAddResult>("worktree/add", {
        branch,
        repoPath: resolvedRepo,
        create,
      });
      printResult(result, asJson);
    } finally {
      await client.close();
    }
    return;
  }

  if (sub === "rm" || sub === "remove") {
    const path = args.find((a) => !a.startsWith("-"));
    if (!path) fail("worktree rm requires a path");
    const force = args.includes("--force");
    const client = await connect();
    try {
      const result = await client.request<OmpWorktreeClearResult>("worktree/remove", { path, force });
      printResult(result, asJson);
    } finally {
      await client.close();
    }
    return;
  }

  fail(`worktree: unknown subcommand: ${sub}`);
}
