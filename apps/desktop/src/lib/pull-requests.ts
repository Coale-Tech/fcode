import type { PullRequestCheck, PullRequestSummary } from "@pi-desktop/shared";

export const failedChecks = (pr: PullRequestSummary): PullRequestCheck[] =>
  pr.checks?.filter((check) => check.state === "failure") ?? [];

/** Polling is only worth it while some visible PR still has a running check. */
export const hasPendingChecks = (pulls: PullRequestSummary[]): boolean =>
  pulls.some((pr) => pr.checks?.some((check) => check.state === "pending"));

/** The chat prompt behind "Fix CI"; edits and pushes stay behind the agent's normal approval prompts. */
export function fixCiPrompt(pr: PullRequestSummary): string {
  const names = failedChecks(pr).map((check) => check.name).join(", ");
  return [
    `CI is failing on pull request #${pr.number}${pr.title ? ` (${pr.title})` : ""}${pr.headRefName ? ` on branch \`${pr.headRefName}\`` : ""}.`,
    `Failing checks: ${names}.`,
    `Find the cause with \`gh pr checks ${pr.number}\` and \`gh run view <run-id> --log-failed\`, check the branch out with \`gh pr checkout ${pr.number}\` (ask me first if the working tree has uncommitted changes), fix it, and re-run the project's checks locally.`,
    "Do not push or change anything on GitHub without asking me.",
  ].join(" ");
}
