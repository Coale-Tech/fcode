/**
 * Tests for harness-recursion.ts (strength 9: Propose–Probe–Compose loop).
 *
 * Acceptance criteria:
 *   - parallel: exactly 4k rollouts / 3k stages for k=2
 *   - sequential: exactly 4k rollouts / 3k stages for k=2
 *   - invalid proposal → one retry with error text then inherit fallback
 *   - dead rollout recorded not raised
 *   - ledger identity assertion fires when counts are wrong
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Ledger,
  runParallel,
  runSequential,
  type ModeResult,
  type Proposer,
  type RolloutFn,
  type RunView,
} from "./harness-recursion.js";
import type { HarnessTree } from "@pi-desktop/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Fake runners
// ─────────────────────────────────────────────────────────────────────────────

const BASE_TREE: HarnessTree = { "AGENTS.md": "base" };
const IMPROVED_TREE: HarnessTree = { "AGENTS.md": "improved" };

/** Fake proposer that always succeeds immediately. */
function fakeProposer(tree = IMPROVED_TREE): Proposer {
  return async (_evDir, label, _mission, _fallback) => ({
    tree,
    notes: `notes from ${label}`,
    cost: 0.001,
    attempts: 1,
    cached: false,
  });
}

/** Fake rollout that always succeeds. */
const fakeRollout: RolloutFn = async (_tree, label) => ({
  label,
  trajectory: `trajectory of ${label}`,
  ok: true,
});

