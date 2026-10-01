/**
 * Boundary tests: extension spec validation and plugin list output parsing.
 * Run with: node --test test/extensions-mgmt.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { validateInstallSpec, parsePluginListOutput } = await import(
  "../electron/main/ipc/extensions-mgmt-ipc.ts"
);

// ── validateInstallSpec ────────────────────────────────────────────────────

describe("validateInstallSpec", () => {
  // valid specs
  it("accepts a plain npm package name", () => {
    assert.deepEqual(validateInstallSpec("my-package"), { valid: true });
  });
  it("accepts a scoped npm package", () => {
    assert.deepEqual(validateInstallSpec("@scope/my-extension"), { valid: true });
  });
  it("accepts a versioned npm spec", () => {
    assert.deepEqual(validateInstallSpec("my-package@1.2.3"), { valid: true });
  });
  it("accepts a scoped versioned spec", () => {
    assert.deepEqual(validateInstallSpec("@scope/my-extension@^2.0.0"), { valid: true });
  });
  it("accepts a github shorthand", () => {
    assert.deepEqual(validateInstallSpec("github:user/repo"), { valid: true });
  });
  it("accepts a user/repo shorthand", () => {
    assert.deepEqual(validateInstallSpec("user/repo"), { valid: true });
  });
  it("accepts an https git URL", () => {
    assert.deepEqual(validateInstallSpec("https://github.com/user/repo.git"), { valid: true });
  });

  // rejected: dangerous URI schemes
  it("rejects file:// URI scheme", () => {
    assert.equal(validateInstallSpec("file:///etc/passwd").valid, false);
  });
  it("rejects FILE:// (case-insensitive)", () => {
    assert.equal(validateInstallSpec("FILE:///etc/passwd").valid, false);
  });
  it("rejects git+file:// URI scheme", () => {
    assert.equal(validateInstallSpec("git+file:///home/user/.ssh/id_rsa").valid, false);
  });
  it("rejects svn+ URI scheme", () => {
    assert.equal(validateInstallSpec("svn+ssh://example.com/repo").valid, false);
  });
  it("rejects hg+ URI scheme", () => {
    assert.equal(validateInstallSpec("hg+https://example.com/repo").valid, false);
  });

  // rejected: paths
  it("rejects a dot path '.'", () => {
    assert.equal(validateInstallSpec(".").valid, false);
  });
  it("rejects a relative path './'", () => {
    assert.equal(validateInstallSpec("./my-plugin").valid, false);
  });
  it("rejects a parent relative path '../'", () => {
    assert.equal(validateInstallSpec("../etc/passwd").valid, false);
  });
  it("rejects an absolute UNIX path", () => {
    assert.equal(validateInstallSpec("/usr/local/lib/plugin").valid, false);
  });
  it("rejects a home-dir tilde path", () => {
    assert.equal(validateInstallSpec("~/plugins/foo").valid, false);
  });
  it("rejects a Windows absolute path", () => {
    assert.equal(validateInstallSpec("C:\\Users\\foo\\plugin").valid, false);
  });
  it("rejects a UNC path", () => {
    assert.equal(validateInstallSpec("\\\\server\\share\\plugin").valid, false);
  });

  // rejected: shell metacharacters
  it("rejects dollar sign", () => {
    assert.equal(validateInstallSpec("pkg$name").valid, false);
  });
  it("rejects backtick", () => {
    assert.equal(validateInstallSpec("pkg`name").valid, false);
  });
  it("rejects ampersand", () => {
    assert.equal(validateInstallSpec("pkg&name").valid, false);
  });
  it("rejects pipe", () => {
    assert.equal(validateInstallSpec("pkg|name").valid, false);
  });
  it("rejects semicolon", () => {
    assert.equal(validateInstallSpec("pkg;rm -rf /").valid, false);
  });
  it("rejects greater-than", () => {
    assert.equal(validateInstallSpec("pkg>file").valid, false);
  });
  it("rejects less-than", () => {
    assert.equal(validateInstallSpec("pkg<file").valid, false);
  });
  it("rejects open paren", () => {
    assert.equal(validateInstallSpec("pkg(").valid, false);
  });
  it("rejects close paren", () => {
    assert.equal(validateInstallSpec("pkg)name").valid, false);
  });
  it("rejects exclamation mark", () => {
    assert.equal(validateInstallSpec("pkg!name").valid, false);
  });
  it("rejects single quote", () => {
    assert.equal(validateInstallSpec("pkg'name").valid, false);
  });
  it("rejects double quote", () => {
    assert.equal(validateInstallSpec('pkg"name').valid, false);
  });
  it("rejects whitespace in middle", () => {
    assert.equal(validateInstallSpec("pkg name").valid, false);
  });
  it("rejects newline", () => {
    assert.equal(validateInstallSpec("pkg\nname").valid, false);
  });

  // edge cases
  it("rejects empty string", () => {
    assert.equal(validateInstallSpec("").valid, false);
  });
  it("rejects only whitespace", () => {
    assert.equal(validateInstallSpec("   ").valid, false);
  });
  it("rejects spec longer than 300 chars", () => {
    assert.equal(validateInstallSpec("a".repeat(301)).valid, false);
  });
  it("accepts spec exactly 300 chars", () => {
    assert.equal(validateInstallSpec("a".repeat(300)).valid, true);
  });
});

// ── parsePluginListOutput ──────────────────────────────────────────────────

describe("parsePluginListOutput", () => {
  it("returns empty array for invalid JSON", () => {
    assert.deepEqual(parsePluginListOutput("not json"), []);
  });

  it("returns empty array for empty object", () => {
    assert.deepEqual(parsePluginListOutput("{}"), []);
  });

  it("parses npm plugins", () => {
    const raw = JSON.stringify({
      npm: [
        { name: "my-plugin", version: "1.0.0", enabled: true, manifest: { description: "A plugin" } },
        { name: "disabled-plugin", version: "2.0.0", enabled: false, manifest: {} },
      ],
      marketplace: [],
    });
    const result = parsePluginListOutput(raw);
    assert.equal(result.length, 2);
    assert.deepEqual(result[0], { id: "my-plugin", name: "my-plugin", version: "1.0.0", source: "npm", enabled: true, description: "A plugin" });
    assert.deepEqual(result[1], { id: "disabled-plugin", name: "disabled-plugin", version: "2.0.0", source: "npm", enabled: false, description: undefined });
  });

  it("treats missing enabled as true", () => {
    const raw = JSON.stringify({ npm: [{ name: "p", version: "1.0.0", manifest: {} }] });
    const [entry] = parsePluginListOutput(raw);
    assert.equal(entry?.enabled, true);
  });

  it("skips npm entries without a name", () => {
    const raw = JSON.stringify({ npm: [{ version: "1.0.0", manifest: {} }] });
    assert.deepEqual(parsePluginListOutput(raw), []);
  });

  it("parses marketplace plugins", () => {
    const raw = JSON.stringify({
      npm: [],
      marketplace: [
        { id: "my-plugin@official", scope: "user", entries: [{ version: "3.0.0" }], shadowedBy: null },
        { id: "shadowed@official", scope: "user", entries: [{ version: "1.0.0" }], shadowedBy: "my-plugin@official" },
      ],
    });
    const result = parsePluginListOutput(raw);
    assert.equal(result.length, 2);
    assert.equal(result[0]?.source, "marketplace");
    assert.equal(result[0]?.enabled, true);
    assert.equal(result[0]?.version, "3.0.0");
    assert.equal(result[1]?.enabled, false); // shadowedBy present
  });

  it("skips marketplace entries without an id", () => {
    const raw = JSON.stringify({ marketplace: [{ scope: "user", entries: [] }] });
    assert.deepEqual(parsePluginListOutput(raw), []);
  });

  it("handles missing entries array gracefully", () => {
    const raw = JSON.stringify({
      marketplace: [{ id: "plugin@mkt", scope: "user" }],
    });
    const [entry] = parsePluginListOutput(raw);
    assert.equal(entry?.version, undefined);
    assert.equal(entry?.enabled, true);
  });
});
