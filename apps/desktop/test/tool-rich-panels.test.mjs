import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));
const { buildToolPresentation } = await import("../src/lib/tool-presentation.ts");

/** Wraps details in the standard pi-ai envelope with a text content mirror. */
function envelope(details, extraContentText) {
  const content = [{ type: "text", text: extraContentText ?? JSON.stringify(details) }];
  return { content, details };
}

/** Makes an envelope whose text content differs from details (for raw-text extraction). */
function envelopeWithText(details, text) {
  return { content: [{ type: "text", text }], details };
}

const roles = (blocks) => blocks.map((b) => b.role);
const byRole = (blocks, role) => blocks.find((b) => b.role === role);
const byKind = (blocks, kind) => blocks.filter((b) => b.kind === kind);

// ---------------------------------------------------------------------------
// eval tool
// ---------------------------------------------------------------------------

test("eval renders each cell as code block then output block", () => {
  const details = {
    cells: [
      { index: 0, code: "print('hello')", output: "hello", language: "python", status: "complete" },
      { index: 1, code: "1 + 1", output: "2", language: "python", status: "complete" },
    ],
  };
  const blocks = buildToolPresentation({ toolName: "eval", toolResult: envelope(details) });
  // 2 cells × (input + output) = 4 blocks
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].role, "input");
  assert.equal(blocks[0].lang, "python");
  assert.equal(blocks[0].text, "print('hello')");
  assert.equal(blocks[1].role, "output");
  assert.equal(blocks[1].text, "hello");
});

test("eval JS cells get javascript lang tag", () => {
  const details = {
    cells: [{ index: 0, code: "console.log(1)", output: "1", language: "js", status: "complete" }],
  };
  const blocks = buildToolPresentation({ toolName: "eval", toolResult: envelope(details) });
  assert.equal(blocks[0].lang, "javascript");
});

test("eval error cell marks output block as stderr with error tone", () => {
  const details = {
    cells: [{ index: 0, code: "bad()", output: "NameError: bad", language: "python", status: "error" }],
  };
  const blocks = buildToolPresentation({ toolName: "eval", toolResult: envelope(details) });
  const output = byRole(blocks, "stderr");
  assert.ok(output, "stderr block present for error cell");
  assert.equal(output.tone, "error");
});

test("eval with empty cells falls back to generic details rendering", () => {
  const details = { cells: [], isError: false };
  const blocks = buildToolPresentation({ toolName: "eval", toolResult: envelope(details) });
  // No cells → generic fallback shows details fields or empty
  // The key requirement: does not crash and does not produce input/output pair
  assert.ok(
    !blocks.some((b) => b.role === "input" && b.lang === "python"),
    "no phantom code blocks for empty cells",
  );
});

test("eval cell with missing output field does not crash", () => {
  const details = { cells: [{ index: 0, code: "x = 1", language: "python", status: "running" }] };
  const blocks = buildToolPresentation({ toolName: "eval", toolResult: envelope(details) });
  // Only the input code block; no output (undefined → falsy)
  const inputBlocks = blocks.filter((b) => b.role === "input");
  assert.equal(inputBlocks.length, 1);
  assert.equal(inputBlocks[0].text, "x = 1");
});

test("eval cell with missing code field omits the code block", () => {
  const details = { cells: [{ index: 0, output: "result", language: "python", status: "complete" }] };
  const blocks = buildToolPresentation({ toolName: "eval", toolResult: envelope(details) });
  // No code → no input block; output still rendered
  assert.equal(byRole(blocks, "input"), undefined);
  assert.ok(byRole(blocks, "output"), "output block present");
});

test("eval large output is kept as a block (no silent drop)", () => {
  const bigOutput = "x".repeat(200_000);
  const details = { cells: [{ index: 0, code: "run()", output: bigOutput, language: "python", status: "complete" }] };
  const blocks = buildToolPresentation({ toolName: "eval", toolResult: envelope(details) });
  const out = byRole(blocks, "output");
  assert.ok(out, "output block present for large output");
  assert.equal(out.text, bigOutput); // no truncation at this layer
});

// ---------------------------------------------------------------------------
// browser tool
// ---------------------------------------------------------------------------

test("browser open shows URL as fields block", () => {
  const details = { action: "open", name: "main", url: "https://example.com" };
  const blocks = buildToolPresentation({ toolName: "browser", toolResult: envelope(details) });
  const fields = byRole(blocks, "details");
  assert.ok(fields, "details fields block for URL");
  assert.ok(fields.rows.some((r) => r.label === "URL" && r.value === "https://example.com"));
});

