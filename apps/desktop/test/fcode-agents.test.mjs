/**
 * fcode-agents.test.mjs — validates every agent file in resources/fcode-agents/agents/
 *
 * Run: node --test apps/desktop/test/fcode-agents.test.mjs
 * CI:  picked up by "pnpm -r --if-present test" via apps/desktop/package.json "test" script.
 *
 * CONTRACT FOR SIBLING AUTHORS
 * ─────────────────────────────
 * Each sibling PR that adds its two agent files MUST also extend EXPECTED_AGENTS
 * below by adding those two names. When all 9 agents are present the set-equality
 * assertion passes and the test goes green.  Until then the test fails loudly on
 * "missing agents", which is intentional — it tells CI exactly what's missing.
 *
 * Name  → file mapping (alphabetical):
 *   frappe-bench-ops      frappe-bench-ops.md       (AgentsBenchBuilder PR)
 *   frappe-builder        frappe-builder.md          (AgentsBenchBuilder PR)
 *   frappe-data-importer  frappe-data-importer.md    (AgentsDataCurator PR)
 *   frappe-dev            frappe-dev.md              (this PR — INFRA)
 *   frappe-reviewer       frappe-reviewer.md         (this PR — INFRA)
 *   frappe-scout          frappe-scout.md            (this PR — INFRA)
 *   frappe-tester         frappe-tester.md           (AgentsTesterUi PR)
 *   frappe-ui-verifier    frappe-ui-verifier.md      (AgentsTesterUi PR)
 *   skill-curator         skill-curator.md           (AgentsDataCurator PR)
 */

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// ─── configuration ───────────────────────────────────────────────────────────

/**
 * Contract set — agents that MUST be present on disk.
 * Sibling PRs each append their two names here when they rebase onto main.
 * Growth order:
 *   INFRA (this PR)        → frappe-dev, frappe-reviewer, frappe-scout
 *   AgentsBenchBuilder PR  → + frappe-bench-ops, frappe-builder
 *   AgentsDataCurator PR   → + frappe-data-importer, skill-curator
 *   AgentsTesterUi PR      → + frappe-tester, frappe-ui-verifier
 * When all 9 are present the set-equality test passes and CI is green.
 */
const EXPECTED_AGENTS = new Set([
  // INFRA PR — 3 agents (this commit)
  "frappe-dev",
  "frappe-reviewer",
  "frappe-scout",
  // AgentsBenchBuilder PR
  "frappe-bench-ops",
  "frappe-builder",
  // AgentsDataCurator PR
  "frappe-data-importer",
  "skill-curator",
  // AgentsTesterUi PR     — append "frappe-tester", "frappe-ui-verifier"
  "frappe-tester",
  "frappe-ui-verifier",
]);

/** Valid omp built-in tool names (from omp/packages/coding-agent/src/tools/builtin-names.ts). */
const BUILTIN_TOOLS = new Set([
  "read", "bash", "edit", "ast_grep", "ast_edit", "ask", "debug", "ida",
  "eval", "github", "glob", "grep", "find", "lsp", "checkpoint", "rewind",
  "context_notes", "new_context", "security_scan", "task", "wait", "todo",
  "web_search", "write", "memory_edit", "retain", "recall", "reflect",
  "learn", "manage_skill", "memory_note",
  // hidden tools that are valid in agent tool lists
  "yield", "goal", "think",
]);

/** fcode_ host tools registered by the bridge (bridge.ts HOST_TOOL_SCHEMAS). */
const HOST_TOOLS = new Set([
  "fcode_bench_execute",
  "fcode_bench_execute_read",
  "fcode_bench_run",
  "fcode_canvas",
  "fcode_canvas_read",
  "fcode_studio",
]);

// ─── helpers ─────────────────────────────────────────────────────────────────

const AGENTS_DIR = fileURLToPath(
  new URL("../resources/fcode-agents/agents", import.meta.url),
);

