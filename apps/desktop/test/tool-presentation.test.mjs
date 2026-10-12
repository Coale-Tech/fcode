/**
 * Unit tests for dedicated tool renderers added in slice C (parity plan).
 * Tests cover the realistic arg/result shapes from omp source so regressions
 * in the display mapping surface immediately.
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { buildToolPresentation, toolResultChips } = await import(
  "../src/lib/tool-presentation.ts"
);

// ── helpers ───────────────────────────────────────────────────────────────────

/** Minimal ToolPresentationMessage wrapping args + a details envelope. */
function msg(toolName, args, details, rawText) {
  const content = rawText ? [{ type: "text", text: rawText }] : [];
  return {
    toolName,
    toolArgs: args,
    toolResult: { content, details },
    content: undefined,
  };
}

// ── grep ──────────────────────────────────────────────────────────────────────

test("grep: displayContent renders as output block", () => {
  const result = buildToolPresentation(
    msg("grep", { pattern: "foo", path: "src" }, {
      displayContent: "src/a.ts:12: foo bar",
      files: ["src/a.ts"],
      matchCount: 1,
      fileCount: 1,
    }),
  );
  assert.ok(result.some((b) => b.kind === "code" && b.role === "output" && b.text.includes("foo bar")));
});

test("grep: falls back to files block when displayContent is absent", () => {
  const result = buildToolPresentation(
    msg("grep", { pattern: "bar" }, { files: ["src/x.ts", "src/y.ts"] }),
  );
  assert.ok(result.some((b) => b.kind === "files" && b.paths.includes("src/x.ts")));
});

test("grep: matchCount chip from GrepToolDetails", () => {
  const chips = toolResultChips(
    msg("grep", { pattern: "x" }, {
      displayContent: "src/a.ts:1: x",
      matchCount: 3,
      fileCount: 2,
    }),
  );
  assert.ok(chips.some((c) => c.role === "matches" && c.count === 3));
});

// ── ast_grep ──────────────────────────────────────────────────────────────────

test("ast_grep: displayContent renders as output block", () => {
  const result = buildToolPresentation(
    msg("ast_grep", { pat: "$X.foo", path: "." }, {
      displayContent: "src/a.ts:5: obj.foo()",
      matchCount: 1,
      fileCount: 1,
      filesSearched: 10,
      limitReached: false,
    }),
  );
  assert.ok(result.some((b) => b.kind === "code" && b.role === "output" && b.text.includes("obj.foo()")));
});

test("ast_grep: files fallback when no displayContent", () => {
  const result = buildToolPresentation(
    msg("ast_grep", { pat: "$X.bar" }, { files: ["lib/c.ts"], matchCount: 1, fileCount: 1, filesSearched: 5, limitReached: false }),
  );
  assert.ok(result.some((b) => b.kind === "files" && b.paths[0] === "lib/c.ts"));
});

// ── ast_edit ─────────────────────────────────────────────────────────────────

test("ast_edit: displayContent renders as output block", () => {
  const result = buildToolPresentation(
    msg("ast_edit", { ops: [{ pat: "$X.old", out: "$X.new" }], paths: ["src"] }, {
      displayContent: "src/a.ts: 3 replacements",
      totalReplacements: 3,
      filesTouched: 1,
      filesSearched: 4,
      applied: true,
      limitReached: false,
    }),
  );
  assert.ok(result.some((b) => b.kind === "code" && b.role === "output" && b.text.includes("3 replacements")));
});

test("ast_edit: totalReplacements chip", () => {
  const chips = toolResultChips(
    msg("ast_edit", {}, {
      displayContent: "src/a.ts: 2 replacements",
      totalReplacements: 2,
      filesTouched: 1,
      filesSearched: 1,
      applied: true,
      limitReached: false,
    }),
  );
  assert.ok(chips.some((c) => c.role === "replacements" && c.count === 2));
});

// ── edit (diff view) ─────────────────────────────────────────────────────────

test("edit: diff from EditToolDetails rendered as diff block", () => {
  const diff = [
    "--- a/src/foo.ts",
    "+++ b/src/foo.ts",
    "@@ -1,3 +1,3 @@",
    " const x = 1;",
    "-const y = 2;",
    "+const y = 99;",
    " export { x, y };",
  ].join("\n");
  const result = buildToolPresentation(
    msg("edit", { path: "src/foo.ts", ops: "PUT 2:\n+const y = 99;" }, { diff }),
  );
  const diffBlock = result.find((b) => b.kind === "diff");
  assert.ok(diffBlock, "expected a diff block");
  assert.ok(diffBlock.lines.some((l) => l.type === "add" && l.text.includes("99")));
  assert.ok(diffBlock.lines.some((l) => l.type === "del" && l.text.includes("2")));
});

