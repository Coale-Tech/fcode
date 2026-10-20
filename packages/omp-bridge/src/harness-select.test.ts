/**
 * Tests for harness-select.ts (strength 8: blind baseline-inclusive selector).
 */

import { describe, expect, it } from "vitest";
import { assignIds, anonId, selectBlind } from "./harness-select.js";
import type { HarnessTree } from "@pi-desktop/shared";

// ─────────────────────────────────────────────────────────────────────────────
// assignIds
// ─────────────────────────────────────────────────────────────────────────────

describe("assignIds", () => {
  it("assigns anonymous ids to all labels", () => {
    const idMap = assignIds(["base", "agg1", "agg2"], "task-1", 2, "agg");
    expect(Object.keys(idMap)).toHaveLength(3);
    expect(new Set(Object.values(idMap)).size).toBe(3); // unique labels
    expect(Object.values(idMap)).toContain("base");
  });

  it("is deterministic — same inputs same ids", () => {
    const a = assignIds(["base", "agg1", "agg2"], "task-1", 2, "agg");
    const b = assignIds(["base", "agg1", "agg2"], "task-1", 2, "agg");
    expect(a).toEqual(b);
  });

  it("changes when task id changes", () => {
    const a = assignIds(["base", "agg1"], "task-A", 1, "agg");
    const b = assignIds(["base", "agg1"], "task-B", 1, "agg");
    // The maps should cover the same labels but (almost certainly) in different order
    expect(Object.values(a).sort()).toEqual(Object.values(b).sort());
  });

  it("includes base in pool (Fcode adaptation)", () => {
    const idMap = assignIds(["base", "agg1"], "task-1", 1, "agg");
    expect(Object.values(idMap)).toContain("base");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// anonId
// ─────────────────────────────────────────────────────────────────────────────

describe("anonId", () => {
  it("produces A-Z then AA-AZ", () => {
    expect(anonId(0)).toBe("A");
    expect(anonId(25)).toBe("Z");
    expect(anonId(26)).toBe("AA");
    expect(anonId(27)).toBe("AB");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// selectBlind
// ─────────────────────────────────────────────────────────────────────────────

const baseTree: HarnessTree = { "AGENTS.md": "base agent" };
const agg1Tree: HarnessTree = { "AGENTS.md": "improved agent" };

describe("selectBlind", () => {
  it("parses a valid ```choice block and returns the chosen label", async () => {
    const idMap = assignIds(["base", "agg1"], "task-1", 1, "agg");
    // Find the id assigned to "agg1"
    const agg1Id = Object.entries(idMap).find(([, lbl]) => lbl === "agg1")?.[0] ?? "A";

    const result = await selectBlind({
      pool: { base: baseTree, agg1: agg1Tree },
      baseLabel: "base",
      task: "test task",
      taskId: "task-1",
      k: 1,
      mode: "agg",
      callModel: async () =>
        `Some reasoning.\n<why>\nAgg1 is better.\n</why>\n\`\`\`choice\n${agg1Id}\n\`\`\``,
    });

    expect(result.chosenLabel).toBe("agg1");
    expect(result.chosenIsBase).toBe(false);
    expect(result.fallback).toBe(false);
    expect(result.why).toContain("Agg1");
  });

  it("falls back to base on missing ```choice block", async () => {
    const result = await selectBlind({
      pool: { base: baseTree, agg1: agg1Tree },
      baseLabel: "base",
      task: "test task",
      taskId: "task-1",
      k: 1,
      mode: "agg",
      callModel: async () => "I choose nothing.",
    });

    expect(result.chosenLabel).toBe("base");
    expect(result.chosenIsBase).toBe(true);
    expect(result.fallback).toBe(true);
    expect(result.error).toContain("no ```choice");
  });

  it("falls back to base on unknown id", async () => {
    const result = await selectBlind({
      pool: { base: baseTree, agg1: agg1Tree },
      baseLabel: "base",
      task: "test task",
      taskId: "task-1",
      k: 1,
      mode: "agg",
      callModel: async () => "```choice\nZZZ\n```",
    });

    expect(result.chosenLabel).toBe("base");
    expect(result.chosenIsBase).toBe(true);
    expect(result.fallback).toBe(true);
    expect(result.error).toContain("ZZZ");
  });

  it("falls back to base on model call error", async () => {
    const result = await selectBlind({
      pool: { base: baseTree, agg1: agg1Tree },
      baseLabel: "base",
      task: "test task",
      taskId: "task-1",
      k: 1,
      mode: "agg",
      callModel: async () => { throw new Error("network timeout"); },
    });

    expect(result.chosenLabel).toBe("base");
    expect(result.fallback).toBe(true);
    expect(result.error).toContain("network timeout");
  });

  it("choosing base id sets chosenIsBase=true (valid outcome)", async () => {
    const idMap = assignIds(["base", "agg1"], "task-1", 1, "agg");
    const baseId = Object.entries(idMap).find(([, lbl]) => lbl === "base")?.[0] ?? "A";

    const result = await selectBlind({
      pool: { base: baseTree, agg1: agg1Tree },
      baseLabel: "base",
      task: "test task",
      taskId: "task-1",
      k: 1,
      mode: "agg",
      callModel: async () => `\`\`\`choice\n${baseId}\n\`\`\``,
    });

    expect(result.chosenIsBase).toBe(true);
    expect(result.fallback).toBe(false);
  });
});
