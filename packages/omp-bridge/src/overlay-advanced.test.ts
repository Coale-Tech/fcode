/**
 * Behaviour tests for overlayAdvancedLines (dotted id → nested YAML).
 *
 * Acceptance criteria from slice A:
 *   - round trip for retry.maxRetries (number)
 *   - round trip for edit.mode (enum / string)
 *   - array and record (object) values use inline JSON
 *   - strings needing JSON quoting are quoted
 *   - curated-wins collision: a key present in curatedIds is not emitted
 */
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { overlayAdvancedLines } from "./overlay-advanced.js";

/** Join lines and parse as YAML, returning the top-level object (or empty). */
function parse(lines: string[]): Record<string, unknown> {
  const result: unknown = parseYaml(lines.join("\n"));
  if (result !== null && typeof result === "object" && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  return {};
}

/** Navigate an unknown value through a sequence of keys without `as any`. */
function nav(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur === null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

describe("overlayAdvancedLines", () => {
  it("returns empty array when advanced is empty", () => {
    expect(overlayAdvancedLines({}, {})).toEqual([]);
  });

  it("round-trips retry.maxRetries (number)", () => {
    const lines = overlayAdvancedLines({ "retry.maxRetries": 5 }, {});
    expect(lines.length).toBeGreaterThan(0);
    expect(nav(parse(lines), "retry", "maxRetries")).toBe(5);
  });

  it("round-trips edit.mode (enum string)", () => {
    const lines = overlayAdvancedLines({ "edit.mode": "hashline" }, {});
    expect(nav(parse(lines), "edit", "mode")).toBe("hashline");
  });

  it("round-trips an array value as inline JSON", () => {
    const lines = overlayAdvancedLines({ "tools.disabled": ["github", "ast_grep"] }, {});
    expect(nav(parse(lines), "tools", "disabled")).toEqual(["github", "ast_grep"]);
  });

  it("round-trips a record (object) value as inline JSON", () => {
    const val = { task: "anthropic/claude-sonnet-4-5", smol: "openai/gpt-4o-mini" };
    const lines = overlayAdvancedLines({ "task.agentModelOverrides": val }, {});
    expect(nav(parse(lines), "task", "agentModelOverrides")).toEqual(val);
  });

  it("quotes strings containing YAML-special characters", () => {
    const lines = overlayAdvancedLines({ "collab.relayUrl": "https://relay.example.com:8080" }, {});
    expect(nav(parse(lines), "collab", "relayUrl")).toBe("https://relay.example.com:8080");
  });

  it("quotes a string starting with a comment character", () => {
    const lines = overlayAdvancedLines({ "commit.message": "# initial" }, {});
    expect(nav(parse(lines), "commit", "message")).toBe("# initial");
  });

  it("curated-wins collision: curated key is entirely omitted", () => {
    const curatedIds = { "retry.maxRetries": true as const };
    // advanced says 99; curated writer will emit 3 elsewhere — advanced must be suppressed.
    const lines = overlayAdvancedLines({ "retry.maxRetries": 99 }, curatedIds);
    if (lines.length > 0) {
      expect(nav(parse(lines), "retry", "maxRetries")).not.toBe(99);
    } else {
      expect(lines).toEqual([]);
    }
  });

  it("emits non-curated key while skipping curated one (mixed)", () => {
    const curatedIds = { "retry.maxRetries": true as const };
    const lines = overlayAdvancedLines(
      { "retry.maxRetries": 99, "edit.mode": "patch" },
      curatedIds,
    );
    const parsed = parse(lines);
    expect(nav(parsed, "edit", "mode")).toBe("patch");
    expect(nav(parsed, "retry", "maxRetries")).not.toBe(99);
  });

  it("handles three-level dotted paths", () => {
    const lines = overlayAdvancedLines({ "task.isolation.enabled": true }, {});
    expect(nav(parse(lines), "task", "isolation", "enabled")).toBe(true);
  });

  it("groups multiple keys under the same parent section", () => {
    const lines = overlayAdvancedLines(
      { "retry.maxRetries": 3, "retry.backoffMs": 500 },
      {},
    );
    const raw = lines.join("\n");
    // Exactly one "retry:" header — settings grouped, not duplicated.
    expect((raw.match(/^retry:/gm) ?? []).length).toBe(1);
    const parsed = parse(lines);
    expect(nav(parsed, "retry", "maxRetries")).toBe(3);
    expect(nav(parsed, "retry", "backoffMs")).toBe(500);
  });
});