test("browser run shows text output from envelope content", () => {
  const details = { action: "run", name: "main", url: "https://example.com" };
  const text = "page title: Example";
  const blocks = buildToolPresentation({
    toolName: "browser",
    toolResult: envelopeWithText(details, text),
  });
  const out = byRole(blocks, "output");
  assert.ok(out, "output block from envelope content");
  assert.equal(out.text, text);
});

test("browser with no URL still renders without crashing", () => {
  const details = { action: "close", name: "main" };
  const blocks = buildToolPresentation({ toolName: "browser", toolResult: envelope(details) });
  // URL absent → no fields block; but no crash; mapped=true so no args fallback
  assert.ok(Array.isArray(blocks));
});

test("browser with no text content produces empty body (mapped, no args)", () => {
  const details = { action: "open", name: "main" };
  // envelope text is `JSON.stringify(details)` — the default helper puts it there,
  // but the real tool puts a human-readable string. Use empty text to simulate
  // a run with no display() output.
  const blocks = buildToolPresentation({
    toolName: "browser",
    toolResult: { content: [], details },
  });
  // No URL, no content text → empty body (mapped, no fallback dump of args)
  const out = byRole(blocks, "output");
  assert.equal(out, undefined);
});

// ---------------------------------------------------------------------------
// computer tool
// ---------------------------------------------------------------------------

test("computer shows text output from envelope content", () => {
  const details = { screenshots: [], value: undefined };
  const text = "window focused";
  const blocks = buildToolPresentation({
    toolName: "computer",
    toolResult: envelopeWithText(details, text),
  });
  const out = byRole(blocks, "output");
  assert.ok(out, "output block");
  assert.equal(out.text, text);
});

test("computer with no text output is empty but does not crash", () => {
  const details = { screenshots: [] };
  const blocks = buildToolPresentation({
    toolName: "computer",
    toolResult: { content: [], details },
  });
  assert.ok(Array.isArray(blocks));
  assert.equal(byRole(blocks, "output"), undefined);
});

test("computer non-image content items do not appear as blocks", () => {
  // Only text items from content[] are extracted; image items are handled by
  // ToolScreenshots component in React, not here in the parser.
  const details = { screenshots: [{ path: "/tmp/shot.png", width: 1920, height: 1080 }] };
  const blocks = buildToolPresentation({
    toolName: "computer",
    toolResult: { content: [{ type: "image", data: "abc", mimeType: "image/png" }], details },
  });
  // Images in content are not text blocks — no output block produced
  const out = byRole(blocks, "output");
  assert.equal(out, undefined, "image-only content does not produce an output block");
});

// ---------------------------------------------------------------------------
// ida tool
// ---------------------------------------------------------------------------

test("ida exec shows action+db fields and output text", () => {
  const details = { action: "exec", db: "firmware.i64" };
  const execOutput = "Python 3.11: result = 42";
  const blocks = buildToolPresentation({
    toolName: "ida",
    toolResult: envelopeWithText(details, execOutput),
  });
  const fields = byRole(blocks, "details");
  assert.ok(fields, "details fields block");
  assert.ok(fields.rows.some((r) => r.label === "action" && r.value === "exec"));
  assert.ok(fields.rows.some((r) => r.label === "db" && r.value === "firmware.i64"));
  const out = byRole(blocks, "output");
  assert.ok(out, "output block");
  assert.equal(out.text, execOutput);
});

test("ida list action without db renders only action field", () => {
  const details = { action: "list" };
  const blocks = buildToolPresentation({
    toolName: "ida",
    toolResult: { content: [{ type: "text", text: "db1.i64\ndb2.i64" }], details },
  });
  const fields = byRole(blocks, "details");
  assert.ok(fields, "details block");
  assert.equal(fields.rows.length, 1);
  assert.equal(fields.rows[0].label, "action");
});

test("ida with no action produces no fields block", () => {
  const details = {};
  const blocks = buildToolPresentation({
    toolName: "ida",
    toolResult: { content: [{ type: "text", text: "ok" }], details },
  });
  const fields = byRole(blocks, "details");
  assert.equal(fields, undefined, "no fields block when action absent");
});

// ---------------------------------------------------------------------------
// unknown tool names still use existing action dispatch
// ---------------------------------------------------------------------------

test("unknown tool name falls through to existing action-based dispatch", () => {
  // A custom tool named 'MyBash' normalizes to 'mybash' which hits the 'run'
  // action branch — existing behaviour untouched.
  const blocks = buildToolPresentation({
    toolName: "MyBash",
    toolArgs: { command: "ls" },
    toolResult: { content: [{ type: "text", text: "file.txt" }], details: { stdout: "file.txt" } },
  });
  assert.ok(byRole(blocks, "stdout"), "stdout block for run action");
});
