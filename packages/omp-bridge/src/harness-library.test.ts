/**
 * Tests for harness-library.ts (strength 4: experience library).
 */

import { existsSync, readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Library, domainDir, slug, hasExperience } from "./harness-library.js";
import type { Experience } from "./harness-library.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("domainDir", () => {
  it("passes through a simple name", () => expect(domainDir("frappe")).toBe("frappe"));
  it("collapses path separators", () => expect(domainDir("frappe/customize")).toBe("frappe__customize"));
  it("trims surrounding whitespace", () => expect(domainDir("  frappe  ")).toBe("frappe"));
  it("falls back to 'unknown' for empty string", () => expect(domainDir("")).toBe("unknown"));
});

describe("slug", () => {
  it("replaces slashes with __", () => expect(slug("my/task/1")).toBe("my__task__1"));
  it("leaves safe names alone", () => expect(slug("fix-bug")).toBe("fix-bug"));
});

describe("hasExperience", () => {
  const valid: Experience = { cue: "when X", lesson: "do Y", evidence: "rollout Z showed" };

  it("returns true for a valid experience", () => expect(hasExperience(valid)).toBe(true));
  it("returns false for missing lesson", () => expect(hasExperience({ cue: "x", evidence: "y" })).toBe(false));
  it("returns false for empty string field", () => expect(hasExperience({ cue: "x", lesson: "", evidence: "y" })).toBe(false));
  it("returns false for null", () => expect(hasExperience(null)).toBe(false));
});

// ─────────────────────────────────────────────────────────────────────────────
// Library
// ─────────────────────────────────────────────────────────────────────────────

describe("Library", () => {
  let tmpRoot: string;
  beforeEach(() => { tmpRoot = mkdtempSync(join(tmpdir(), "harness-lib-test-")); });
  afterEach(() => { rmSync(tmpRoot, { recursive: true, force: true }); });

  it("does not exist before any add()", () => {
    const lib = new Library(tmpRoot, "frappe");
    expect(lib.exists()).toBe(false);
    expect(lib.entries()).toEqual([]);
    expect(lib.contextDir()).toBeNull();
  });

  it("add() with valid experience creates entry + INDEX.md", () => {
    const lib = new Library(tmpRoot, "frappe");
    const exp: Experience = { cue: "when editing", lesson: "use write tool", evidence: "rollout inv1 showed repeated manual edits" };
    const result = lib.add("task-fix-1", { "AGENTS.md": "agent content" }, {
      why: "it worked",
      label: "agg1",
      experience: exp,
    });

    expect(result).not.toBeNull();
    expect(lib.exists()).toBe(true);
    expect(lib.entries()).toEqual(["task-fix-1"]);

    const indexContent = readFileSync(lib.index, "utf8");
    expect(indexContent).toContain("task-fix-1");
    expect(indexContent).toContain("Library — frappe");
  });

  it("add() with null experience returns null and skips write", () => {
    const lib = new Library(tmpRoot, "frappe");
    const result = lib.add("task-1", { "AGENTS.md": "x" }, { experience: null });
    expect(result).toBeNull();
    expect(lib.exists()).toBe(false);
  });

  it("add() with missing cue returns null", () => {
    const lib = new Library(tmpRoot, "frappe");
    const result = lib.add("task-1", {}, {
      experience: { cue: "", lesson: "do something", evidence: "saw it" } as Experience,
    });
    expect(result).toBeNull();
  });

  it("rebuildIndex() reflects current entries on disk", () => {
    const lib = new Library(tmpRoot, "frappe");
    const exp: Experience = { cue: "c", lesson: "l", evidence: "e" };
    lib.add("task-A", { "AGENTS.md": "a" }, { experience: exp });
    lib.add("task-B", { "AGENTS.md": "b" }, { experience: exp });

    // Rebuild from scratch
    lib.rebuildIndex();
    const index = readFileSync(lib.index, "utf8");
    expect(index).toContain("task-A");
    expect(index).toContain("task-B");
  });

  it("forget() removes an entry and rebuilds the index", () => {
    const lib = new Library(tmpRoot, "frappe");
    const exp: Experience = { cue: "c", lesson: "l", evidence: "e" };
    lib.add("task-A", { "AGENTS.md": "a" }, { experience: exp });
    lib.add("task-B", { "AGENTS.md": "b" }, { experience: exp });

    lib.forget(["task-A"]);
    expect(lib.entries()).toEqual(["task-B"]);

    const index = readFileSync(lib.index, "utf8");
    expect(index).not.toContain("task-A");
    expect(index).toContain("task-B");
  });

  it("contextDir() returns dir when EXPERIENCE.md exists", () => {
    const lib = new Library(tmpRoot, "frappe");
    const exp: Experience = { cue: "c", lesson: "l", evidence: "e" };
    lib.add("task-1", {}, { experience: exp });
    expect(lib.contextDir()).toBe(lib.dir);
  });
});
