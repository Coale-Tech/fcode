/**
 * Unit tests for skill-review: trigger logic, truncation, JSON parsing,
 * and write+commit into a temp git clone.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTranscriptText,
  extractJson,
  parseSkillsJson,
  SkillReviewTrigger,
  writeAndCommitSkill,
  type SkillReviewConfig,
  type TranscriptEntry,
} from "./skill-review.js";

// Stub skill-lint to avoid dependency on not-yet-compiled skill-lint.ts.
vi.mock("./skill-lint.js", () => ({
  lintSkillContent: () => ({ errors: [], warnings: [] }),
}));

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const sh = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// ─────────────────────────────────────────────────────────────────────────────
// Transcript truncation
// ─────────────────────────────────────────────────────────────────────────────

describe("buildTranscriptText", () => {
  it("returns all content when within budget", () => {
    const entries: TranscriptEntry[] = [
      { role: "user", text: "hello" },
      { role: "assistant", text: "world" },
    ];
    const result = buildTranscriptText(entries, 10_000);
    expect(result).toContain("USER: hello");
    expect(result).toContain("ASSISTANT: world");
    expect(result).not.toContain("truncated");
  });

  it("truncates from the start, keeping most recent content", () => {
    const entries: TranscriptEntry[] = Array.from({ length: 5 }, (_, i) => ({
      role: "user" as const,
      text: `message-${i}`,
    }));
    const result = buildTranscriptText(entries, 30);
    expect(result).toContain("truncated");
    expect(result).toContain("message-4");
    expect(result).not.toContain("message-0");
  });

  it("returns empty string for empty entries", () => {
    expect(buildTranscriptText([], 1000)).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JSON extraction
// ─────────────────────────────────────────────────────────────────────────────

describe("extractJson", () => {
  it("extracts a bare JSON object", () => {
    expect(extractJson('{"skills":[]}')).toBe('{"skills":[]}');
  });

  it("extracts JSON surrounded by prose", () => {
    expect(extractJson('Here:\n{"skills":[]}\nDone.')).toBe('{"skills":[]}');
  });

  it("returns null for text with no JSON object", () => {
    expect(extractJson("no braces")).toBeNull();
    expect(extractJson("")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JSON parsing and validation
// ─────────────────────────────────────────────────────────────────────────────

describe("parseSkillsJson", () => {
  it("accepts a valid skills list", () => {
    const raw = JSON.stringify({
      skills: [{ name: "my-skill", description: "A skill", body: "# My Skill\n\nContent." }],
    });
    const result = parseSkillsJson(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("my-skill");
  });

  it("accepts an empty skills array", () => {
    expect(parseSkillsJson('{"skills":[]}')).toHaveLength(0);
  });

  it("rejects non-JSON", () => {
    expect(() => parseSkillsJson("not json")).toThrow();
  });

  it("rejects a top-level array", () => {
    expect(() => parseSkillsJson("[]")).toThrow();
  });

  it("rejects path traversal in name", () => {
    const raw = JSON.stringify({
      skills: [{ name: "../etc/passwd", description: "bad", body: "x" }],
    });
    expect(() => parseSkillsJson(raw)).toThrow(/invalid/i);
  });

  it("rejects uppercase in name", () => {
    const raw = JSON.stringify({
      skills: [{ name: "MySkill", description: "bad", body: "x" }],
    });
    expect(() => parseSkillsJson(raw)).toThrow(/invalid/i);
  });

  it("rejects leading hyphen in name", () => {
    const raw = JSON.stringify({
      skills: [{ name: "-bad", description: "bad", body: "x" }],
    });
    expect(() => parseSkillsJson(raw)).toThrow(/invalid/i);
  });

  it("rejects empty description", () => {
    const raw = JSON.stringify({
      skills: [{ name: "ok-skill", description: "", body: "x" }],
    });
    expect(() => parseSkillsJson(raw)).toThrow(/description/i);
  });

  it("rejects empty body", () => {
    const raw = JSON.stringify({
      skills: [{ name: "ok-skill", description: "A skill", body: "" }],
    });
    expect(() => parseSkillsJson(raw)).toThrow(/body/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SkillReviewTrigger: turn counting, interval, no-overlap
// ─────────────────────────────────────────────────────────────────────────────

describe("SkillReviewTrigger", () => {
  it("does not fire before intervalTurns is reached", () => {
    const started: number[] = [];
    const trigger = new SkillReviewTrigger(cfg(5, () => { started.push(1); }));
    for (let i = 0; i < 4; i++) trigger.onAgentEnd("s1");
    expect(started).toHaveLength(0);
  });

  it("fires at each multiple of intervalTurns", async () => {
    const fired: number[] = [];
    const trigger = new SkillReviewTrigger(cfg(3, () => { fired.push(1); }));
    for (let i = 0; i < 9; i++) {
      trigger.onAgentEnd("s1");
      for (let j = 0; j < 5; j++) await Promise.resolve(); // flush the review's then/catch/finally chain
    }
    expect(fired).toHaveLength(3); // turns 3, 6, 9
  });

  it("does not fire a second review while one is in flight", () => {
    let calls = 0;
    const { promise: stall } = Promise.withResolvers<void>();
    const trigger = new SkillReviewTrigger(
      cfg(1, () => { calls++; return stall; }),
    );
    trigger.onAgentEnd("s1"); // fires, stays in flight
    trigger.onAgentEnd("s1"); // blocked — reviewInFlight
    trigger.onAgentEnd("s1"); // blocked
    expect(calls).toBe(1);
  });

  it("tracks sessions independently", () => {
    const trigger = new SkillReviewTrigger(cfg(2));
    expect(trigger.onAgentEnd("a")).toBe(false); // a: turn 1
    expect(trigger.onAgentEnd("b")).toBe(false); // b: turn 1
    expect(trigger.onAgentEnd("a")).toBe(true);  // a: turn 2 → fires
    expect(trigger.onAgentEnd("b")).toBe(true);  // b: turn 2 → fires independently
  });

  it("onAgentEnd returns true when review starts, false otherwise", () => {
    const trigger = new SkillReviewTrigger(cfg(2));
    expect(trigger.onAgentEnd("s1")).toBe(false); // turn 1
    expect(trigger.onAgentEnd("s1")).toBe(true);  // turn 2, fires
    expect(trigger.onAgentEnd("s1")).toBe(false); // turn 3, in-flight
  });

  it("clamps intervalTurns 0 to 1 (fires every turn)", () => {
    let calls = 0;
    const trigger = new SkillReviewTrigger(cfg(0, () => { calls++; }));
    trigger.onAgentEnd("s1");
    expect(calls).toBe(1);
  });

  it("disposeSession resets turn count for the session", () => {
    let calls = 0;
    const trigger = new SkillReviewTrigger(cfg(2, () => { calls++; }));
    trigger.onAgentEnd("s1"); // turn 1
    trigger.disposeSession("s1"); // reset
    trigger.onAgentEnd("s1"); // turn 1 again after reset
    expect(calls).toBe(0);
  });

  it("appendTurn skips blank text", () => {
    const trigger = new SkillReviewTrigger(cfg(1));
    trigger.appendTurn("s1", "user", "   ");
    trigger.appendTurn("s1", "assistant", "real");
    // Just verify no throws; transcript population is internal.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// writeAndCommitSkill: write SKILL.md and commit (integration)
// ─────────────────────────────────────────────────────────────────────────────

describe("writeAndCommitSkill", () => {
  let root: string;
  let clone: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "skill-review-git-"));
    clone = join(root, "skills", "frappeskills");
    const origin = join(root, "origin.git");
    sh(root, "init", "-q", "--bare", "-b", "main", origin);
    sh(root, "clone", "-q", `file://${origin}`, clone);
    // Seed a commit so the branch can be created.
    writeFileSync(join(clone, "README.md"), "frappeskills\n");
    sh(clone, "add", "-A");
    sh(clone, "-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "init");
    sh(clone, "push", "-q", "origin", "HEAD:main");
    sh(clone, "checkout", "-b", "fcode/self-improve");
    sh(clone, "config", "user.email", "fcode@localhost");
    sh(clone, "config", "user.name", "Fcode");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("creates SKILL.md and commits on fcode/self-improve", async () => {
    const skill = {
      name: "test-frappe-skill",
      description: "A test lesson about Frappe patterns",
      body: "# Test Skill\n\nSome content about Frappe coding patterns that is useful.",
    };
    await writeAndCommitSkill(root, skill, () => undefined);

    expect(existsSync(join(clone, "test-frappe-skill", "SKILL.md"))).toBe(true);
    const log = sh(clone, "log", "--oneline");
    expect(log).toContain("Fcode: review — test-frappe-skill");
    const branch = sh(clone, "rev-parse", "--abbrev-ref", "HEAD");
    expect(branch).toBe("fcode/self-improve");
  });

  it("silently skips when frappeskills repo is not cloned", async () => {
    const logs: string[] = [];
    const emptyRoot = mkdtempSync(join(tmpdir(), "skill-review-empty-"));
    try {
      await writeAndCommitSkill(emptyRoot, {
        name: "any-skill",
        description: "desc",
        body: "# body",
      }, (msg) => logs.push(msg));
      expect(logs.some((m) => m.includes("not cloned"))).toBe(true);
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal SkillReviewConfig for trigger tests.
 * `onReview` injects a `_runReview` override so tests never spawn omp.
 */
function cfg(intervalTurns: number, onReview?: () => void | Promise<void>): SkillReviewConfig {
  return {
    ompBinary: "omp",
    dataDir: "/tmp/noop",
    intervalTurns,
    maxInputTokens: 8000,
    model: "",
    log: () => undefined,
    ...(onReview ? { _runReview: () => Promise.resolve(onReview()) } : {}),
  };
}