/** Minimal YAML frontmatter parser for --- blocks. No dep needed. */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const yaml = match[1];
  const result = {};
  let currentKey = null;
  let currentList = null;
  for (const line of yaml.split(/\r?\n/)) {
    // List item under current key
    const listItem = line.match(/^[ \t]+-[ \t]+(.+)$/);
    if (listItem && currentList !== null) {
      currentList.push(listItem[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    // Inline array: key: [a, b, c]
    const inlineArr = line.match(/^(\w[\w-]*):\s*\[([^\]]*)\]\s*$/);
    if (inlineArr) {
      currentList = null;
      result[inlineArr[1]] = inlineArr[2]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      currentKey = inlineArr[1];
      continue;
    }
    // Key: value
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      currentList = null;
      const key = kv[1];
      const val = kv[2].trim();
      if (val === "") {
        // starts a block list
        result[key] = [];
        currentList = result[key];
        currentKey = key;
      } else {
        result[key] = val.replace(/^["']|["']$/g, "");
        currentKey = key;
      }
      continue;
    }
  }
  return result;
}

// ─── discover all agent files ────────────────────────────────────────────────

const entries = await readdir(AGENTS_DIR).catch(() => []);
const agentFiles = entries
  .filter((f) => f.endsWith(".md"))
  .sort();

// ─── per-file tests ──────────────────────────────────────────────────────────

for (const file of agentFiles) {
  const name = file.replace(/\.md$/, "");
  const filePath = join(AGENTS_DIR, file);

  await test(`agent ${file}: frontmatter parses and fields are valid`, async () => {
    const content = await readFile(filePath, "utf8");

    // No absolute /Users/ paths anywhere in the file
    assert.ok(
      !content.includes("/Users/"),
      `${file} must not contain absolute /Users/ paths (not portable)`,
    );

    const fm = parseFrontmatter(content);
    assert.ok(fm !== null, `${file} must have valid --- frontmatter ---`);

    // name equals filename stem
    assert.equal(fm.name, name, `name must equal filename stem "${name}"`);

    // description non-empty and starts with a capital letter or digit
    assert.ok(
      typeof fm.description === "string" && fm.description.length > 0,
      `${file}: description must be non-empty`,
    );
    assert.ok(
      /^[A-Z0-9"]/.test(fm.description),
      `${file}: description must start with a capital letter (got "${fm.description.slice(0, 30)}")`,
    );

    // tools: if present, each must be a builtin or fcode_ host tool
    if (Array.isArray(fm.tools) && fm.tools.length > 0) {
      for (const tool of fm.tools) {
        const normalized = tool.toLowerCase().replace(/,/g, "").trim();
        // CSV values: the inline parser may join them
        for (const t of normalized.split(/\s*,\s*/)) {
          if (!t) continue;
          assert.ok(
            BUILTIN_TOOLS.has(t) || HOST_TOOLS.has(t),
            `${file}: unknown tool "${t}" — must be a builtin omp tool or fcode_* host tool`,
          );
        }
      }
    }

    // autoloadSkills: every entry must resolve to a skill directory
    if (Array.isArray(fm.autoloadSkills) && fm.autoloadSkills.length > 0) {
      const { access } = await import("node:fs/promises");
      const skillRoots = [
        fileURLToPath(new URL("../resources/fcode-skills", import.meta.url)),
        fileURLToPath(new URL("../resources/skill-packs/frappeskills", import.meta.url)),
        fileURLToPath(new URL("../resources/skill-packs/frappe-skills", import.meta.url)),
      ];
      for (const skill of fm.autoloadSkills) {
        const found = await Promise.any(
          skillRoots.map((root) => access(join(root, skill))),
        ).then(() => true).catch(() => false);
        assert.ok(
          found,
          `${file}: autoloadSkills entry "${skill}" does not resolve to a skill dir in fcode-skills or skill-packs`,
        );
      }
    }
  });
}

// ─── suite-level tests ───────────────────────────────────────────────────────

test("agent names are unique", () => {
  const names = agentFiles.map((f) => f.replace(/\.md$/, ""));
  const seen = new Set();
  for (const n of names) {
    assert.ok(!seen.has(n), `Duplicate agent name: ${n}`);
    seen.add(n);
  }
});

test("discovered agent names match the full contract set", () => {
  const present = new Set(agentFiles.map((f) => f.replace(/\.md$/, "")));
  const missing = [...EXPECTED_AGENTS].filter((n) => !present.has(n));
  const extra = [...present].filter((n) => !EXPECTED_AGENTS.has(n));

  assert.deepEqual(
    missing,
    [],
    `Missing agents (add their .md files): ${missing.join(", ")}`,
  );
  assert.deepEqual(
    extra,
    [],
    `Unexpected agents not in EXPECTED_AGENTS (add to the constant): ${extra.join(", ")}`,
  );
});
