import type { PullRequestCheck, PullsErrorKind } from "@pi-desktop/shared";

/** One `statusCheckRollup` entry from `gh pr list --json`: a CheckRun (Actions) or a legacy StatusContext. */
type RollupEntry = {
  name?: string;
  workflowName?: string;
  status?: string;
  conclusion?: string;
  startedAt?: string;
  completedAt?: string;
  detailsUrl?: string;
  context?: string;
  state?: string;
  targetUrl?: string;
};

const SKIPPED: Record<string, true> = { NEUTRAL: true, SKIPPED: true };
const PENDING_STATUS: Record<string, true> = { PENDING: true, EXPECTED: true };

function checkState(entry: RollupEntry): PullRequestCheck["state"] {
  if (entry.context !== undefined) {
    if (entry.state === "SUCCESS") return "success";
    return PENDING_STATUS[entry.state ?? ""] ? "pending" : "failure";
  }
  if (entry.status !== "COMPLETED") return "pending";
  if (entry.conclusion === "SUCCESS") return "success";
  return SKIPPED[entry.conclusion ?? ""] ? "skipped" : "failure";
}

/** `undefined` when the PR has no checks, so the row keeps its "—". */
export function mapChecks(rollup: unknown): PullRequestCheck[] | undefined {
  if (!Array.isArray(rollup) || rollup.length === 0) return undefined;
  return (rollup as RollupEntry[]).map((entry) => {
    const name = entry.name ?? entry.context ?? "";
    const started = Date.parse(entry.startedAt ?? "");
    const completed = Date.parse(entry.completedAt ?? "");
    return {
      name,
      state: checkState(entry),
      ...(started > 0 && completed >= started
        ? { durationSeconds: Math.round((completed - started) / 1000) }
        : {}),
      ...(entry.workflowName && entry.workflowName !== name ? { details: entry.workflowName } : {}),
      ...((entry.detailsUrl ?? entry.targetUrl) ? { url: entry.detailsUrl ?? entry.targetUrl } : {}),
    };
  });
}

/**
 * Sorts a failed `gh` run into a setup problem the user can fix; anything else
 * (rate limit, network) stays `undefined` and is shown as its raw message.
 * A missing binary surfaces as the spawn error ("spawn gh ENOENT").
 */
export function classifyGhFailure(stderr: string): PullsErrorKind | undefined {
  if (/ENOENT|command not found|not recognized as an internal/i.test(stderr)) return "GH_NOT_INSTALLED";
  // Before auth: gh's non-GitHub-remote message also tells the user to run "gh auth login".
  if (/none of the git remotes|no git remotes|not a git repository/i.test(stderr)) return "NOT_GITHUB_REPO";
  if (/gh auth login|not logged in|bad credentials|HTTP 401|GH_TOKEN/i.test(stderr)) return "GH_NOT_AUTHENTICATED";
  return undefined;
}
