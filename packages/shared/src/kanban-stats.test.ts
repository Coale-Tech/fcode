import { describe, expect, it } from "vitest";
import { agentOutcomes, successPrior } from "./kanban-stats.js";

const tasks = [
  { id: "a1", agent: "frappe-dev" },
  { id: "a2", agent: "frappe-dev" },
  { id: "a3", agent: "frappe-dev" },
  { id: "b1", agent: "scout" },
  { id: "g1" },
];

const runs = (taskId: string, ...statuses: string[]) => statuses.map((status) => ({ taskId, status }));

describe("agentOutcomes", () => {
  it("returns an empty map for an empty board", () => {
    expect(agentOutcomes([], []).size).toBe(0);
  });

  it("buckets done and failed runs by the task's agent and skips agentless tasks", () => {
    const out = agentOutcomes(tasks, [
      ...runs("a1", "done"),
      ...runs("a2", "crashed"),
      ...runs("b1", "timed_out"),
      ...runs("g1", "done"),
    ]);
    expect(out.get("frappe-dev")).toEqual({ done: 1, failed: 1 });
    expect(out.get("scout")).toEqual({ done: 0, failed: 1 });
    expect(out.size).toBe(2);
  });

  it("ignores running and reclaimed runs", () => {
    const out = agentOutcomes(tasks, [...runs("a1", "running", "reclaimed")]);
    expect(out.size).toBe(0);
  });

  it("counts gave_up as a failure", () => {
    expect(agentOutcomes(tasks, runs("b1", "gave_up")).get("scout")).toEqual({ done: 0, failed: 1 });
  });
});

describe("successPrior", () => {
  it("is neutral with no record", () => {
    expect(successPrior(undefined)).toBe(1);
  });

  it("is neutral below the 3-run evidence floor", () => {
    expect(successPrior({ done: 2, failed: 0 })).toBe(1);
    expect(successPrior({ done: 1, failed: 1 })).toBe(1);
  });

  it("rewards a clean record and punishes a failing one", () => {
    expect(successPrior({ done: 3, failed: 0 })).toBe(1.5);
    expect(successPrior({ done: 0, failed: 3 })).toBe(0.5);
    expect(successPrior({ done: 2, failed: 2 })).toBe(1);
  });
});
