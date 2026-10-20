import { describe, expect, it } from "vitest";
import { frozenMemoryOverflow } from "./omp-defaults.js";

// Wrapper overhead per file, from omp's loadFrozenMemory: tags + two newlines.
const USER_WRAP = '<memories source="user-profile">\n\n</memories>'.length;
const PROJECT_WRAP = '<memories source="project">\n\n</memories>'.length;

describe("frozenMemoryOverflow", () => {
  it("is 0 when the cap is off or nothing is written", () => {
    expect(frozenMemoryOverflow("x".repeat(5000), "y".repeat(5000), 0)).toBe(0);
    expect(frozenMemoryOverflow("", "  \n", 100)).toBe(0);
  });

  it("counts the tag wrappers and the blank-line separator against the shared cap", () => {
    const total = USER_WRAP + 10 + 2 + PROJECT_WRAP + 20;
    expect(frozenMemoryOverflow("u".repeat(10), "p".repeat(20), total)).toBe(0);
    expect(frozenMemoryOverflow("u".repeat(10), "p".repeat(20), total - 1)).toBe(1);
  });

  it("two files that each fit the cap can still overflow together", () => {
    const cap = 2000;
    expect(frozenMemoryOverflow("u".repeat(1500), "", cap)).toBe(0);
    expect(frozenMemoryOverflow("", "p".repeat(1500), cap)).toBe(0);
    expect(frozenMemoryOverflow("u".repeat(1500), "p".repeat(1500), cap)).toBeGreaterThan(900);
  });
});
