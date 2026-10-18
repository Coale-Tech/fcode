/**
 * Boundary tests for the omp CLI runner (slice F).
 *
 * Tests: allowlist enforcement (unknown subcommand rejected, hostile args not
 * shell-interpreted), per-command arg building.
 *
 * Run with: node --test test/omp-cli.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { validateOmpCliArgs, OMP_CLI_SPEC_RECORD, OMP_CLI_SPECS } = await import(
  "../electron/main/omp-cli.ts"
);

// ── validateOmpCliArgs ─────────────────────────────────────────────────────────

describe("validateOmpCliArgs — allowlist enforcement", () => {
  it("rejects an unknown subcommand", () => {
    const err = validateOmpCliArgs("commit", []);
    assert.ok(err !== null, "should return an error string");
    assert.ok(err.includes("not allowlisted"), `got: ${err}`);
  });

  it("rejects shell-injection subcommand", () => {
    const err = validateOmpCliArgs("stats; rm -rf /", []);
    assert.ok(err !== null);
    assert.ok(err.includes("not allowlisted"));
  });

  it("rejects null byte in arg", () => {
    const err = validateOmpCliArgs("stats", ["--summary\x00malicious"]);
    assert.ok(err !== null);
    assert.ok(err.includes("unsafe characters"));
  });

  it("rejects newline in arg (shell-newline injection)", () => {
    const err = validateOmpCliArgs("stats", ["--summary\nrm -rf /"]);
    assert.ok(err !== null);
    assert.ok(err.includes("unsafe characters"));
  });

  it("rejects an unallowed flag for stats", () => {
    const err = validateOmpCliArgs("stats", ["--apply"]);
    assert.ok(err !== null, "should reject --apply for stats");
    assert.ok(err.includes("flag not allowed"));
  });

  it("accepts --summary for stats", () => {
    assert.equal(validateOmpCliArgs("stats", ["--summary"]), null);
  });

  it("accepts --json for stats", () => {
    assert.equal(validateOmpCliArgs("stats", ["--json"]), null);
  });

  it("accepts --apply for gc", () => {
    assert.equal(validateOmpCliArgs("gc", ["--apply"]), null);
  });

  it("rejects --apply for usage", () => {
    const err = validateOmpCliArgs("usage", ["--apply"]);
    assert.ok(err !== null);
    assert.ok(err.includes("flag not allowed"));
  });

  it("accepts --provider=anthropic for usage", () => {
    assert.equal(validateOmpCliArgs("usage", ["--provider=anthropic"]), null);
  });

  it("rejects --provider=ant; rm for usage (special chars after =)", () => {
    const err = validateOmpCliArgs("usage", ["--provider=ant; rm"]);
    // Either 'unsafe characters' (newline/null) or 'flag not allowed' (pattern mismatch)
    // In this case spaces are allowed by SAFE_ARG_RE but the flag pattern rejects it.
    assert.ok(err !== null, "should reject the arg");
  });

  it("accepts all wired subcommands with empty args", () => {
    const subcommands = [
      "stats", "usage", "gc", "models", "ps",
      "worktree", "tiny-models", "toks", "config", "web-search",
    ];
    for (const cmd of subcommands) {
      assert.equal(
        validateOmpCliArgs(cmd, []),
        null,
        `${cmd} with no args should be valid`,
      );
    }
  });

  it("rejects dangerous subcommands that could escalate", () => {
    const dangerous = [
      "commit", "shell", "login", "auth-broker", "install",
      "plugin", "update", "setup", "git",
    ];
    for (const cmd of dangerous) {
      assert.ok(
        validateOmpCliArgs(cmd, []) !== null,
        `${cmd} should be rejected`,
      );
    }
  });
});

// ── OMP_CLI_SPEC_RECORD coverage ───────────────────────────────────────────────

describe("OMP_CLI_SPEC_RECORD — static lookup", () => {
  it("has an entry for every subcommand in OMP_CLI_SPECS", () => {
    for (const spec of OMP_CLI_SPECS) {
      assert.ok(
        spec.subcommand in OMP_CLI_SPEC_RECORD,
        `${spec.subcommand} must be in OMP_CLI_SPEC_RECORD`,
      );
    }
  });

  it("fixedArgs do not start with a subcommand name (no accidental command injection)", () => {
    for (const spec of OMP_CLI_SPECS) {
      for (const arg of spec.fixedArgs) {
        assert.ok(
          !(arg in OMP_CLI_SPEC_RECORD),
          `fixed arg ${arg} in ${spec.subcommand} looks like a subcommand — injection risk`,
        );
      }
    }
  });
});

// ── buildArgs per command ──────────────────────────────────────────────────────

describe("buildArgs — correct argv construction", () => {
  it("stats: format=json → ['--json']", () => {
    const spec = OMP_CLI_SPEC_RECORD["stats"];
    assert.deepEqual(spec.buildArgs({ format: "json" }), ["--json"]);
  });

  it("stats: format=summary → ['--summary']", () => {
    const spec = OMP_CLI_SPEC_RECORD["stats"];
    assert.deepEqual(spec.buildArgs({ format: "summary" }), ["--summary"]);
  });

  it("usage: provider empty → []", () => {
    const spec = OMP_CLI_SPEC_RECORD["usage"];
    assert.deepEqual(spec.buildArgs({ provider: "" }), []);
  });

  it("usage: provider=anthropic → ['--provider=anthropic']", () => {
    const spec = OMP_CLI_SPEC_RECORD["usage"];
    assert.deepEqual(spec.buildArgs({ provider: "anthropic" }), ["--provider=anthropic"]);
  });

  it("gc: apply=false → []", () => {
    const spec = OMP_CLI_SPEC_RECORD["gc"];
    assert.deepEqual(spec.buildArgs({ apply: false }), []);
  });

  it("gc: apply=true → ['--apply']", () => {
    const spec = OMP_CLI_SPEC_RECORD["gc"];
    assert.deepEqual(spec.buildArgs({ apply: true }), ["--apply"]);
  });

  it("models: action=ls kind=chat → []  (defaults not emitted)", () => {
    const spec = OMP_CLI_SPEC_RECORD["models"];
    assert.deepEqual(spec.buildArgs({ action: "ls", kind: "chat" }), []);
  });

  it("models: action=refresh kind=all → ['refresh', '--kind=all']", () => {
    const spec = OMP_CLI_SPEC_RECORD["models"];
    assert.deepEqual(spec.buildArgs({ action: "refresh", kind: "all" }), ["refresh", "--kind=all"]);
  });

  it("ps: all=false → []", () => {
    const spec = OMP_CLI_SPEC_RECORD["ps"];
    assert.deepEqual(spec.buildArgs({ all: false }), []);
  });

  it("ps: all=true → ['--all']", () => {
    const spec = OMP_CLI_SPEC_RECORD["ps"];
    assert.deepEqual(spec.buildArgs({ all: true }), ["--all"]);
  });

  it("toks: input='hello world' → ['hello world']", () => {
    const spec = OMP_CLI_SPEC_RECORD["toks"];
    assert.deepEqual(spec.buildArgs({ input: "hello world" }), ["hello world"]);
  });

  it("toks: empty input → []", () => {
    const spec = OMP_CLI_SPEC_RECORD["toks"];
    assert.deepEqual(spec.buildArgs({ input: "" }), []);
  });

  it("config: action=list → ['list']", () => {
    const spec = OMP_CLI_SPEC_RECORD["config"];
    assert.deepEqual(spec.buildArgs({ action: "list", key: "" }), ["list"]);
  });

  it("config: action=get key=retry.maxRetries → ['get', 'retry.maxRetries']", () => {
    const spec = OMP_CLI_SPEC_RECORD["config"];
    assert.deepEqual(
      spec.buildArgs({ action: "get", key: "retry.maxRetries" }),
      ["get", "retry.maxRetries"],
    );
  });

  it("web-search: query splits on whitespace → multiple args", () => {
    const spec = OMP_CLI_SPEC_RECORD["web-search"];
    assert.deepEqual(
      spec.buildArgs({ query: "hello world test" }),
      ["hello", "world", "test"],
    );
  });
});
