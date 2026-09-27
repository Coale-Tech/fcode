/**
 * Tests for SessionStore (E14, E19).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionStore } from "./sessions.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "omp-sessions-test-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("SessionStore", () => {
  it("starts empty when the file does not exist (E14)", () => {
    const store = new SessionStore(dir);
    expect(store.get("unknown")).toBeUndefined();
  });

  it("persists an entry and retrieves it after reload (E14)", () => {
    const store = new SessionStore(dir);
    store.set("s1", { sessionDir: "/tmp/s1", projectPath: "/bench/a" });
    const store2 = new SessionStore(dir);
    expect(store2.get("s1")).toMatchObject({ sessionDir: "/tmp/s1" });
  });

  it("treats a corrupt JSON file as empty (E14)", async () => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, "omp-sessions.json"), "{{{{not-json");
    const store = new SessionStore(dir);
    expect(store.get("s1")).toBeUndefined();
  });

  it("rewrite replaces the entire map (E14 — open_session GC fallback)", () => {
    const store = new SessionStore(dir);
    store.set("s1", { sessionDir: "/a", projectPath: "/bench/a" });
    store.set("s2", { sessionDir: "/b", projectPath: "/bench/b" });
    store.rewrite({ s3: { sessionDir: "/c", projectPath: "/bench/c" } });
    const store2 = new SessionStore(dir);
    expect(store2.get("s1")).toBeUndefined();
    expect(store2.get("s3")).toMatchObject({ sessionDir: "/c" });
  });

  it("delete removes entry and persists (E14)", () => {
    const store = new SessionStore(dir);
    store.set("s1", { sessionDir: "/a", projectPath: "/bench" });
    store.delete("s1");
    const store2 = new SessionStore(dir);
    expect(store2.get("s1")).toBeUndefined();
  });

  it("stores inputModalities for supportsVision (E19)", () => {
    const store = new SessionStore(dir);
    store.set("s1", {
      sessionDir: "/a",
      projectPath: "/bench",
      inputModalities: ["text", "image"],
    });
    expect(store.get("s1")?.inputModalities).toEqual(["text", "image"]);
  });
});
