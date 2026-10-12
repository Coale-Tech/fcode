/**
 * Unit tests for the pure-logic helpers in OmpAdvancedSettings.tsx.
 * Covers: filtering/search/modified, grouping, reset removes key,
 * value coercion per type, hidden-curated rule.
 *
 * Run: npx vitest run src/features/settings/OmpAdvancedSettings.test.ts
 */
import { describe, it, expect } from "vitest";
import type { OmpSettingDescriptor } from "@pi-desktop/shared";
import {
  coerceValue,
  filterDescriptors,
  groupDescriptors,
  isCuratedKey,
  resetAdvancedKey,
} from "./OmpAdvancedSettings";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function d(
  id: string,
  tab = "tools",
  group = "General",
  overrides: Partial<OmpSettingDescriptor> = {},
): OmpSettingDescriptor {
  return {
    id,
    type: "string",
    tab,
    group,
    label: `Label for ${id}`,
    ...overrides,
  };
}

const DESCS: OmpSettingDescriptor[] = [
  d("retry.maxRetries", "interaction", "Retry"),
  d("retry.delayMs", "interaction", "Retry"),
  d("edit.mode", "files", "Editor"),
  d("eval.py", "tools", "Python"),          // curated — should be filtered
  d("browser.enabled", "tools", "Browser"), // curated — should be filtered
  d("ssh.enabled", "tools", "SSH"),
];

// ── isCuratedKey ─────────────────────────────────────────────────────────────

describe("isCuratedKey", () => {
  it("returns true for a curated key", () => {
    expect(isCuratedKey("eval.py")).toBe(true);
    expect(isCuratedKey("browser.enabled")).toBe(true);
    expect(isCuratedKey("lsp.enabled")).toBe(true);
  });

  it("returns false for a non-curated key", () => {
    expect(isCuratedKey("retry.maxRetries")).toBe(false);
    expect(isCuratedKey("ssh.enabled")).toBe(false);
    expect(isCuratedKey("unknown.key")).toBe(false);
  });
});

// ── filterDescriptors ─────────────────────────────────────────────────────────

describe("filterDescriptors", () => {
  it("excludes curated keys always", () => {
    const result = filterDescriptors(DESCS, "", false, {});
    const ids = result.map((d) => d.id);
    expect(ids).not.toContain("eval.py");
    expect(ids).not.toContain("browser.enabled");
    expect(ids).toContain("retry.maxRetries");
    expect(ids).toContain("ssh.enabled");
  });

  it("applies modifiedOnly — keeps only ids present in advanced", () => {
    const result = filterDescriptors(DESCS, "", true, { "retry.maxRetries": 5 });
    expect(result.map((d) => d.id)).toEqual(["retry.maxRetries"]);
  });

  it("modifiedOnly with empty advanced returns nothing", () => {
    const result = filterDescriptors(DESCS, "", true, {});
    expect(result).toHaveLength(0);
  });

  it("search matches label", () => {
    const result = filterDescriptors(DESCS, "Label for ssh", false, {});
    expect(result.map((d) => d.id)).toEqual(["ssh.enabled"]);
  });

  it("search matches id substring", () => {
    const result = filterDescriptors(DESCS, "retry", false, {});
    expect(result.map((d) => d.id)).toEqual(["retry.maxRetries", "retry.delayMs"]);
  });

  it("search matches description", () => {
    const withDesc = [...DESCS, d("commit.msg", "shell", "Git", { description: "commit message template" })];
    const result = filterDescriptors(withDesc, "commit message", false, {});
    expect(result.map((d) => d.id)).toEqual(["commit.msg"]);
  });

  it("search is case-insensitive", () => {
    const result = filterDescriptors(DESCS, "RETRY", false, {});
    expect(result).toHaveLength(2);
  });

  it("blank query after trim matches everything (minus curated)", () => {
    const result = filterDescriptors(DESCS, "   ", false, {});
    expect(result.map((d) => d.id)).toEqual(["retry.maxRetries", "retry.delayMs", "edit.mode", "ssh.enabled"]);
  });
});

// ── groupDescriptors ──────────────────────────────────────────────────────────

describe("groupDescriptors", () => {
  const items = [
    d("a", "tab1", "g1"),
    d("b", "tab1", "g1"),
    d("c", "tab1", "g2"),
    d("d", "tab2", "g1"),
  ];

  it("produces a tab → group → items structure", () => {
    const tabs = groupDescriptors(items);
    expect([...tabs.keys()]).toEqual(["tab1", "tab2"]);
    expect([...tabs.get("tab1")!.keys()]).toEqual(["g1", "g2"]);
    expect(tabs.get("tab1")!.get("g1")!.map((x) => x.id)).toEqual(["a", "b"]);
    expect(tabs.get("tab1")!.get("g2")!.map((x) => x.id)).toEqual(["c"]);
    expect(tabs.get("tab2")!.get("g1")!.map((x) => x.id)).toEqual(["d"]);
  });

  it("preserves insertion order", () => {
    const tabs = groupDescriptors([d("z", "z", "z"), d("a", "a", "a")]);
    expect([...tabs.keys()]).toEqual(["z", "a"]);
  });

  it("handles empty input", () => {
    expect(groupDescriptors([])).toEqual(new Map());
  });
});

// ── resetAdvancedKey ──────────────────────────────────────────────────────────

describe("resetAdvancedKey", () => {
  it("removes the key from the map", () => {
    const result = resetAdvancedKey({ "retry.maxRetries": 5, "edit.mode": "full" }, "retry.maxRetries");
    expect(result).toEqual({ "edit.mode": "full" });
  });

  it("does not mutate the original", () => {
    const orig = { "retry.maxRetries": 5 };
    resetAdvancedKey(orig, "retry.maxRetries");
    expect(orig).toEqual({ "retry.maxRetries": 5 });
  });

  it("is a no-op for a key not present", () => {
    const orig = { "edit.mode": "full" };
    const result = resetAdvancedKey(orig, "nonexistent");
    expect(result).toEqual({ "edit.mode": "full" });
  });
});

// ── coerceValue ───────────────────────────────────────────────────────────────

describe("coerceValue", () => {
  it("boolean: 'true' → true", () => expect(coerceValue("true", "boolean")).toBe(true));
  it("boolean: '1' → true", () => expect(coerceValue("1", "boolean")).toBe(true));
  it("boolean: 'yes' → true", () => expect(coerceValue("yes", "boolean")).toBe(true));
  it("boolean: 'false' → false", () => expect(coerceValue("false", "boolean")).toBe(false));

  it("number: valid → number", () => expect(coerceValue("42", "number")).toBe(42));
  it("number: float", () => expect(coerceValue("3.14", "number")).toBe(3.14));
  it("number: invalid → undefined", () => expect(coerceValue("abc", "number")).toBeUndefined());
  it("number: NaN string → undefined", () => expect(coerceValue("NaN", "number")).toBeUndefined());

  it("array: splits on newlines, trims, filters blanks", () => {
    expect(coerceValue("a\n  b  \n\nc", "array")).toEqual(["a", "b", "c"]);
  });
  it("array: empty string → empty array", () => {
    expect(coerceValue("", "array")).toEqual([]);
  });

  it("record: valid JSON → object", () => {
    expect(coerceValue('{"a":1}', "record")).toEqual({ a: 1 });
  });
  it("record: invalid JSON → undefined", () => {
    expect(coerceValue("{bad json}", "record")).toBeUndefined();
  });

  it("string: returns as-is", () => expect(coerceValue("hello", "string")).toBe("hello"));
  it("enum: returns as-is", () => expect(coerceValue("full", "enum")).toBe("full"));
});
