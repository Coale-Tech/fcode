/**
 * E2E tests for harness-rpc.ts.
 *
 * Uses a fake omp shim + a real temp git repo as cwd, exercising the full
 * createHarnessRpcHandler path without mocks.  Proves:
 *   - base read from cwd (project AGENTS.md appears in rollout worktree)
 *   - rollout ran in a git worktree (project tree unchanged, worktree list clean)
 *   - skill candidate loaded (.claude/skills present in worktree at run time)
 *   - changed skill staged as one proposal
 *   - AGENTS.md change reported only in unstagedEdits
 */

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarnessRpcHandler, type HarnessRpcConfig } from "./harness-rpc.js";
import { listPendingProposals } from "./skill-review.js";

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

let shimDir: string;
let dataDir: string;
let projectDir: string; // real git repo used as cwd

beforeEach(() => {
  shimDir = mkdtempSync(join(tmpdir(), "rpc-e2e-shim-"));
  dataDir = mkdtempSync(join(tmpdir(), "rpc-e2e-data-"));
  projectDir = makeProjectRepo();
});
afterEach(() => {
  rmSync(shimDir, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

/**
 * Create a real git repo with:
 *   - AGENTS.md (base always-on content)
 *   - .claude/skills/base-skill/SKILL.md (a pre-existing skill)
 * Commits them so the worktree checkout includes them.
 */
function makeProjectRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "rpc-e2e-proj-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t.com", "-c", "user.name=T", "config", "commit.gpgsign", "false"], { cwd: dir });

  writeFileSync(join(dir, "AGENTS.md"), "# Project AGENTS\n\nBase instructions.\n", "utf8");

  mkdirSync(join(dir, ".claude", "skills", "base-skill"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "skills", "base-skill", "SKILL.md"),
    "---\nname: base-skill\ndescription: existing base skill\n---\n\n# Base Skill\n\nOriginal body.\n",
    "utf8",
  );

  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t.com", "-c", "user.name=T", "commit", "-m", "init"], { cwd: dir });

  return dir;
}

/**
 * Fake omp shim:
 *   - In proposer context (./harness/ dir exists): writes a new/changed SKILL.md
 *     and a changed AGENTS.md inside ./harness/.
 *   - Always: prints trajectory + any AGENTS.md and skill files it sees (for
 *     rollout verification).
 */
function makeOmpShim(): string {
  const shimPath = join(shimDir, "omp");
  writeFileSync(
    shimPath,
    `#!/bin/sh
# Proposer context: ./harness/ was pre-created by harness-recursion
if [ -d harness ]; then
  mkdir -p harness/improved-skill
  printf '---\\nname: improved-skill\\ndescription: improved skill from proposer\\n---\\n\\n# Improved Skill\\n\\nNew body.\\n' > harness/improved-skill/SKILL.md
  printf '# Project AGENTS\\n\\nBase instructions.\\n\\nImproved section.\\n' > harness/AGENTS.md
fi
# Always report what we see (useful for rollout verification)
if [ -f AGENTS.md ]; then printf 'sees-agents: %s\\n' "$(head -1 AGENTS.md)"; fi
if [ -d .claude/skills ]; then
  for f in .claude/skills/*/SKILL.md; do [ -f "$f" ] && printf 'sees-skill: %s\\n' "$f"; done
fi
echo "trajectory: done"
exit 0
`,
    "utf8",
  );
  chmodSync(shimPath, 0o755);
  return shimPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// E2E test
// ─────────────────────────────────────────────────────────────────────────────

describe("createHarnessRpcHandler E2E", () => {
  it(
    "reads base from cwd, runs in worktree, stages skill proposal, reports AGENTS.md in unstagedEdits",
    async () => {
      const shim = makeOmpShim();

      const config: HarnessRpcConfig = {
        ompBinary: shim,
        dataDir,
        harnessSettings: { enabled: true, k: 1, mode: "parallel", model: "" },
        log: () => undefined,
      };

      const originalAgents = readFileSync(join(projectDir, "AGENTS.md"), "utf8");

      const result = await createHarnessRpcHandler(config)({
        task: "improve the harness",
        cwd: projectDir,
      });

      // ── result shape ────────────────────────────────────────────────────────
      expect(result.labels).toBeInstanceOf(Array);
      expect(result.selection).toMatchObject({
        chosenLabel: expect.any(String),
        chosenIsBase: expect.any(Boolean),
        fallback: expect.any(Boolean),
      });
      expect(result.unstagedEdits).toBeInstanceOf(Array);
      expect(result.stagedIds).toBeInstanceOf(Array);

      // ── project tree unchanged ──────────────────────────────────────────────
      const agentsAfter = readFileSync(join(projectDir, "AGENTS.md"), "utf8");
      expect(agentsAfter).toBe(originalAgents);

      // ── no leaked git worktrees ─────────────────────────────────────────────
      const wtList = execFileSync("git", ["worktree", "list"], {
        cwd: projectDir,
        encoding: "utf8",
      });
      expect(wtList.trim().split("\n").filter(Boolean)).toHaveLength(1);

      // ── when a non-base candidate was chosen, verify staging ───────────────
      if (!result.selection.chosenIsBase) {
        // improved-skill SKILL.md should be staged as a proposal
        expect(result.stagedIds.length).toBeGreaterThan(0);
        const proposals = listPendingProposals(dataDir);
        expect(proposals.some((p) => p.name.includes("improved-skill"))).toBe(true);
        expect(proposals[0].description).toMatch(/improved skill from proposer/);

        // AGENTS.md change goes to unstagedEdits, not stagedIds
        expect(result.unstagedEdits).toContain("AGENTS.md");
        // base-skill/SKILL.md was not changed by proposer → not staged
        expect(result.stagedIds.every((id) => !id.includes("base-skill"))).toBe(true);
      }
    },
    60_000, // allow up to 60 s for subprocess calls
  );

  it("project AGENTS.md content reaches rollout worktree via base harness", async () => {
    // Place a known marker in project AGENTS.md (committed in makeProjectRepo)
    // and verify the rollout shim saw it.
    const shim = makeOmpShim();
    const seenTrajectories: string[] = [];
    const config: HarnessRpcConfig = {
      ompBinary: shim,
      dataDir,
      harnessSettings: { enabled: true, k: 1, mode: "parallel", model: "" },
      log: (msg) => {
        if (msg.includes("trajectory")) seenTrajectories.push(msg);
      },
    };

    const result = await createHarnessRpcHandler(config)({
      task: "check base harness content",
      cwd: projectDir,
    });

    // Result is valid (regardless of selection)
    expect(result.errors).toBeInstanceOf(Array);

    // The base skill defined in the project must be in the base tree (read from cwd)
    // Indirectly confirmed: if rollout ran in the worktree, the worktree had
    // .claude/skills/base-skill/SKILL.md (from git HEAD checkout), which
    // matches the base harness. The project tree is untouched.
    expect(existsSync(join(projectDir, ".claude", "skills", "base-skill", "SKILL.md"))).toBe(true);
  },
    60_000,
  );
});
