import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CuratorState, UsageMap } from "./skill-curator.js";
import {
  DEFAULT_CURATOR_CONFIG,
  curatorDir,
  extractSkillName,
  ledgerPath,
  pinSkill,
  recordSkillUse,
  restoreSkill,
  runCurator,
  shouldRunCurator,
  unpinSkill,
  usagePath,
} from "./skill-curator.js";

vi.setConfig({ testTimeout: 10_000 });

// ── helpers ───────────────────────────────────────────────────────────────────

let root = "";

beforeEach(() => { root = mkdtempSync(join(tmpdir(), "curator-")); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** Past ISO timestamp N days ago. */
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// ── shouldRunCurator ──────────────────────────────────────────────────────────

describe("shouldRunCurator", () => {
  const cfg = DEFAULT_CURATOR_CONFIG;
  const idle3h = () => Date.now() - 3 * 3_600_000;

  it("returns false when firstSeen is absent (uninitialised)", () => {
    expect(shouldRunCurator({}, Date.now(), idle3h(), cfg)).toBe(false);
  });

  it("defers first run: false when intervalHours not elapsed since firstSeen", () => {
    const state: CuratorState = { firstSeen: daysAgo(3) }; // 3d < 7d interval
    expect(shouldRunCurator(state, Date.now(), idle3h(), cfg)).toBe(false);
  });

  it("first run fires once intervalHours elapsed since firstSeen", () => {
    const state: CuratorState = { firstSeen: daysAgo(8) }; // 8d > 7d
    expect(shouldRunCurator(state, Date.now(), idle3h(), cfg)).toBe(true);
  });

  it("returns false when idle < minIdleHours", () => {
    const state: CuratorState = { firstSeen: daysAgo(20), lastRun: daysAgo(8) };
    const lastActivity = Date.now() - 1 * 3_600_000; // 1h < 2h min
    expect(shouldRunCurator(state, Date.now(), lastActivity, cfg)).toBe(false);
  });

  it("returns false when last run < intervalHours ago", () => {
    const state: CuratorState = { firstSeen: daysAgo(20), lastRun: daysAgo(3) };
    expect(shouldRunCurator(state, Date.now(), idle3h(), cfg)).toBe(false);
  });

  it("returns true when idle >= minIdleHours and intervalHours elapsed", () => {
    const state: CuratorState = { firstSeen: daysAgo(20), lastRun: daysAgo(8) };
    expect(shouldRunCurator(state, Date.now(), idle3h(), cfg)).toBe(true);
  });
});

// ── runCurator (via namesOverride test seam) ──────────────────────────────────

describe("runCurator", () => {
  const cfg = DEFAULT_CURATOR_CONFIG;

  function populate(skills: Record<string, { days: number; pinned?: boolean; status?: string }>): void {
    mkdirSync(curatorDir(root), { recursive: true });
    const usage: UsageMap = {};
    for (const [name, spec] of Object.entries(skills)) {
      usage[name] = {
        uses: 1,
        lastUsed: daysAgo(spec.days),
        createdAt: daysAgo(spec.days),
        status: spec.pinned ? "pinned" : ((spec.status ?? "active") as UsageMap[string]["status"]),
      };
    }
    writeFileSync(usagePath(root), JSON.stringify(usage));
  }

  it("marks 15-day unused skill as stale", async () => {
    populate({ alpha: { days: 15 } });
    await runCurator(root, cfg, ["alpha"]);
    const u: UsageMap = JSON.parse(readFileSync(usagePath(root), "utf8"));
    expect(u["alpha"].status).toBe("stale");
  });

  it("archives 31-day unused skill with ledger entry", async () => {
    const name = "old-lesson";
    populate({ [name]: { days: 31 } });
    // Create a fake skill dir under frappeskills so the move can happen
    const skillDir = join(root, "skills", "frappeskills", name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: test\n---\nContent.");

    await runCurator(root, cfg, [name]);

    // Skill dir moved out of frappeskills
    expect(existsSync(skillDir)).toBe(false);
    const u: UsageMap = JSON.parse(readFileSync(usagePath(root), "utf8"));
    expect(u[name].status).toBe("archived");
    const ledger = readFileSync(ledgerPath(root), "utf8");
    expect(ledger).toContain('"action":"archive"');
    expect(ledger).toContain(name);
  });

  it("leaves pinned skill untouched regardless of age", async () => {
    populate({ keeper: { days: 60, pinned: true } });
    await runCurator(root, cfg, ["keeper"]);
    const u: UsageMap = JSON.parse(readFileSync(usagePath(root), "utf8"));
    expect(u["keeper"].status).toBe("pinned");
  });

  it("restores an archived skill back to its original location", async () => {
    const name = "restorable";
    populate({ [name]: { days: 31 } });
    const skillDir = join(root, "skills", "frappeskills", name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: test\n---\nContent.");

    await runCurator(root, cfg, [name]);
    expect(existsSync(skillDir)).toBe(false);

    await restoreSkill(root, name);
    expect(existsSync(skillDir)).toBe(true);

    const u: UsageMap = JSON.parse(readFileSync(usagePath(root), "utf8"));
    expect(u[name].status).toBe("active");
    const ledger = readFileSync(ledgerPath(root), "utf8");
    expect(ledger).toContain('"action":"restore"');
  });
});

// ── pin / unpin ───────────────────────────────────────────────────────────────

describe("pin / unpin", () => {
  it("pin sets status=pinned; unpin resets to active; both logged", () => {
    mkdirSync(curatorDir(root), { recursive: true });
    pinSkill(root, "my-skill");
    const after: UsageMap = JSON.parse(readFileSync(usagePath(root), "utf8"));
    expect(after["my-skill"].status).toBe("pinned");

    unpinSkill(root, "my-skill");
    const final: UsageMap = JSON.parse(readFileSync(usagePath(root), "utf8"));
    expect(final["my-skill"].status).toBe("active");

    const ledger = readFileSync(ledgerPath(root), "utf8");
    expect(ledger).toContain('"action":"pin"');
    expect(ledger).toContain('"action":"unpin"');
  });
});

// ── extractSkillName ──────────────────────────────────────────────────────────

describe("extractSkillName", () => {
  it("parses skill:// URIs", () => {
    expect(extractSkillName("skill://my-skill")).toBe("my-skill");
    expect(extractSkillName("skill://my-skill/SKILL.md")).toBe("my-skill");
  });

  it("parses SKILL.md paths", () => {
    expect(extractSkillName("/home/user/.omp/agent/managed-skills/foo/SKILL.md")).toBe("foo");
    expect(extractSkillName("/data/skills/frappeskills/bar-skill/SKILL.md")).toBe("bar-skill");
  });

  it("returns null for unrelated paths", () => {
    expect(extractSkillName("/some/other/file.ts")).toBeNull();
    expect(extractSkillName("")).toBeNull();
  });
});

// ── recordSkillUse ────────────────────────────────────────────────────────────

describe("recordSkillUse", () => {
  it("increments use count and debounce-flushes to usage.json", async () => {
    mkdirSync(curatorDir(root), { recursive: true });
    vi.useFakeTimers();

    recordSkillUse(root, "alpha");
    recordSkillUse(root, "alpha");
    recordSkillUse(root, "beta");

    await vi.runAllTimersAsync();

    const u: UsageMap = JSON.parse(readFileSync(usagePath(root), "utf8"));
    expect(u["alpha"].uses).toBe(2);
    expect(u["beta"].uses).toBe(1);
    expect(u["alpha"].status).toBe("active");

    vi.useRealTimers();
  });
});
