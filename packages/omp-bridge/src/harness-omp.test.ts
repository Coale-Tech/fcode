/**
 * Tests for harness-omp.ts.
 *
 * Integration: one real smoke that runs makeOmpRollout against a fake `omp`
 * shim script to prove scratch isolation and cleanup.
 */

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeOmpRollout, makeOmpProposer, readHarnessTree, readProjectHarness, ROLLOUT_TOOL_ALLOWLIST } from "./harness-omp.js";
import type { HarnessTree } from "@pi-desktop/shared";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

let shimDir: string;
let dataDir: string;
let gitDir: string;

beforeEach(() => {
  shimDir = mkdtempSync(join(tmpdir(), "omp-shim-"));
  dataDir = mkdtempSync(join(tmpdir(), "omp-data-"));
  gitDir = makeGitRepo();
});
afterEach(() => {
  rmSync(shimDir, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(gitDir, { recursive: true, force: true });
});

/** Create a real git repo with one empty commit (required for git worktree add). */
function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "omp-git-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t.com", "-c", "user.name=T", "commit", "--allow-empty", "-m", "init"], { cwd: dir });
  return dir;
}

/**
 * Create a fake omp shim that prints its CWD and any AGENTS.md it finds, then exits 0.
 * Returns the path to the shim binary.
 */
