import { describe, expect, it } from "vitest";
import {
  autotriggerSkills,
  diffHarnessTrees,
  FCODE_SURFACE,
  harnessDiversity,
  surfaceForBase,
  validateHarnessTree,
  type HarnessTree,
  type HarnessSurface,
} from "./harness-validate.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function skill(name: string, extras = ""): string {
  return `---\nname: ${name}\ndescription: does ${name} things\n---\n\n# ${name}\n\n${extras}`;
}

function skillNoDesc(name: string): string {
  return `---\nname: ${name}\n---\n\n# ${name}\n`;
}

const SURFACE: HarnessSurface = {
  skillDir: "skills",
  alwaysOn: ["AGENTS.md"],
  alwaysOnMax: 500,
};

const ROOT_SURFACE: HarnessSurface = {
  skillDir: "",
  alwaysOn: ["AGENTS.md"],
  alwaysOnMax: 500,
};

function validTree(): HarnessTree {
  return {
    "AGENTS.md": "# Project\n\nUse tools.",
    "skills/my-skill/SKILL.md": skill("my-skill"),
  };
}

// ─── validateHarnessTree ─────────────────────────────────────────────────────

describe("validateHarnessTree — passing tree", () => {
  it("returns ok with correct census", () => {
    const result = validateHarnessTree(validTree(), { surface: SURFACE });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.census.skills).toBe(1);
    expect(result.census.files).toBe(2);
    expect(result.census.scripts).toBe(0);
  });

  it("accepts root skillDir (frappeskills convention)", () => {
    const tree: HarnessTree = {
      "AGENTS.md": "# root",
      "my-skill/SKILL.md": skill("my-skill"),
    };
    const result = validateHarnessTree(tree, { surface: ROOT_SURFACE });
    expect(result.ok).toBe(true);
    expect(result.census.skills).toBe(1);
  });

  it("defaults to FCODE_SURFACE", () => {
    const tree: HarnessTree = {
      "AGENTS.md": "ok",
      "my-skill/SKILL.md": skill("my-skill"),
    };
    // root skillDir means my-skill/SKILL.md is a skill
    const result = validateHarnessTree(tree);
    expect(result.ok).toBe(true);
  });
});

describe("validateHarnessTree — always-on cap (strength 7)", () => {
  it("errors when always-on content exceeds alwaysOnMax", () => {
    const big = "x".repeat(600);
    const tree: HarnessTree = { "AGENTS.md": big };
    const result = validateHarnessTree(tree, { surface: SURFACE });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("cap"))).toBe(true);
  });

  it("passes when exactly at the cap", () => {
    const tree: HarnessTree = {
      "AGENTS.md": "x".repeat(500),
      "skills/s/SKILL.md": skill("s"),
    };
    const result = validateHarnessTree(tree, { surface: SURFACE });
    // alwaysOnMax is 500 and body is exactly 500 → ok
    expect(result.ok).toBe(true);
  });
});

describe("validateHarnessTree — missing description (strength 2)", () => {
  it("errors on skill without description frontmatter", () => {
    const tree: HarnessTree = {
      "AGENTS.md": "# ok",
      "skills/bad-skill/SKILL.md": skillNoDesc("bad-skill"),
    };
    const result = validateHarnessTree(tree, { surface: SURFACE });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("description") && e.includes("SILENTLY"))).toBe(true);
  });

  it("errors when description is empty string", () => {
    const tree: HarnessTree = {
      "AGENTS.md": "# ok",
      "skills/empty-desc/SKILL.md": "---\ndescription: \n---\n\n# body\n",
    };
    const result = validateHarnessTree(tree, { surface: SURFACE });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("description"))).toBe(true);
  });
});

describe("validateHarnessTree — name mismatch (strength 2)", () => {
  it("errors when frontmatter name overrides directory name", () => {
    const tree: HarnessTree = {
      "AGENTS.md": "# ok",
      "skills/my-skill/SKILL.md":
        "---\nname: different-name\ndescription: test\n---\n\n# body\n",
    };
    const result = validateHarnessTree(tree, { surface: SURFACE });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("OVERRIDES"))).toBe(true);
  });

  it("no error when frontmatter name matches directory name", () => {
    const result = validateHarnessTree(validTree(), { surface: SURFACE });
    expect(result.errors.filter(e => e.includes("OVERRIDES"))).toHaveLength(0);
  });
});