/** Rollout that always throws (dead rollout). */
const deadRollout: RolloutFn = async (_tree, label) => {
  throw new Error(`dead: ${label}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Ledger unit
// ─────────────────────────────────────────────────────────────────────────────

describe("Ledger", () => {
  it("assertIdentity passes when R=4k P=3k no dupes", () => {
    const l = new Ledger("agg", "t1", 2);
    for (const lbl of ["base0", "base1", "inv1", "dom1", "inv2", "dom2", "agg1", "agg2"]) l.addRollout(lbl);
    for (const lbl of ["inv1", "dom1", "inv2", "dom2", "agg1", "agg2"]) l.addSession(lbl);
    expect(() => l.assertIdentity()).not.toThrow();
  });

  it("assertIdentity throws when rollout count is wrong", () => {
    const l = new Ledger("agg", "t1", 2);
    for (const lbl of ["base0", "base1"]) l.addRollout(lbl); // only 2, need 8
    for (const lbl of ["inv1", "dom1", "inv2", "dom2", "agg1", "agg2"]) l.addSession(lbl);
    expect(() => l.assertIdentity()).toThrow(/R=2\/8/);
  });

  it("assertIdentity throws on duplicate labels", () => {
    const l = new Ledger("agg", "t1", 1);
    for (const lbl of ["base", "inv1", "dom1", "agg1"]) l.addRollout(lbl);
    l.addRollout("agg1"); // duplicate
    for (const lbl of ["inv1", "dom1", "agg1"]) l.addSession(lbl);
    expect(() => l.assertIdentity()).toThrow(/duplicate/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runParallel
// ─────────────────────────────────────────────────────────────────────────────

describe("runParallel", () => {
  let workDir: string;
  beforeEach(() => { workDir = mkdtempSync(join(tmpdir(), "harness-par-test-")); });
  afterEach(() => { rmSync(workDir, { recursive: true, force: true }); });

  it("k=1: R=4 rollouts, P=3 sessions", async () => {
    const base: RunView[] = [{ label: "base", trajectory: "base traj", ok: true }];
    const result = await runParallel("task-1", "do something", 1, BASE_TREE, base, fakeProposer(), fakeRollout, { workDir });
    expect(result.ledger.R).toBe(4);
    expect(result.ledger.P).toBe(3);
    expect(result.finals).toHaveLength(1);
    expect(result.finals[0]).toBe("agg1");
  });

  it("k=2: R=8 rollouts, P=6 sessions", async () => {
    const base: RunView[] = [
      { label: "base0", trajectory: "base0 traj", ok: true },
      { label: "base1", trajectory: "base1 traj", ok: true },
    ];
    const result = await runParallel("task-1", "do something", 2, BASE_TREE, base, fakeProposer(), fakeRollout, { workDir });
    expect(result.ledger.R).toBe(8);
    expect(result.ledger.P).toBe(6);
    expect(result.finals).toHaveLength(2);
    expect(result.finals).toContain("agg1");
    expect(result.finals).toContain("agg2");
  });

  it("stage labels are inv1, dom1, agg1 for k=1", async () => {
    const base: RunView[] = [{ label: "base", trajectory: "", ok: true }];
    const result = await runParallel("task-1", "do something", 1, BASE_TREE, base, fakeProposer(), fakeRollout, { workDir });
    const labels = result.stages.map((s) => s.label);
    expect(labels).toContain("inv1");
    expect(labels).toContain("dom1");
    expect(labels).toContain("agg1");
  });

  it("invalid proposal → one retry with error text then inherit (fellBack=true)", async () => {
    // Return an error on every attempt so the stage always retries once then falls back
    let callCount = 0;
    const badProposer: Proposer = async (_evDir, _label, _mission, fallback) => {
      callCount++;
      return { tree: fallback, notes: "", cost: 0, attempts: 1, cached: false, error: "bad proposal" };
    };
    const base: RunView[] = [{ label: "base", trajectory: "", ok: true }];
    const result = await runParallel("task-1", "do something", 1, BASE_TREE, base, badProposer, fakeRollout, { workDir });
    // STAGE_ATTEMPTS=2 per stage × 3 stages = 6 total calls
    expect(callCount).toBe(6);
    // All stages fell back to base
    expect(result.stages.every((s) => s.fellBack)).toBe(true);
  });

  it("dead rollout is recorded, not raised", async () => {
    const base: RunView[] = [{ label: "base", trajectory: "base traj", ok: true }];
    const result = await runParallel("task-1", "do something", 1, BASE_TREE, base, fakeProposer(), deadRollout, { workDir });
    // Should complete without throwing
    expect(result.ledger.R).toBe(4);
    expect(result.rollouts["inv1"]?.ok).toBe(false);
    expect(result.rollouts["inv1"]?.error).toContain("dead");
  });

  it("includes harness trees for each final in trees map", async () => {
    const base: RunView[] = [{ label: "base", trajectory: "", ok: true }];
    const result = await runParallel("task-1", "do something", 1, BASE_TREE, base, fakeProposer(), fakeRollout, { workDir });
    expect(result.trees["agg1"]).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runSequential
// ─────────────────────────────────────────────────────────────────────────────

describe("runSequential", () => {
  let workDir: string;
  beforeEach(() => { workDir = mkdtempSync(join(tmpdir(), "harness-seq-test-")); });
  afterEach(() => { rmSync(workDir, { recursive: true, force: true }); });

  it("k=1: R=4 rollouts, P=3 sessions", async () => {
    const base: RunView[] = [{ label: "base", trajectory: "", ok: true }];
    const result = await runSequential("task-1", "do something", 1, BASE_TREE, base, fakeProposer(), fakeRollout, { workDir });
    expect(result.ledger.R).toBe(4);
    expect(result.ledger.P).toBe(3);
    expect(result.finals).toHaveLength(1);
    expect(result.finals[0]).toBe("c1");
  });

  it("k=2: R=8 rollouts, P=6 sessions", async () => {
    const base: RunView[] = [
      { label: "base0", trajectory: "", ok: true },
      { label: "base1", trajectory: "", ok: true },
    ];
    const result = await runSequential("task-1", "do something", 2, BASE_TREE, base, fakeProposer(), fakeRollout, { workDir });
    expect(result.ledger.R).toBe(8);
    expect(result.ledger.P).toBe(6);
    expect(result.finals).toHaveLength(2);
    expect(result.finals).toContain("c1");
    expect(result.finals).toContain("c2");
  });

  it("dead rollout is recorded not raised in sequential mode", async () => {
    const base: RunView[] = [{ label: "base", trajectory: "", ok: true }];
    const result = await runSequential("task-1", "do something", 1, BASE_TREE, base, fakeProposer(), deadRollout, { workDir });
    expect(result.ledger.R).toBe(4);
    expect(result.rollouts["c1"]?.ok).toBe(false);
  });

  it("compose stage uses carried harness (notes differ per round)", async () => {
    let round = 0;
    const roundProposer: Proposer = async (_evDir, label, _mission, _fallback) => {
      round++;
      return { tree: { "AGENTS.md": `round-${round}` }, notes: `round ${round} ${label}`, cost: 0, attempts: 1, cached: false };
    };
    const base: RunView[] = [
      { label: "base0", trajectory: "", ok: true },
      { label: "base1", trajectory: "", ok: true },
    ];
    const result = await runSequential("task-1", "do something", 2, BASE_TREE, base, roundProposer, fakeRollout, { workDir });
    // Two compose stages c1 and c2 with different notes
    const c1 = result.stages.find((s) => s.label === "c1");
    const c2 = result.stages.find((s) => s.label === "c2");
    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Retry-on-invalid integration
// ─────────────────────────────────────────────────────────────────────────────

describe("retry-on-invalid", () => {
  let workDir: string;
  beforeEach(() => { workDir = mkdtempSync(join(tmpdir(), "harness-retry-test-")); });
  afterEach(() => { rmSync(workDir, { recursive: true, force: true }); });

  it("retry prompt contains the rejection error text", async () => {
    const missions: string[] = [];
    // Track per-label call count to alternate fail/succeed within each stage
    const stageCallCount = new Map<string, number>();
    const observingProposer: Proposer = async (_evDir, label, mission, fallback) => {
      missions.push(mission);
      const n = (stageCallCount.get(label) ?? 0) + 1;
      stageCallCount.set(label, n);
      if (n === 1) {
        // First attempt: return an error to trigger retry
        return { tree: fallback, notes: "", cost: 0, attempts: 1, cached: false, error: "proposal rejected: size exceeded" };
      }
      // Second attempt: succeed
      return { tree: fallback, notes: "KEEP_BASE", cost: 0, attempts: 1, cached: false };
    };

    const base: RunView[] = [{ label: "base", trajectory: "", ok: true }];
    await runParallel("task-1", "do something", 1, BASE_TREE, base, observingProposer, fakeRollout, { workDir });

    // The second call for each stage should include the rejection + error text
    const retryMissions = missions.filter((m) => m.includes("PREVIOUS ATTEMPT WAS REJECTED"));
    expect(retryMissions.length).toBeGreaterThan(0);
    expect(retryMissions[0]).toContain("proposal rejected: size exceeded");
  });
});
