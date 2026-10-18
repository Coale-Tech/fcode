/**
 * Unit tests for omp-acp.ts pure helpers (Slice I).
 * Imports the real exported functions — not inline copies.
 *
 * Run with: node --test test/omp-acp.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, writeFile, utimes, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { register } from "node:module";
import { dirname, join as pathJoin } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(pathJoin(here, "helpers/ts-import-hooks.mjs")));

const { shellQuote, buildTuiScriptContent, sweepStaleTuiScripts, buildAcpInfo } =
  await import("../electron/main/ipc/omp-acp.ts");

// ── shellQuote ────────────────────────────────────────────────────────────────

describe("shellQuote", () => {
  it("wraps a plain value in single quotes", () => {
    assert.equal(shellQuote("hello"), "'hello'");
  });

  it("escapes an embedded single quote", () => {
    assert.equal(shellQuote("it's"), "'it'\\''s'");
  });

  it("does not expand $() (command substitution stays literal)", () => {
    const q = shellQuote("$(rm -rf /)");
    assert.ok(q.startsWith("'") && q.endsWith("'"), "must be single-quoted");
    // Inside single quotes $(...) is never executed by sh
    assert.ok(!q.includes('"'), "no double quotes must leak");
  });

  it("preserves newlines literally inside single quotes", () => {
    const q = shellQuote("line1\nline2");
    assert.ok(q.includes("\n"), "newline must be inside the quoted string");
    assert.ok(q.startsWith("'"), "must be single-quoted");
  });

  it("handles a value consisting only of single quotes", () => {
    // "'''" → every quote escaped
    const q = shellQuote("'''");
    // The shell will interpret this as the empty-string concatenation of
    // '' + \' + '' + \' + '' + \' + '' → "'''"
    assert.ok(q.length > 0);
    assert.ok(!q.match(/[^'\\]/), "only single-quotes and backslashes");
  });

  it("empty string → two single quotes", () => {
    assert.equal(shellQuote(""), "''");
  });
});

// ── buildTuiScriptContent ──────────────────────────────────────────────────────

describe("buildTuiScriptContent", () => {
  const bin = "/usr/local/bin/omp";
  const sessDir = "/home/user/.fcode/omp-threads/abc123";
  const overlay = "/home/user/.fcode/omp-overlay.yml";

  it("starts with POSIX shebang on the first line", () => {
    const script = buildTuiScriptContent(bin, sessDir, overlay, {});
    assert.equal(script.split("\n")[0], "#!/bin/sh");
  });

  it("self-delete line appears before any export line", () => {
    const env = { MY_SECRET: "s3cr3t" };
    const lines = buildTuiScriptContent(bin, sessDir, overlay, env).split("\n");
    const rmIdx = lines.findIndex((l) => l.includes("rm -f"));
    const exportIdx = lines.findIndex((l) => l.startsWith("export "));
    assert.ok(rmIdx !== -1, "rm -f line must exist");
    assert.ok(exportIdx !== -1, "export line must exist");
    assert.ok(rmIdx < exportIdx, "self-delete must precede env exports");
  });

  it("exec line carries --session-dir with the session path", () => {
    const script = buildTuiScriptContent(bin, sessDir, overlay, {});
    assert.ok(script.includes(`--session-dir '${sessDir}'`));
  });

  it("exec line carries --config with the overlay path", () => {
    const script = buildTuiScriptContent(bin, sessDir, overlay, {});
    assert.ok(script.includes(`--config '${overlay}'`));
  });

  it("exec line carries the binary path", () => {
    const script = buildTuiScriptContent(bin, sessDir, overlay, {});
    assert.ok(script.includes(`'${bin}'`));
  });

  it("env var with single quote is safely escaped in the script", () => {
    const script = buildTuiScriptContent(bin, sessDir, overlay, { TOKEN: "it's" });
    assert.ok(script.includes("export TOKEN='it'\\''s'"));
  });

  it("env var with $() is inside single quotes (not expanded)", () => {
    const script = buildTuiScriptContent(bin, sessDir, overlay, { EVIL: "$(id)" });
    // Whole value is wrapped in single quotes, so $() is inert
    assert.ok(script.includes("export EVIL='$(id)'"));
  });

  it("env var with newline is inside single quotes", () => {
    const script = buildTuiScriptContent(bin, sessDir, overlay, { NL: "a\nb" });
    assert.ok(script.includes("export NL='a\nb'"));
  });

  it("produces no export lines when env is empty", () => {
    const lines = buildTuiScriptContent(bin, sessDir, overlay, {}).split("\n");
    assert.ok(!lines.some((l) => l.startsWith("export ")));
  });
});

// ── sweepStaleTuiScripts ──────────────────────────────────────────────────────

describe("sweepStaleTuiScripts", () => {
  it("removes omp-tui-*.sh files older than 24 h", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omp-acp-test-"));
    const stale = join(dir, "omp-tui-1234567890.sh");
    await writeFile(stale, "#!/bin/sh\n");
    // backdate mtime by 25 h
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await utimes(stale, old, old);

    await sweepStaleTuiScripts(dir);

    const remaining = await readdir(dir);
    assert.ok(!remaining.includes("omp-tui-1234567890.sh"), "stale script must be deleted");
  });

  it("keeps omp-tui-*.sh files younger than 24 h", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omp-acp-test-"));
    const fresh = join(dir, "omp-tui-9999999999.sh");
    await writeFile(fresh, "#!/bin/sh\n");

    await sweepStaleTuiScripts(dir);

    const remaining = await readdir(dir);
    assert.ok(remaining.includes("omp-tui-9999999999.sh"), "fresh script must be kept");
  });

  it("ignores files with non-matching names", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omp-acp-test-"));
    const other = join(dir, "omp-overlay.yml");
    await writeFile(other, "model: default\n");
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(other, old, old);

    await sweepStaleTuiScripts(dir);

    const remaining = await readdir(dir);
    assert.ok(remaining.includes("omp-overlay.yml"), "non-matching file must be untouched");
  });

  it("silently succeeds when dataDir does not exist", async () => {
    await assert.doesNotReject(sweepStaleTuiScripts("/nonexistent/path/xyz"));
  });
});

// ── buildAcpInfo ──────────────────────────────────────────────────────────────

describe("buildAcpInfo", () => {
  const bin = "/usr/local/bin/omp";
  const overlay = "/home/user/.fcode/omp-overlay.yml";

  it("zedSnippet is valid JSON", () => {
    const { zedSnippet } = buildAcpInfo(bin, overlay);
    assert.doesNotThrow(() => JSON.parse(zedSnippet));
  });

  it("jetbrainsSnippet is valid JSON", () => {
    const { jetbrainsSnippet } = buildAcpInfo(bin, overlay);
    assert.doesNotThrow(() => JSON.parse(jetbrainsSnippet));
  });

  it("zedSnippet contains binary path and overlay in args", () => {
    const { zedSnippet } = buildAcpInfo(bin, overlay);
    const parsed = JSON.parse(zedSnippet);
    const entry = parsed.omp;
    assert.equal(entry.command, bin);
    assert.ok(entry.args.includes("--config"), "must have --config flag");
    assert.ok(entry.args.includes(overlay), "must include overlay path");
  });

  it("jetbrainsSnippet contains binary path and overlay in args", () => {
    const { jetbrainsSnippet } = buildAcpInfo(bin, overlay);
    const parsed = JSON.parse(jetbrainsSnippet);
    assert.equal(parsed.command, bin);
    assert.ok(parsed.args.includes(overlay), "must include overlay path");
  });

  it("command field is a plain display string (not shell-quoted)", () => {
    const { command } = buildAcpInfo(bin, overlay);
    // Must be human-readable; no single-quote escaping of the plain paths
    assert.ok(!command.startsWith("'"), "command must not be shell-quoted");
    assert.ok(command.includes(bin), "command must contain binary");
    assert.ok(command.includes(overlay), "command must contain overlay");
  });
});