test("edit: falls back to ops block when diff is absent", () => {
  const result = buildToolPresentation(
    msg("edit", { path: "src/bar.ts", ops: "PUT 1:\n+hello" }, {}),
  );
  assert.ok(result.some((b) => b.kind === "code" && b.role === "input" && b.text.includes("hello")));
});

test("edit: warnings from EditToolDetails shown as notices", () => {
  const result = buildToolPresentation(
    msg("edit", { path: "src/c.ts" }, { diff: "+hello", warnings: ["line endings changed"] }),
  );
  assert.ok(result.some((b) => b.kind === "note" && b.role === "notice" && b.text.includes("line endings")));
});

// ── lsp ───────────────────────────────────────────────────────────────────────

test("lsp: action and serverName shown as fields", () => {
  const result = buildToolPresentation(
    msg(
      "lsp",
      { action: "diagnostics", file: "src/a.ts" },
      { action: "diagnostics", serverName: "typescript-language-server", success: true },
      "0 errors",
    ),
  );
  const fields = result.find((b) => b.kind === "fields");
  assert.ok(fields, "expected a fields block");
  assert.ok(fields.rows.some((r) => r.label === "action" && r.value === "diagnostics"));
  assert.ok(fields.rows.some((r) => r.label === "server" && r.value.includes("typescript")));
});

test("lsp: envelope text rendered as output", () => {
  const result = buildToolPresentation(
    msg(
      "lsp",
      { action: "hover", file: "src/a.ts", line: 5 },
      { action: "hover", success: true },
      "string — the hover text",
    ),
  );
  assert.ok(result.some((b) => b.kind === "code" && b.role === "output" && b.text.includes("hover text")));
});

// ── todo ─────────────────────────────────────────────────────────────────────

test("todo: phases with tasks rendered as fields with status counts", () => {
  const result = buildToolPresentation(
    msg("todo", { op: "view" }, {
      op: "view",
      phases: [
        {
          name: "Foundation",
          tasks: [
            { content: "Write tests", status: "completed" },
            { content: "Add docs", status: "pending" },
            { content: "Deploy", status: "in_progress" },
          ],
        },
      ],
      storage: "session",
    }),
  );
  const fields = result.find((b) => b.kind === "fields");
  assert.ok(fields, "expected a fields block");
  const foundationRow = fields.rows.find((r) => r.label === "Foundation");
  assert.ok(foundationRow, "expected Foundation phase row");
  assert.ok(foundationRow.value.includes("✓ 1"), "should show 1 completed");
  assert.ok(foundationRow.value.includes("● 1"), "should show 1 in-progress");
  assert.ok(foundationRow.value.includes("○ 1"), "should show 1 pending");
});

test("todo: empty phases don't crash", () => {
  const result = buildToolPresentation(
    msg("todo", { op: "init" }, { op: "init", phases: [], storage: "session" }),
  );
  // No error; blocks may be empty or just error notice.
  assert.ok(Array.isArray(result));
});

// ── web_search ────────────────────────────────────────────────────────────────

test("web_search: envelope text rendered as output block", () => {
  const answer = "Paris is the capital of France.";
  const result = buildToolPresentation(
    msg("web_search", { query: "capital of France" }, { response: { answer, sources: [] } }, answer),
  );
  assert.ok(result.some((b) => b.kind === "code" && b.role === "output" && b.text.includes(answer)));
});

// ── parsePatchDiff edge cases ─────────────────────────────────────────────────

test("edit: pure context diff (no changes) yields no diff block", () => {
  const diff = " const x = 1;\n const y = 2;";
  const result = buildToolPresentation(msg("edit", {}, { diff }));
  assert.ok(!result.some((b) => b.kind === "diff"), "pure context diff should produce no diff block");
});

test("edit: diff copy string preserves +/- signs", () => {
  const diff = "-old line\n+new line";
  const result = buildToolPresentation(msg("edit", {}, { diff }));
  const diffBlock = result.find((b) => b.kind === "diff");
  assert.ok(diffBlock, "expected a diff block");
  assert.ok(diffBlock.copy.includes("-old line"), "copy should include del line with sign");
  assert.ok(diffBlock.copy.includes("+new line"), "copy should include add line with sign");
});