describe("validateHarnessTree — script refs (strength 2)", () => {
  it("errors when a referenced python script is absent", () => {
    const tree: HarnessTree = {
      "AGENTS.md": "# ok",
      "skills/my-skill/SKILL.md":
        "---\ndescription: runs a script\n---\n\nRun: `python3 scripts/fix.py`\n",
    };
    const result = validateHarnessTree(tree, { surface: SURFACE });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("scripts/fix.py") && e.includes("not in the harness"))).toBe(
      true,
    );
  });

  it("no error when referenced python script is present", () => {
    const tree: HarnessTree = {
      "AGENTS.md": "# ok",
      "skills/my-skill/SKILL.md":
        "---\ndescription: runs a script\n---\n\nRun: `python3 scripts/fix.py`\n",
      "scripts/fix.py": "print('hi')",
    };
    const result = validateHarnessTree(tree, { surface: SURFACE });
    expect(result.ok).toBe(true);
  });

  it("checks always-on file script refs too", () => {
    const tree: HarnessTree = {
      "AGENTS.md": "Run python3 tools/setup.py to initialize.",
      "skills/s/SKILL.md": skill("s"),
    };
    const result = validateHarnessTree(tree, { surface: SURFACE });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("tools/setup.py"))).toBe(true);
  });
});

