import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { register } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

register(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "helpers/ts-import-hooks.mjs")));
const { memoryEnv, readMemoryConfig, validateMemoryConfig, writeMemoryConfig } = await import("../electron/main/memory-config.ts");

test("defaults to mnemopi when no file exists", () => {
  assert.deepEqual(readMemoryConfig(mkdtempSync(join(tmpdir(), "mem-"))), { backend: "mnemopi" });
});

test("hindsight requires an http(s) URL; unknown backend rejected", () => {
  assert.throws(() => validateMemoryConfig({ backend: "hindsight", hindsightUrl: "file:///x" }));
  assert.throws(() => validateMemoryConfig({ backend: "hindsight" }));
  assert.throws(() => validateMemoryConfig({ backend: "evil" }));
  assert.deepEqual(validateMemoryConfig({ backend: "hindsight", hindsightUrl: "http://h:8888", hindsightBank: " b " }), {
    backend: "hindsight",
    hindsightUrl: "http://h:8888",
    hindsightBank: "b",
  });
});

test("non-hindsight drops stale hindsight fields; round-trips via file", () => {
  const dir = mkdtempSync(join(tmpdir(), "mem-"));
  writeMemoryConfig(dir, validateMemoryConfig({ backend: "off", hindsightUrl: "http://x" }));
  assert.deepEqual(readMemoryConfig(dir), { backend: "off" });
});

test("token only reaches env for hindsight", () => {
  const h = { backend: "hindsight", hindsightUrl: "http://h" };
  assert.equal(memoryEnv(h, "tok").HINDSIGHT_API_TOKEN, "tok");
  assert.equal(memoryEnv({ backend: "mnemopi" }, "tok").HINDSIGHT_API_TOKEN, undefined);
});

test("hindsightLocal:true allows missing URL; sets flag on output", () => {
  // With hindsightLocal, URL is optional (supervisor injects localhost URL at runtime)
  assert.deepEqual(validateMemoryConfig({ backend: "hindsight", hindsightLocal: true }), {
    backend: "hindsight",
    hindsightLocal: true,
  });
  // URL is preserved when provided alongside hindsightLocal:true
  assert.deepEqual(validateMemoryConfig({ backend: "hindsight", hindsightLocal: true, hindsightUrl: "http://localhost:8888" }), {
    backend: "hindsight",
    hindsightLocal: true,
    hindsightUrl: "http://localhost:8888",
  });
  // Without hindsightLocal, URL is still required
  assert.throws(() => validateMemoryConfig({ backend: "hindsight" }));
});
