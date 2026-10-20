import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReviewDetails, readFileText } from "./review-change.js";

const build = (before: string | null, after: string | null, path = "a.txt") =>
  buildReviewDetails({ root: "/proj", path, toolCallId: "call1", operation: "edit", before, after });

describe("buildReviewDetails", () => {
  it("builds a v1 record the Review tab accepts for a modified file", () => {
    const r = build("alpha\nbeta\ngamma\n", "alpha\nBETA\nbeta2\ngamma\n")!;
    expect(r.root).toBe("workspace");
    expect(r.review).toMatchObject({
      version: 1,
      snapshotId: "omp:call1",
      path: "a.txt",
      status: "modified",
      state: "active",
      additions: 2,
      deletions: 1,
      reversible: false,
    });
    expect(r.review.hunks).toEqual([
      {
        header: "@@ -1,3 +1,4 @@",
        lines: [
          { type: "context", text: "alpha" },
          { type: "del", text: "beta" },
          { type: "add", text: "BETA" },
          { type: "add", text: "beta2" },
          { type: "context", text: "gamma" },
        ],
      },
    ]);
  });

  it("marks a file with no prior text as added and a path outside the root as absolute", () => {
    expect(build(null, "x\n")!.review).toMatchObject({ status: "added", additions: 1, deletions: 0 });
    expect(build("a", "b", "/elsewhere/f.txt")!.review.path).toBe("/elsewhere/f.txt");
  });

  it("splits distant changes into separate hunks", () => {
    const before = Array.from({ length: 30 }, (_, i) => `l${i}`).join("\n") + "\n";
    const after = before.replace("l2\n", "L2\n").replace("l27\n", "L27\n");
    const hunks = build(before, after)!.review.hunks as { header: string }[];
    expect(hunks.map((h) => h.header)).toEqual(["@@ -1,6 +1,6 @@", "@@ -25,6 +25,6 @@"]);
  });

  it("reports nothing for an unchanged or unpreviewable result", () => {
    expect(build("same\n", "same\n")).toBeNull();
    expect(build("a", undefined)).toBeNull();
  });

  it("flags binary and oversized content instead of diffing", () => {
    expect(build("a", "b\0c")!.review).toMatchObject({ binary: true, hunks: [] });
    const big = Array.from({ length: 4001 }, (_, i) => `l${i}`).join("\n");
    expect(build("", big)!.review).toMatchObject({ truncated: true, hunks: [] });
  });
});

describe("readFileText", () => {
  it("distinguishes a missing file (null) from file text", () => {
    const dir = mkdtempSync(join(tmpdir(), "rc-"));
    try {
      writeFileSync(join(dir, "f.txt"), "hi\n");
      expect(readFileText(dir, "f.txt")).toBe("hi\n");
      expect(readFileText(dir, "missing.txt")).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