describe("validateHarnessTree — compilePython hook (strength 2)", () => {
  it("calls compilePython for .py files and reports error", () => {
    const tree: HarnessTree = {
      "AGENTS.md": "# ok",
      "scripts/broken.py": "def foo(:\n  pass\n",
    };
    const result = validateHarnessTree(tree, {
      surface: SURFACE,
      compilePython: (_rel, _src) => "SyntaxError: invalid syntax",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("scripts/broken.py") && e.includes("does not compile"))).toBe(
      true,
    );
  });

  it("no error when compilePython returns null", () => {
    const tree: HarnessTree = {
      "AGENTS.md": "# ok",
      "scripts/ok.py": "print('hi')",
    };
    const result = validateHarnessTree(tree, {
      surface: SURFACE,
      compilePython: () => null,
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateHarnessTree — lintSkillContent integration", () => {
  it("forwards lintSkillContent errors onto the skill path", () => {
    const tree: HarnessTree = {
      "AGENTS.md": "# ok",
      "skills/my-skill/SKILL.md": skill("my-skill"),
    };
    const result = validateHarnessTree(tree, {
      surface: SURFACE,
      lintSkillContent: () => ({ errors: ["injected error"], warnings: [] }),
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes("injected error") && e.includes("my-skill/SKILL.md"))).toBe(
      true,
    );
  });

  it("ignores lintSkillContent warnings (they do not block validation)", () => {
    const tree = validTree();
    const result = validateHarnessTree(tree, {
      surface: SURFACE,
      lintSkillContent: () => ({ errors: [], warnings: ["style concern"] }),
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateHarnessTree — omp trigger-line finding", () => {
  it("does NOT error when a skill name is absent from always-on text", () => {
    // omp auto-lists skills in <skills> prompt section; no trigger lines needed
    const tree: HarnessTree = {
      "AGENTS.md": "nothing about my-skill here",
      "skills/my-skill/SKILL.md": skill("my-skill"),
    };
    const result = validateHarnessTree(tree, { surface: SURFACE });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("validateHarnessTree — census", () => {
  it("counts files, skills, scripts correctly", () => {
    const tree: HarnessTree = {
      "AGENTS.md": "# ok",
      "skills/a/SKILL.md": skill("a"),
      "skills/b/SKILL.md": skill("b"),
      "scripts/helper.py": "print('hi')",
      "skills/a/helper.py": "print('inner')",
    };
    const result = validateHarnessTree(tree, { surface: SURFACE });
    expect(result.ok).toBe(true);
    expect(result.census.skills).toBe(2);
    expect(result.census.files).toBe(5);
    expect(result.census.scripts).toBe(2);
  });
});

// ─── autotriggerSkills ───────────────────────────────────────────────────────

describe("autotriggerSkills", () => {
  it("returns the tree unchanged and repaired=[] (omp no-op)", () => {
    const tree = validTree();
    const { tree: out, repaired } = autotriggerSkills(tree, SURFACE);
    expect(out).toBe(tree); // same reference
    expect(repaired).toHaveLength(0);
  });

  it("is safe on an empty tree", () => {
    const { tree, repaired } = autotriggerSkills({});
    expect(tree).toEqual({});
    expect(repaired).toHaveLength(0);
  });
});

// ─── diffHarnessTrees ────────────────────────────────────────────────────────

describe("diffHarnessTrees", () => {
  it("returns empty diff for identical trees", () => {
    const tree = validTree();
    const diff = diffHarnessTrees(tree, tree, SURFACE);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
    expect(diff.alwaysOnCharDelta).toBe(0);
  });

  it("detects added, removed, modified", () => {
    const before: HarnessTree = {
      "AGENTS.md": "old",
      "skills/old/SKILL.md": skill("old"),
    };
    const after: HarnessTree = {
      "AGENTS.md": "new",
      "skills/new/SKILL.md": skill("new"),
    };
    const diff = diffHarnessTrees(before, after, SURFACE);
    expect(diff.added).toEqual(["skills/new/SKILL.md"]);
    expect(diff.removed).toEqual(["skills/old/SKILL.md"]);
    expect(diff.modified).toEqual(["AGENTS.md"]);
  });

  it("computes alwaysOnCharDelta correctly", () => {
    const before: HarnessTree = { "AGENTS.md": "short" };
    const after: HarnessTree = { "AGENTS.md": "much longer text here" };
    const diff = diffHarnessTrees(before, after, SURFACE);
    expect(diff.alwaysOnCharDelta).toBe(
      "much longer text here".length - "short".length,
    );
  });

  it("negative delta when always-on shrinks", () => {
    const before: HarnessTree = { "AGENTS.md": "long content here" };
    const after: HarnessTree = { "AGENTS.md": "tiny" };
    const diff = diffHarnessTrees(before, after, SURFACE);
    expect(diff.alwaysOnCharDelta).toBeLessThan(0);
  });

  it("empty trees produce empty diff", () => {
    const diff = diffHarnessTrees({}, {}, SURFACE);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
    expect(diff.alwaysOnCharDelta).toBe(0);
  });

  it("uses FCODE_SURFACE by default", () => {
    const before: HarnessTree = { "AGENTS.md": "a" };
    const after: HarnessTree = { "AGENTS.md": "ab" };
    const diff = diffHarnessTrees(before, after);
    expect(diff.alwaysOnCharDelta).toBe(1);
  });
});

// ─── harnessDiversity ────────────────────────────────────────────────────────

describe("harnessDiversity", () => {
  it("n=1 → meanLineJaccard=1 (degenerate)", () => {
    const result = harnessDiversity({ a: validTree() });
    expect(result.n).toBe(1);
    expect(result.nDistinct).toBe(1);
    expect(result.meanLineJaccard).toBe(1.0);
  });

  it("n=0 → empty result", () => {
    const result = harnessDiversity({});
    expect(result.n).toBe(0);
    expect(result.nDistinct).toBe(0);
    expect(result.meanLineJaccard).toBe(1.0);
  });

  it("identical trees → meanLineJaccard=1", () => {
    const tree = validTree();
    const result = harnessDiversity({ a: tree, b: { ...tree } });
    expect(result.nDistinct).toBe(1);
    expect(result.meanLineJaccard).toBe(1.0);
  });

  it("completely different trees → meanLineJaccard < 1", () => {
    const result = harnessDiversity({
      a: { "AGENTS.md": "alpha content unique here" },
      b: { "AGENTS.md": "totally different text there" },
    });
    expect(result.meanLineJaccard).toBeLessThan(1.0);
  });

  it("counts nDistinct correctly across duplicates", () => {
    const t1: HarnessTree = { "AGENTS.md": "v1" };
    const t2: HarnessTree = { "AGENTS.md": "v2" };
    const t3: HarnessTree = { "AGENTS.md": "v1" }; // same as t1
    const result = harnessDiversity({ a: t1, b: t2, c: t3 });
    expect(result.n).toBe(3);
    expect(result.nDistinct).toBe(2);
  });
});

// ─── surfaceForBase ───────────────────────────────────────────────────────────

describe("surfaceForBase", () => {
  it("returns FCODE_SURFACE when base is smaller than default cap", () => {
    const base: HarnessTree = { "AGENTS.md": "small" };
    const surface = surfaceForBase(base);
    expect(surface.alwaysOnMax).toBe(FCODE_SURFACE.alwaysOnMax);
    expect(surface.skillDir).toBe(FCODE_SURFACE.skillDir);
    expect(surface.alwaysOn).toEqual(FCODE_SURFACE.alwaysOn);
  });

  it("large base + 1500 chars validates", () => {
    // Base AGENTS.md = 7 000 chars; alwaysOnText joins ["AGENTS.md","CLAUDE.md"] with "\n\n"
    // so baseLen = 7000 + 2 (separator) = 7002 → alwaysOnMax = max(6000, 7002+2000) = 9002
    const bigContent = "x".repeat(7_000);
    const base: HarnessTree = { "AGENTS.md": bigContent };
    const surface = surfaceForBase(base);
    expect(surface.alwaysOnMax).toBe(9_002);

    // Candidate adds 1 500 chars → 8 502 ≤ 9 002 → valid
    const candidate: HarnessTree = { "AGENTS.md": bigContent + "y".repeat(1_500) };
    const { ok, errors } = validateHarnessTree(candidate, { surface });
    expect(ok).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it("large base + 3000 chars fails", () => {
    // alwaysOnMax = 9 002 (see above); 7002 + 3000 = 10 002 > 9 002 → invalid
    const bigContent = "x".repeat(7_000);
    const base: HarnessTree = { "AGENTS.md": bigContent };
    const surface = surfaceForBase(base);

    const candidate: HarnessTree = { "AGENTS.md": bigContent + "y".repeat(3_000) };
    const { ok, errors } = validateHarnessTree(candidate, { surface });
    expect(ok).toBe(false);
    expect(errors.some((e) => /always-on/.test(e))).toBe(true);
  });
});
