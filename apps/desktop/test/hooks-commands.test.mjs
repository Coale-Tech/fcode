/**
 * Unit tests for hooks-commands-ipc.ts: name/path validation and injection safety.
 * Run with: node --test test/hooks-commands.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { validateHookToolName, validateCommandName, assertInsideRoot } = await import(
  "../electron/main/ipc/hooks-commands-ipc.ts"
);

// ── validateHookToolName ──────────────────────────────────────────────────────

describe("validateHookToolName", () => {
  // Valid names
  it("accepts 'bash'", () => {
    assert.deepEqual(validateHookToolName("bash"), { valid: true });
  });
  it("accepts '*' wildcard", () => {
    assert.deepEqual(validateHookToolName("*"), { valid: true });
  });
  it("accepts 'my-tool_v2'", () => {
    assert.deepEqual(validateHookToolName("my-tool_v2"), { valid: true });
  });
  it("accepts 'edit'", () => {
    assert.deepEqual(validateHookToolName("edit"), { valid: true });
  });
  it("accepts name with dot: 'my.tool'", () => {
    assert.deepEqual(validateHookToolName("my.tool"), { valid: true });
  });

  // Rejected: empty
  it("rejects empty string", () => {
    assert.equal(validateHookToolName("").valid, false);
  });
  it("rejects whitespace only", () => {
    assert.equal(validateHookToolName("   ").valid, false);
  });

  // Rejected: path traversal / shell injection
  it("rejects forward slash (path traversal)", () => {
    assert.equal(validateHookToolName("../etc/passwd").valid, false);
  });
  it("rejects backslash", () => {
    assert.equal(validateHookToolName("foo\\bar").valid, false);
  });
  it("rejects semicolon", () => {
    assert.equal(validateHookToolName("bash;rm -rf /").valid, false);
  });
  it("rejects dollar sign", () => {
    assert.equal(validateHookToolName("$PATH").valid, false);
  });
  it("rejects backtick", () => {
    assert.equal(validateHookToolName("`cmd`").valid, false);
  });
  it("rejects pipe", () => {
    assert.equal(validateHookToolName("bash|cat").valid, false);
  });
  it("rejects space", () => {
    assert.equal(validateHookToolName("foo bar").valid, false);
  });
  it("rejects newline", () => {
    assert.equal(validateHookToolName("foo\nbar").valid, false);
  });

  // Edge: length limit
  it("rejects name over 200 chars", () => {
    assert.equal(validateHookToolName("a".repeat(201)).valid, false);
  });
  it("accepts name exactly 200 chars", () => {
    assert.equal(validateHookToolName("a".repeat(200)).valid, true);
  });
});

// ── validateCommandName ───────────────────────────────────────────────────────

describe("validateCommandName", () => {
  it("accepts 'my-cmd'", () => {
    assert.deepEqual(validateCommandName("my-cmd"), { valid: true });
  });
  it("accepts namespaced 'frappe/sync'", () => {
    assert.deepEqual(validateCommandName("frappe/sync"), { valid: true });
  });
  it("accepts 'a'", () => {
    assert.deepEqual(validateCommandName("a"), { valid: true });
  });
  it("accepts underscore: 'my_cmd'", () => {
    assert.deepEqual(validateCommandName("my_cmd"), { valid: true });
  });

  // Rejected: empty
  it("rejects empty string", () => {
    assert.equal(validateCommandName("").valid, false);
  });

  // Rejected: path traversal
  it("rejects '..'", () => {
    assert.equal(validateCommandName("..").valid, false);
  });
  it("rejects '../etc'", () => {
    assert.equal(validateCommandName("../etc").valid, false);
  });
  it("rejects leading slash", () => {
    assert.equal(validateCommandName("/absolute").valid, false);
  });
  it("rejects trailing slash", () => {
    assert.equal(validateCommandName("foo/").valid, false);
  });

  // Rejected: hostile characters
  it("rejects semicolon", () => {
    assert.equal(validateCommandName("foo;rm").valid, false);
  });
  it("rejects dollar sign", () => {
    assert.equal(validateCommandName("foo$bar").valid, false);
  });
  it("rejects space", () => {
    assert.equal(validateCommandName("foo bar").valid, false);
  });
  it("rejects backtick", () => {
    assert.equal(validateCommandName("`cmd`").valid, false);
  });

  // Length
  it("rejects name over 200 chars", () => {
    assert.equal(validateCommandName("a".repeat(201)).valid, false);
  });
  it("accepts name exactly 200 chars", () => {
    assert.equal(validateCommandName("a".repeat(200)).valid, true);
  });
});

// ── assertInsideRoot ──────────────────────────────────────────────────────────

describe("assertInsideRoot", () => {
  it("allows a file inside the root", () => {
    assert.doesNotThrow(() => assertInsideRoot("/tmp/omp/hooks/pre/bash.sh", "/tmp/omp"));
  });
  it("allows nested path", () => {
    assert.doesNotThrow(() => assertInsideRoot("/tmp/omp/hooks/pre/deeply/nested.sh", "/tmp/omp"));
  });

  it("rejects path outside root", () => {
    assert.throws(() => assertInsideRoot("/etc/passwd", "/tmp/omp"), { message: /outside/ });
  });
  it("rejects path traversal via ../..", () => {
    // resolve() collapses traversal before the check
    assert.throws(() => assertInsideRoot("/tmp/omp/../../../etc/passwd", "/tmp/omp"), { message: /outside/ });
  });
  it("rejects sibling path", () => {
    assert.throws(() => assertInsideRoot("/tmp/other/file.sh", "/tmp/omp"), { message: /outside/ });
  });
  it("rejects path that is a prefix but not a child (e.g. /tmp/omp2)", () => {
    // /tmp/omp2 is not inside /tmp/omp even though it starts with /tmp/omp
    assert.throws(() => assertInsideRoot("/tmp/omp2/file.sh", "/tmp/omp"), { message: /outside/ });
  });
});

// ── ompCommandRead path guard (via validateCommandName + assertInsideRoot) ────
// The read handler is identical guard logic to edit/delete; tested here at the
// unit level since it uses the same exported validators.

describe("ompCommandRead name guard", () => {
  it("valid command name passes validateCommandName", () => {
    assert.deepEqual(validateCommandName("my-cmd"), { valid: true });
  });
  it("traversal name '../etc' rejected by validateCommandName", () => {
    assert.equal(validateCommandName("../etc").valid, false);
  });
  it("path traversal via assertInsideRoot rejected for commands dir", () => {
    // reconstructed path would escape the dir
    assert.throws(
      () => assertInsideRoot("/tmp/cmds/../../../etc/passwd", "/tmp/cmds"),
      { message: /outside/ },
    );
  });
  it("name with dot-dot rejected", () => {
    assert.equal(validateCommandName("..").valid, false);
  });
});
