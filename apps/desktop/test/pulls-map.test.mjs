import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { mapChecks, classifyGhFailure } = await import("../electron/main/ipc/pulls-map.ts");
const { failedChecks, hasPendingChecks, fixCiPrompt } = await import("../src/lib/pull-requests.ts");

const run = (over) => ({
  __typename: "CheckRun",
  name: "build",
  status: "COMPLETED",
  conclusion: "SUCCESS",
  startedAt: "2026-10-12T10:00:00Z",
  completedAt: "2026-10-12T10:02:05Z",
  detailsUrl: "https://github.com/o/r/actions/runs/1/job/2",
  workflowName: "CI",
  ...over,
});

test("a finished CheckRun maps state, duration, workflow detail and log url", () => {
  assert.deepEqual(mapChecks([run()]), [
    { name: "build", state: "success", durationSeconds: 125, details: "CI", url: "https://github.com/o/r/actions/runs/1/job/2" },
  ]);
});

test("conclusions: neutral/skipped are skipped, every other non-success is a failure", () => {
  const states = ["SUCCESS", "NEUTRAL", "SKIPPED", "FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE", "SOMETHING_NEW"].map(
    (conclusion) => mapChecks([run({ conclusion })])[0].state,
  );
  assert.deepEqual(states, ["success", "skipped", "skipped", "failure", "failure", "failure", "failure", "failure", "failure"]);
});

test("a run that has not completed is pending whatever its conclusion field says", () => {
  const [check] = mapChecks([run({ status: "IN_PROGRESS", conclusion: "", completedAt: "0001-01-01T00:00:00Z" })]);
  assert.equal(check.state, "pending");
  assert.equal(check.durationSeconds, undefined);
});

test("legacy StatusContext entries map by state and use targetUrl", () => {
  const checks = mapChecks([
    { __typename: "StatusContext", context: "ci/jenkins", state: "SUCCESS", targetUrl: "https://ci/1" },
    { __typename: "StatusContext", context: "ci/lint", state: "PENDING" },
    { __typename: "StatusContext", context: "ci/e2e", state: "ERROR" },
  ]);
  assert.deepEqual(checks.map((c) => [c.name, c.state]), [["ci/jenkins", "success"], ["ci/lint", "pending"], ["ci/e2e", "failure"]]);
  assert.equal(checks[0].url, "https://ci/1");
});

test("no CI at all maps to undefined so the row keeps its dash", () => {
  assert.equal(mapChecks([]), undefined);
  assert.equal(mapChecks(undefined), undefined);
  assert.equal(mapChecks(null), undefined);
});

test("workflow detail is dropped when it repeats the check name", () => {
  assert.equal("details" in mapChecks([run({ name: "CI" })])[0], false);
});

test("gh failures are sorted into fixable setup problems", () => {
  assert.equal(classifyGhFailure("Error: spawn gh ENOENT"), "GH_NOT_INSTALLED");
  assert.equal(classifyGhFailure("zsh: command not found: gh"), "GH_NOT_INSTALLED");
  assert.equal(classifyGhFailure("To get started with GitHub CLI, please run:  gh auth login"), "GH_NOT_AUTHENTICATED");
  assert.equal(classifyGhFailure("You are not logged into any GitHub hosts."), "GH_NOT_AUTHENTICATED");
  assert.equal(classifyGhFailure("HTTP 401: Bad credentials (https://api.github.com/graphql)"), "GH_NOT_AUTHENTICATED");
  // Real gh output; this one also says "gh auth login" but is not an auth problem.
  assert.equal(
    classifyGhFailure(
      "none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use `gh auth login`",
    ),
    "NOT_GITHUB_REPO",
  );
  assert.equal(classifyGhFailure("no git remotes found"), "NOT_GITHUB_REPO");
  assert.equal(
    classifyGhFailure("failed to run git: fatal: not a git repository (or any of the parent directories): .git"),
    "NOT_GITHUB_REPO",
  );
});

test("an unrelated gh failure is left as its raw message", () => {
  assert.equal(classifyGhFailure("GraphQL: API rate limit exceeded"), undefined);
});

const pr = (checks, over = {}) => ({ number: 7, title: "Add thing", url: "u", headRefName: "feat/x", checks, ...over });

test("Fix CI is offered only while a check is failing, and follows a refreshed PR", () => {
  const failing = pr([{ name: "build", state: "failure" }, { name: "lint", state: "success" }]);
  const fixed = pr([{ name: "build", state: "success" }, { name: "lint", state: "success" }]);
  assert.deepEqual(failedChecks(failing).map((c) => c.name), ["build"]);
  assert.equal(failedChecks(fixed).length, 0);
  assert.equal(failedChecks(pr(undefined)).length, 0);
});

test("polling continues only while some PR has a pending check", () => {
  assert.equal(hasPendingChecks([pr([{ name: "a", state: "pending" }])]), true);
  assert.equal(hasPendingChecks([pr([{ name: "a", state: "failure" }]), pr(undefined)]), false);
});

test("the Fix CI prompt names the PR, branch and failing checks and forbids silent pushes", () => {
  const text = fixCiPrompt(pr([{ name: "build", state: "failure" }, { name: "e2e", state: "failure" }]));
  assert.match(text, /#7 \(Add thing\) on branch `feat\/x`/);
  assert.match(text, /Failing checks: build, e2e\./);
  assert.match(text, /gh pr checkout 7/);
  assert.match(text, /without asking me/);
});
