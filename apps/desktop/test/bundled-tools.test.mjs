import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { bundledToolsDir, withBundledTools } = await import("../electron/main/omp-binary.ts");

const exe = process.platform === "win32" ? "ruff.exe" : "ruff";
const touch = (dir) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, exe), "");
  chmodSync(join(dir, exe), 0o755);
};

test("bundled tools are appended, so the user's own binary still wins", () => {
  const env = withBundledTools({ PATH: `/usr/bin${delimiter}/opt/homebrew/bin`, HOME: "/h" }, "/app/tools", false);
  assert.equal(env.PATH, ["/usr/bin", "/opt/homebrew/bin", "/app/tools"].join(delimiter));
  assert.equal(env.HOME, "/h");
});

test("a minimal Dock PATH still gets the bundled dir; an empty PATH is not left with a leading separator", () => {
  assert.equal(withBundledTools({}, "/app/tools", false).PATH, "/app/tools");
});

test("the dir is not added twice", () => {
  const env = withBundledTools({ PATH: `/app/tools${delimiter}/usr/bin` }, "/app/tools", false);
  assert.equal(env.PATH, `/app/tools${delimiter}/usr/bin`);
});

test("Windows keeps its existing Path key instead of adding a second PATH", () => {
  const env = withBundledTools({ Path: "/win" }, "/app/tools", true);
  assert.deepEqual(Object.keys(env), ["Path"]);
  assert.equal(env.Path, ["/win", "/app/tools"].join(delimiter));
});

test("no bundled tools dir leaves the env untouched", () => {
  const env = { PATH: "/usr/bin" };
  assert.equal(withBundledTools(env, undefined, false), env);
});

test("bundledToolsDir finds the packaged tools/ dir and the dev per-target dir, else undefined", () => {
  const root = mkdtempSync(join(tmpdir(), "bundled-tools-"));
  try {
    assert.equal(bundledToolsDir(root), undefined);
    const dev = join(root, "tools", `${process.platform}-${process.arch}`);
    touch(dev);
    assert.equal(bundledToolsDir(root), dev);
    touch(join(root, "tools"));
    assert.equal(bundledToolsDir(root), join(root, "tools"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