function makeOmpShim(): string {
  const shimPath = join(shimDir, "omp");
  // Shell script: print the cwd and any AGENTS.md content, then exit 0
  writeFileSync(
    shimPath,
    `#!/bin/sh
echo "omp-cwd: $(pwd)"
if [ -f AGENTS.md ]; then echo "agents-found: $(cat AGENTS.md)"; fi
if [ -d .claude/skills ]; then
  for f in .claude/skills/*/SKILL.md; do [ -f "$f" ] && echo "sees-skill: $f"; done
fi
`,
    "utf8",
  );
  chmodSync(shimPath, 0o755);
  return shimPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// readHarnessTree
// ─────────────────────────────────────────────────────────────────────────────

describe("readHarnessTree", () => {
  it("reads AGENTS.md and skill SKILL.md", () => {
    const dir = mkdtempSync(join(tmpdir(), "harness-read-"));
    try {
      writeFileSync(join(dir, "AGENTS.md"), "agent instructions", "utf8");
      const skillDir = join(dir, "my-skill");
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, "SKILL.md"), "skill body", "utf8");
      // Off-surface file should be excluded
      writeFileSync(join(dir, "off-surface.json"), "{}", "utf8");

      const tree = readHarnessTree(dir, dir);
      expect(tree["AGENTS.md"]).toBe("agent instructions");
      expect(tree["my-skill/SKILL.md"]).toBe("skill body");
      expect(tree["off-surface.json"]).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROLLOUT_TOOL_ALLOWLIST
// ─────────────────────────────────────────────────────────────────────────────

describe("ROLLOUT_TOOL_ALLOWLIST", () => {
  it("does not include bash or web_search", () => {
    const tools = ROLLOUT_TOOL_ALLOWLIST.split(",");
    expect(tools).not.toContain("bash");
    expect(tools).not.toContain("web_search");
    expect(tools).not.toContain("task"); // no sub-agents in probe runs
  });

  it("includes read and write", () => {
    const tools = ROLLOUT_TOOL_ALLOWLIST.split(",");
    expect(tools).toContain("read");
    expect(tools).toContain("write");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Smoke: scratch isolation + cleanup
// ─────────────────────────────────────────────────────────────────────────────

describe("makeOmpRollout (smoke)", () => {
  it("runs in a scratch dir, not the real project, and cleans up", async () => {
    const shim = makeOmpShim();
    const realCwd = process.cwd();

    // Collect scratch dirs created during the run by watching tmpdir listing
    const tmpBefore = new Set(readdirSync(tmpdir()));

    const rollout = makeOmpRollout(
      { ompBinary: shim, dataDir, model: "", timeoutMs: 10_000, cwd: gitDir },
      "test task",
    );
    const result = await rollout({ "AGENTS.md": "test-agent-content" }, "test-label");

    // Run completed without error
    expect(result.label).toBe("test-label");
    // The shim printed its cwd — it should NOT be the real project cwd
    if (result.trajectory.includes("omp-cwd:")) {
      const cwdLine = result.trajectory.split("\n").find((l) => l.startsWith("omp-cwd:")) ?? "";
      const shimCwd = cwdLine.replace("omp-cwd:", "").trim();
      expect(shimCwd).not.toBe(realCwd);
      // The shim cwd should be inside tmpdir (worktree scratch isolation)
      expect(shimCwd).toContain("fcode-rollout-");
    }

    // Scratch dirs from this run should be cleaned up
    const tmpAfter = new Set(readdirSync(tmpdir()));
    const leaked = [...tmpAfter].filter(
      (name) => name.startsWith("fcode-rollout-") && !tmpBefore.has(name),
    );
    expect(leaked).toHaveLength(0);
  });

  it("returns ok=true when shim produces output", async () => {
    const shim = makeOmpShim();
    const rollout = makeOmpRollout(
      { ompBinary: shim, dataDir, model: "", timeoutMs: 10_000, cwd: gitDir },
      "test task",
    );
    const result = await rollout(null, "label-no-tree");
    // Shim always prints something, so ok should be true
    expect(result.ok).toBe(true);
    expect(result.trajectory.trim().length).toBeGreaterThan(0);
  });

  it("harness files are present in scratch dir during run (shim sees AGENTS.md)", async () => {
    const shim = makeOmpShim();
    const rollout = makeOmpRollout(
      { ompBinary: shim, dataDir, model: "", timeoutMs: 10_000, cwd: gitDir },
      "test task",
    );
    const result = await rollout({ "AGENTS.md": "injected-content" }, "label-with-tree");
    expect(result.trajectory).toContain("agents-found: injected-content");
  });

  it("skill in tree is accessible at .claude/skills in worktree", async () => {
    const shim = makeOmpShim();
    const rollout = makeOmpRollout(
      { ompBinary: shim, dataDir, model: "", timeoutMs: 10_000, cwd: gitDir },
      "test task",
    );
    const tree: HarnessTree = { "my-skill/SKILL.md": "---\ndescription: my skill\n---\n\n# My Skill\n" };
    const result = await rollout(tree, "skill-label");
    // Shim reports any .claude/skills/*/SKILL.md it finds
    expect(result.trajectory).toContain("sees-skill:");
    expect(result.trajectory).toContain("my-skill");
  });

  it("throws when cwd is not a git repo", async () => {
    const notGit = mkdtempSync(join(tmpdir(), "not-git-"));
    try {
      const rollout = makeOmpRollout(
        { ompBinary: "false", dataDir, model: "", timeoutMs: 5_000, cwd: notGit },
        "test task",
      );
      await expect(rollout(null, "x")).rejects.toThrow(/not a git repository/);
    } finally {
      rmSync(notGit, { recursive: true, force: true });
    }
  });

  it("git worktree list is clean after rollout (no leaked worktrees)", async () => {
    const shim = makeOmpShim();
    const rollout = makeOmpRollout(
      { ompBinary: shim, dataDir, model: "", timeoutMs: 10_000, cwd: gitDir },
      "test task",
    );
    await rollout({ "AGENTS.md": "cleanup-test" }, "cleanup-label");

    // Should be only 1 worktree (the main one)
    const stdout = execFileSync("git", ["worktree", "list"], { cwd: gitDir, encoding: "utf8" });
    const lines = stdout.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// readProjectHarness
// ─────────────────────────────────────────────────────────────────────────────

describe("readProjectHarness", () => {
  it("reads AGENTS.md and CLAUDE.md from project root", () => {
    const dir = mkdtempSync(join(tmpdir(), "proj-"));
    try {
      writeFileSync(join(dir, "AGENTS.md"), "agents content", "utf8");
      writeFileSync(join(dir, "CLAUDE.md"), "claude content", "utf8");
      const tree = readProjectHarness(dir);
      expect(tree["AGENTS.md"]).toBe("agents content");
      expect(tree["CLAUDE.md"]).toBe("claude content");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("maps .claude/skills/<name>/SKILL.md to <name>/SKILL.md in tree", () => {
    const dir = mkdtempSync(join(tmpdir(), "proj-"));
    try {
      mkdirSync(join(dir, ".claude", "skills", "foo-skill"), { recursive: true });
      writeFileSync(join(dir, ".claude", "skills", "foo-skill", "SKILL.md"), "skill body", "utf8");
      const tree = readProjectHarness(dir);
      expect(tree["foo-skill/SKILL.md"]).toBe("skill body");
      // Src path (.claude/skills/...) should NOT appear as a key
      expect(Object.keys(tree).some(k => k.includes(".claude"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns empty tree when project has no harness files", () => {
    const dir = mkdtempSync(join(tmpdir(), "proj-"));
    try {
      const tree = readProjectHarness(dir);
      expect(Object.keys(tree)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// makeOmpProposer (unit — no real omp, just verify evidence dir handling)
// ─────────────────────────────────────────────────────────────────────────────

describe("makeOmpProposer", () => {
  it("falls back to fallback tree when shim writes nothing to harness dir", async () => {
    // Shim that writes nothing
    const shim = makeOmpShim(); // shim only prints, doesn't edit files
    const proposer = makeOmpProposer({ ompBinary: shim, dataDir, model: "", timeoutMs: 10_000 });

    const evDir = mkdtempSync(join(tmpdir(), "evidence-"));
    try {
      const fallback: HarnessTree = { "AGENTS.md": "fallback-content" };
      const result = await proposer(evDir, "inv1.a1", "edit the harness", fallback);
      // Shim doesn't edit files → should fall back
      expect(result.fell_back ?? result.error).toBeTruthy();
    } finally {
      rmSync(evDir, { recursive: true, force: true });
    }
  });
});
