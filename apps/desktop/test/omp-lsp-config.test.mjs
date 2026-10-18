import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { listLspServers, removeLspServer, resolveCommand, saveLspServer } = await import("../electron/main/omp-lsp-config.ts");

const dir = mkdtempSync(join(tmpdir(), "lsp-cfg-"));
const file = () => join(dir, `lsp-${Math.random().toString(36).slice(2)}.json`);
const read = (f) => JSON.parse(readFileSync(f, "utf8"));
test.after(() => rmSync(dir, { recursive: true, force: true }));

const bin = join(dir, "bin");
mkdirSync(bin);
writeFileSync(join(bin, "fake-ls"), "");
chmodSync(join(bin, "fake-ls"), 0o755);
writeFileSync(join(bin, "not-exec"), "");
chmodSync(join(bin, "not-exec"), 0o644);

test("resolveCommand finds an executable on PATH or by absolute path, never a directory or non-executable", { skip: process.platform === "win32" }, () => {
  assert.equal(resolveCommand("fake-ls", bin, false), join(bin, "fake-ls"));
  assert.equal(resolveCommand(join(bin, "fake-ls"), "", false), join(bin, "fake-ls"));
  assert.equal(resolveCommand("not-exec", bin, false), null);
  assert.equal(resolveCommand("bin", dir, false), null);
  assert.equal(resolveCommand("absent", bin, false), null);
});

test("a new server needs command and file types; extensions get a dot and rootMarkers default to '.'", () => {
  const f = file();
  assert.match(saveLspServer({ name: "mine", fileTypes: [".x"] }, f).error, /command/);
  assert.match(saveLspServer({ name: "mine", command: "mine-ls" }, f).error, /file type/);
  assert.match(saveLspServer({ name: "bad name!", command: "c", fileTypes: [".x"] }, f).error, /name/);
  assert.deepEqual(saveLspServer({ name: "mine", command: "mine-ls", args: ["--stdio"], fileTypes: ["xyz", ".abc"] }, f), { ok: true });
  assert.deepEqual(read(f).servers.mine, { command: "mine-ls", args: ["--stdio"], fileTypes: [".xyz", ".abc"], rootMarkers: ["."] });
});

test("overriding a built-in needs no command; other servers and idleTimeoutMs survive; flat files are rewrapped", () => {
  const f = file();
  writeFileSync(f, JSON.stringify({ other: { command: "o", fileTypes: [".o"], rootMarkers: ["."] }, idleTimeoutMs: 5000 }));
  assert.deepEqual(saveLspServer({ name: "ruff", disabled: true }, f), { ok: true });
  const out = read(f);
  assert.deepEqual(out.servers.ruff, { disabled: true });
  assert.equal(out.servers.other.command, "o");
  assert.equal(out.idleTimeoutMs, 5000);
  assert.deepEqual(removeLspServer("ruff", f), { ok: true });
  assert.equal("ruff" in read(f).servers, false);
  assert.equal(read(f).servers.other.command, "o");
});

test("unreadable lsp.json is reported and never overwritten", () => {
  const f = file();
  writeFileSync(f, "{ not json");
  assert.equal(saveLspServer({ name: "mine", command: "c", fileTypes: [".x"] }, f).ok, false);
  assert.equal(removeLspServer("mine", f).ok, false);
  assert.equal(readFileSync(f, "utf8"), "{ not json");
  assert.ok(listLspServers(f, undefined, { PATH: "" }).error);
});

test("list merges built-ins with the user's file: custom first, resolved flag, bundled flag, disabled", { skip: process.platform === "win32" }, () => {
  const f = file();
  const tools = join(dir, "tools");
  mkdirSync(tools);
  writeFileSync(join(tools, "ruff"), "");
  chmodSync(join(tools, "ruff"), 0o755);
  saveLspServer({ name: "mine", command: "fake-ls", fileTypes: [".x"] }, f);
  saveLspServer({ name: "clangd", disabled: true }, f);
  const { servers } = listLspServers(f, tools, { PATH: `${bin}:${tools}` });
  const by = Object.fromEntries(servers.map((s) => [s.name, s]));
  assert.equal(by.mine.resolved, join(bin, "fake-ls"));
  assert.equal(by.mine.custom && !by.mine.builtin, true);
  assert.equal(by.ruff.bundled && by.ruff.isLinter && by.ruff.builtin && !by.ruff.custom, true);
  assert.equal(by.clangd.disabled && by.clangd.custom, true);
  assert.equal(by["rust-analyzer"].resolved, null);
  assert.ok(servers.findIndex((s) => s.name === "mine") < servers.findIndex((s) => s.name === "ruff"));
  assert.ok(servers.findIndex((s) => s.name === "ruff") < servers.findIndex((s) => s.name === "rust-analyzer"));
});

test("the Add server form's payload for a command-only built-in override never writes args, so omp keeps the built-in's own", async () => {
  const { lspSavePayload } = await import("../src/features/settings/lsp-form.ts");
  const f = file();
  const payload = lspSavePayload({ name: "ruff", command: "/opt/ruff/bin/ruff", args: "  ", fileTypes: "" });
  assert.deepEqual(payload, { name: "ruff", command: "/opt/ruff/bin/ruff" });
  assert.deepEqual(saveLspServer(payload, f), { ok: true });
  assert.deepEqual(read(f).servers.ruff, { command: "/opt/ruff/bin/ruff" });
  // Given values still go through, split on spaces / commas.
  assert.deepEqual(lspSavePayload({ name: "mine", command: "c", args: "--stdio  -v", fileTypes: "xyz, .abc" }), {
    name: "mine", command: "c", args: ["--stdio", "-v"], fileTypes: ["xyz", ".abc"],
  });
});
