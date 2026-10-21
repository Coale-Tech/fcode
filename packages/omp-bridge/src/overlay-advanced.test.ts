/**
 * Behaviour tests for mergeAdvancedIntoOverlay (dotted id → nested YAML merged into
 * the Fcode overlay). The key invariant: an Advanced id never drops or replaces
 * anything the Fcode overlay already wrote (duplicate top-level YAML keys would).
 */
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { makeOmpOverlay } from "./bridge.js";
import { mergeAdvancedIntoOverlay } from "./overlay-advanced.js";

function parse(lines: string[]): Record<string, unknown> {
  const result: unknown = parseYaml(lines.join("\n"));
  return result !== null && typeof result === "object" && !Array.isArray(result)
    ? (result as Record<string, unknown>)
    : {};
}

function nav(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur === null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

describe("mergeAdvancedIntoOverlay", () => {
  it("returns the base lines unchanged when advanced is empty", () => {
    expect(mergeAdvancedIntoOverlay(["a:", "  b: 1"], {})).toEqual(["a:", "  b: 1"]);
  });

  it("round-trips number, enum, array, record and quoted-string values", () => {
    const record = { task: "anthropic/claude-sonnet-4-5", smol: "openai/gpt-4o-mini" };
    const parsed = parse(
      mergeAdvancedIntoOverlay([], {
        "retry.maxRetries": 5,
        "edit.mode": "hashline",
        "tools.disabled": ["github", "ast_grep"],
        "task.agentModelOverrides": record,
        "collab.relayUrl": "https://relay.example.com:8080",
        "commit.message": "# initial",
        "task.isolation.enabled": true,
      }),
    );
    expect(nav(parsed, "retry", "maxRetries")).toBe(5);
    expect(nav(parsed, "edit", "mode")).toBe("hashline");
    expect(nav(parsed, "tools", "disabled")).toEqual(["github", "ast_grep"]);
    expect(nav(parsed, "task", "agentModelOverrides")).toEqual(record);
    expect(nav(parsed, "collab", "relayUrl")).toBe("https://relay.example.com:8080");
    expect(nav(parsed, "commit", "message")).toBe("# initial");
    expect(nav(parsed, "task", "isolation", "enabled")).toBe(true);
  });

  it("groups keys under one section, adds siblings to an existing section, keeps existing keys", () => {
    const base = ["retry:", "  maxRetries: 3", "other: 1"];
    const lines = mergeAdvancedIntoOverlay(base, {
      "retry.maxRetries": 99, // already set by the overlay → ignored
      "retry.backoffMs": 500,
      "retry.jitter": true,
    });
    expect(lines.filter((l) => l === "retry:")).toHaveLength(1);
    const parsed = parse(lines);
    expect(nav(parsed, "retry", "maxRetries")).toBe(3);
    expect(nav(parsed, "retry", "backoffMs")).toBe(500);
    expect(nav(parsed, "retry", "jitter")).toBe(true);
    expect(nav(parsed, "other")).toBe(1);
  });

  it("ignores Fcode-owned ids", () => {
    const parsed = parse(
      mergeAdvancedIntoOverlay([], { "tools.approvalMode": "yolo", "memory.backend": "off" }),
    );
    expect(parsed).toEqual({});
  });
});

describe("makeOmpOverlay with colliding Advanced ids", () => {
  const base = {
    dataDir: "/tmp/fcode-test-data",
    resourcesPath: "/app/resources",
    screenshotsDir: "/tmp/fcode-test-data/screenshots",
    approvalMode: "write" as const,
    memory: { backend: "mnemopi" as const },
  };

  it("never drops Fcode-owned blocks (single top-level key each, content intact)", () => {
    const overlay = makeOmpOverlay({
      ...base,
      ompSettings: {
        "task.isolation.enabled": true,
        advanced: {
          "tools.format": "json",
          "tools.approvalMode": "yolo",
          "skills.enableSkillCommands": false,
          "bash.enabled": false,
          "bash.timeoutMs": 1000,
          "memory.backend": "off",
          "task.isolation.merge": "branch",
          "retry.maxRetries": 7,
        },
      },
    });
    const topKeys = overlay.split("\n").filter((l) => /^[A-Za-z]/.test(l) && l.includes(":"));
    const names = topKeys.map((l) => l.slice(0, l.indexOf(":")));
    expect(new Set(names).size).toBe(names.length); // no duplicate top-level key
    const parsed = parse(overlay.split("\n"));
    expect(nav(parsed, "tools", "approvalMode")).toBe("write"); // Fcode's, not Advanced "yolo"
    expect(nav(parsed, "tools", "format")).toBe("json");
    expect(nav(parsed, "tools", "approval")).toBeDefined();
    expect(nav(parsed, "skills", "enableSkillCommands")).toBe(false);
    expect(nav(parsed, "skills", "customDirectories") ?? nav(parsed, "skills", "directories")).toBeDefined();
    expect(nav(parsed, "bash", "enabled")).toBe(false); // added beside the overlay's patterns
    expect(nav(parsed, "bash", "timeoutMs")).toBe(1000);
    expect(nav(parsed, "bash", "patterns")).toBeDefined();
    expect(nav(parsed, "memory", "backend")).toBe("mnemopi");
    expect(nav(parsed, "task", "isolation", "enabled")).toBe(true);
    expect(nav(parsed, "task", "isolation", "merge")).toBe("branch");
    expect(nav(parsed, "retry", "maxRetries")).toBe(7);
  });
});
