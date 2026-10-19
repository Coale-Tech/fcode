/**
 * Fan-out tests.
 *
 * Uses a real git repo in a tmpdir so addWorktree / adoptFanoutVariant exercise
 * the actual git CLI.  TypeScript source is imported directly via the existing
 * ts-import-hooks helper.  electron is stubbed because omp-ipc.ts references it
 * at module level.
 *
 * Run: node --test apps/desktop/test/fanout.test.mjs
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { register, registerHooks } from "node:module";
import test from "node:test";

// Stub electron (not used by fanout.ts but imported transitively via omp-ipc.ts).
const electronStub = `data:text/javascript,${encodeURIComponent("export const shell = {};export const app = {};export const dialog = {};export const ipcMain = {};export const BrowserWindow = class {};export default {};")}`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "electron") return { shortCircuit: true, url: electronStub };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === electronStub) {
      return { shortCircuit: true, format: "module", source: decodeURIComponent(electronStub.split(",")[1]) };
    }
    return next(url, context);
  },
});
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

// ── setup real git repo ──────────────────────────────────────────────────────

const root = mkdtempSync(join(tmpdir(), "fanout-test-"));
const fakeHome = join(root, "home");
process.env.HOME = fakeHome; // redirect ~/.omp/wt

const repo = join(root, "repo");
const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
execFileSync("git", ["init", "-q", "-b", "main", repo]);
git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");

test.after(() => rmSync(root, { recursive: true, force: true }));

// ── import under test ────────────────────────────────────────────────────────

const { addWorktree, clearWorktree } = await import("../electron/main/ipc/omp-ipc.ts");
const { createFanoutRunner } = await import("../electron/main/runtime/fanout.ts");

// ── helpers ──────────────────────────────────────────────────────────────────

function makeRunner(overrides = {}) {
  const sessions = [];
  const prompts = [];
  const released = [];
  const runner = createFanoutRunner({
    createWorktree: (repoPath, branch) => addWorktree(repoPath, branch, true),
    createSession: async (input) => {
      const id = `session-${sessions.length}`;
      sessions.push({ id, ...input });
      return id;
    },
    prompt: async (sessionId, content) => {
      prompts.push({ sessionId, content });
    },
    releaseWorker: (sessionId) => released.push(sessionId),
    ...overrides,
  });
  return { runner, sessions, prompts, released };
}

// ── tests ────────────────────────────────────────────────────────────────────

test("startFanout: 3 variants yield 3 distinct worktrees and 3 sessions, all with the prompt", async () => {
  const { runner, sessions, prompts } = makeRunner();

  const run = await runner.startFanout({
    repoPath: repo,
    prompt: "say hello",
    variants: [{}, {}, {}],
  });

  assert.equal(run.variants.length, 3);

  // All variants succeeded
  for (const v of run.variants) {
    assert.equal(v.status, "running", `variant ${v.n} failed: ${v.error ?? "?"}`);
    assert.ok(v.worktreePath, `variant ${v.n} has no worktreePath`);
    assert.ok(existsSync(v.worktreePath), `worktree dir missing: ${v.worktreePath}`);
  }

  // Branch names are distinct and follow the pattern fanout/<runId>-<n>
  const branches = run.variants.map((v) => v.branch);
  assert.equal(new Set(branches).size, 3, "branch names not unique");
  for (let i = 0; i < 3; i++) {
    assert.match(branches[i], /^fanout\/[a-f0-9]+-[123]$/, `branch ${i + 1} has wrong format`);
    assert.equal(run.variants[i].n, i + 1);
  }

  // Three sessions started with the repo-local projectPath
  assert.equal(sessions.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(sessions[i].projectPath, run.variants[i].worktreePath);
  }

  // Prompt delivered to each session
  assert.equal(prompts.length, 3);
  for (const p of prompts) assert.equal(p.content, "say hello");
  const promptSessionIds = prompts.map((p) => p.sessionId);
  assert.equal(new Set(promptSessionIds).size, 3, "same sessionId reused");
});

test("startFanout: branch name override is honoured", async () => {
  const { runner } = makeRunner();
  const run = await runner.startFanout({
    repoPath: repo,
    prompt: "override test",
    variants: [{ branch: "fanout/custom-branch" }, {}],
  });
  assert.equal(run.variants[0].branch, "fanout/custom-branch");
  assert.match(run.variants[1].branch, /^fanout\/[a-f0-9]+-2$/);
});

test("startFanout: the variants' workers start concurrently", async () => {
  let started = 0;
  let open;
  const gate = new Promise((resolve) => { open = resolve; });
  const { runner } = makeRunner({
    createSession: async () => {
      const id = `session-${started++}`;
      if (started === 3) open(); // only reached when all three were started before any finished
      await gate;
      return id;
    },
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("variants started sequentially")), 5000).unref());
  const run = await Promise.race([runner.startFanout({ repoPath: repo, prompt: "p", variants: [{}, {}, {}] }), timeout]);
  assert.deepEqual(run.variants.map((v) => v.status), ["running", "running", "running"]);
});

test("onTurnEnd releases a variant's worker once and ignores other sessions", async () => {
  const { runner, released } = makeRunner();
  const run = await runner.startFanout({ repoPath: repo, prompt: "p", variants: [{}, {}] });
  runner.onTurnEnd("not-a-fanout-session");
  assert.deepEqual(released, []);
  runner.onTurnEnd(run.variants[0].sessionId);
  runner.onTurnEnd(run.variants[0].sessionId);
  assert.deepEqual(released, [run.variants[0].sessionId]);
});

test("a variant whose prompt fails has its worker released", async () => {
  const { runner, released } = makeRunner({
    prompt: async () => { throw new Error("boom"); },
  });
  const run = await runner.startFanout({ repoPath: repo, prompt: "p", variants: [{}] });
  assert.equal(run.variants[0].status, "failed");
  assert.deepEqual(released, [run.variants[0].sessionId]);
});

test("startFanout: failing worktree marks only that variant failed, others proceed", async () => {
  const calls = [];
  const { runner } = makeRunner({
    createWorktree: async (repoPath, branch) => {
      calls.push(branch);
      // second variant always fails
      if (calls.length === 2) return { ok: false, error: "injected failure" };
      return addWorktree(repoPath, branch, true);
    },
  });

  const run = await runner.startFanout({
    repoPath: repo,
    prompt: "partial fail",
    variants: [{}, {}, {}],
  });

  assert.equal(run.variants[0].status, "running");
  assert.equal(run.variants[1].status, "failed");
  assert.equal(run.variants[1].error, "injected failure");
  assert.equal(run.variants[2].status, "running");
});

test("startFanout: 3 variants have 3 distinct worktree paths", async () => {
  const { runner } = makeRunner();
  const run = await runner.startFanout({
    repoPath: repo,
    prompt: "distinct paths",
    variants: [{}, {}, {}],
  });
  const paths = run.variants.filter((v) => v.worktreePath).map((v) => v.worktreePath);
  assert.equal(new Set(paths).size, paths.length, "worktree paths not unique");
});

test("startFanout: agentId prepends delegation sentence only to that variant", async () => {
  const { runner, prompts } = makeRunner();
  const run = await runner.startFanout({
    repoPath: repo,
    prompt: "do the work",
    variants: [{ agentId: "my-agent" }, {}],
  });

  assert.equal(run.variants.length, 2);
  // Variant 1: has agentId — prompt must start with the delegation prefix
  assert.ok(prompts[0].content.startsWith("**Delegation:**"), "missing delegation prefix on variant 1");
  assert.ok(prompts[0].content.includes("`my-agent`"), "agent name missing from delegation");
  assert.ok(prompts[0].content.endsWith("do the work"), "user prompt not appended");
  // Variant 2: no agentId — prompt must be exactly the user prompt
  assert.equal(prompts[1].content, "do the work");
});

test("startFanout: modelId and providerId reach createSession", async () => {
  const { runner, sessions } = makeRunner();
  await runner.startFanout({
    repoPath: repo,
    prompt: "model test",
    variants: [{ modelId: "claude-3-5-haiku", providerId: "anthropic" }, {}],
  });
  assert.equal(sessions[0].modelId, "claude-3-5-haiku");
  assert.equal(sessions[0].providerId, "anthropic");
  // Second variant has no override
  assert.equal(sessions[1].modelId, undefined);
  assert.equal(sessions[1].providerId, undefined);
});

test("adoptFanoutVariant: dirty main checkout returns merged:false", async () => {
  const { runner } = makeRunner();

  // Create a worktree + branch to adopt later
  const wt = await addWorktree(repo, "fanout/adopt-dirty-test", true);
  assert.equal(wt.ok, true, wt.error);

  // Dirty the main repo
  writeFileSync(join(repo, "untracked.txt"), "dirt");

  const result = await runner.adoptFanoutVariant({
    repoPath: repo,
    branch: "fanout/adopt-dirty-test",
  });

  assert.equal(result.merged, false);
  assert.match(result.reason ?? "", /uncommitted/i);

  // Clean up dirty file
  rmSync(join(repo, "untracked.txt"));
});

test("adoptFanoutVariant: clean checkout merges the branch", async () => {
  const { runner } = makeRunner();

  // Create a branch with a commit on a fresh worktree
  const wt = await addWorktree(repo, "fanout/adopt-clean-test", true);
  assert.equal(wt.ok, true, wt.error);

  execFileSync("git", ["-C", wt.path, "-c", "user.name=t", "-c", "user.email=t@t",
    "commit", "-q", "--allow-empty", "-m", "variant commit"]);

  const result = await runner.adoptFanoutVariant({
    repoPath: repo,
    branch: "fanout/adopt-clean-test",
  });

  assert.equal(result.merged, true, result.reason);

  // The merge commit should be present in main
  const log = execFileSync("git", ["-C", repo, "log", "--oneline", "-3"], { encoding: "utf8" });
  assert.ok(log.includes("variant commit"), `merge commit not in log:\n${log}`);
});

test("adoptFanoutVariant: uncommitted worktree changes are auto-committed before merge", async () => {
  const { runner } = makeRunner();

  // Create worktree
  const wt = await addWorktree(repo, "fanout/adopt-autocommit-test", true);
  assert.equal(wt.ok, true, wt.error);

  // Leave a change uncommitted in the worktree (simulate agent editing a file)
  writeFileSync(join(wt.path, "agent-edit.txt"), "work done by agent");

  const result = await runner.adoptFanoutVariant({
    repoPath: repo,
    branch: "fanout/adopt-autocommit-test",
  });

  assert.equal(result.merged, true, result.reason);

  // The auto-commit message and file should appear in main log + tree
  const log = execFileSync("git", ["-C", repo, "log", "--oneline", "-4"], { encoding: "utf8" });
  assert.ok(log.includes("Fan-out variant fanout/adopt-autocommit-test"), `auto-commit not in log:\n${log}`);
});

test("clearWorktree prunes the parent repo's worktree record", async () => {
  const wt = await addWorktree(repo, "fanout/clear-prune-test", true);
  assert.equal(wt.ok, true, wt.error);
  assert.match(git("worktree", "list", "--porcelain"), /fanout\/clear-prune-test/);

  assert.deepEqual(await clearWorktree(wt.path, true), { ok: true });

  assert.doesNotMatch(git("worktree", "list", "--porcelain"), /fanout\/clear-prune-test/);
});
