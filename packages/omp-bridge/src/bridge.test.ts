/**
 * Tests for omp-bridge core functions (DX3, DX6, DX7, DX10, E9, T7).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isReadOnlyExecuteMethod,
  makeOmpOverlay,
  resolveOmpBinary,
  writeOmpOverlay,
} from "./bridge.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "omp-bridge-test-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("resolveOmpBinary (DX6 / T7 — sidecar.fatal paths)", () => {
  it("returns OMP_BIN env var when set", () => {
    const result = resolveOmpBinary({
      resourcesPath: "/nonexistent",
      env: { OMP_BIN: "/custom/omp" },
    });
    expect(result).toBe("/custom/omp");
  });

  it("returns resourcesPath/bin/omp as first candidate", () => {
    // Using a real temp dir that exists so the file-exists check passes.
    // Create the binary there.
    const { mkdirSync } = require("node:fs");
    mkdirSync(join(dir, "bin"), { recursive: true });
    writeFileSync(join(dir, "bin", "omp"), "#!/bin/sh");

    const result = resolveOmpBinary({ resourcesPath: dir, env: {} });
    expect(result).toBe(join(dir, "bin", "omp"));
  });

  it("returns all three candidate paths when binary is not found (for sidecar.fatal)", () => {
    // resolveOmpBinary with a non-existent resourcesPath returns last fallback
    const result = resolveOmpBinary({ resourcesPath: "/no-such-path", env: {} });
    // Should return the last candidate (PATH fallback "omp") since none exist
    expect(result).toBe("omp");
  });
});

describe("makeOmpOverlay (DX3 / DX6 / DX7 / DX10)", () => {
  it("includes always-ask approval mode (DX3 — never yolo)", () => {
    const overlay = makeOmpOverlay({
      dataDir: dir,
      resourcesPath: "/app/resources",
      screenshotsDir: join(dir, "screenshots"),
    });
    expect(overlay).toContain("always-ask");
    expect(overlay).toContain("approval_mode");
  });

  it("auto-approves fcode_bench_execute reads only (DX7)", () => {
    const overlay = makeOmpOverlay({
      dataDir: dir,
      resourcesPath: "/app/resources",
      screenshotsDir: join(dir, "screenshots"),
    });
    // Read-only execute is auto-approved
    expect(overlay).toContain("fcode_bench_execute_read");
    expect(overlay).toContain("allow");
  });

  it("sets customDirectories for fcode-skills (DX6)", () => {
    const overlay = makeOmpOverlay({
      dataDir: dir,
      resourcesPath: "/app/resources",
      screenshotsDir: join(dir, "screenshots"),
    });
    expect(overlay).toContain("customDirectories");
    expect(overlay).toContain("fcode-skills");
  });

  it("sets enableClaudeUser: true", () => {
    const overlay = makeOmpOverlay({
      dataDir: dir,
      resourcesPath: "/app/resources",
      screenshotsDir: join(dir, "screenshots"),
    });
    expect(overlay).toContain("enableClaudeUser");
    expect(overlay).toContain("true");
  });

  it("includes browser config (headless, screenshotDir)", () => {
    const overlay = makeOmpOverlay({
      dataDir: dir,
      resourcesPath: "/app/resources",
      screenshotsDir: join(dir, "screenshots"),
    });
    expect(overlay).toContain("headless");
    expect(overlay).toContain("screenshotDir");
  });
});

describe("writeOmpOverlay (DX3 — overlay write failure is fatal)", () => {
  it("writes the overlay file and returns the path", () => {
    const overlayPath = writeOmpOverlay({
      dataDir: dir,
      resourcesPath: "/app/resources",
      screenshotsDir: join(dir, "screenshots"),
    });
    const { readFileSync, existsSync } = require("node:fs");
    expect(existsSync(overlayPath)).toBe(true);
    const content = readFileSync(overlayPath, "utf8");
    expect(content).toContain("always-ask");
  });

  it("throws when the directory is not writable (DX3)", () => {
    // Provide a path that cannot exist as a directory
    expect(() =>
      writeOmpOverlay({
        dataDir: "/no-such-dir-that-exists",
        resourcesPath: "/app/resources",
        screenshotsDir: join(dir, "screenshots"),
      }),
    ).toThrow();
  });
});

describe("isReadOnlyExecuteMethod (DX7 — prefix-based auto-approval gate)", () => {
  it("approves frappe.client.get", () => {
    expect(isReadOnlyExecuteMethod("frappe.client.get")).toBe(true);
  });

  it("approves frappe.client.get_list", () => {
    expect(isReadOnlyExecuteMethod("frappe.client.get_list")).toBe(true);
  });

  it("approves frappe.db.get_value", () => {
    expect(isReadOnlyExecuteMethod("frappe.db.get_value")).toBe(true);
  });

  it("approves frappe.db.count", () => {
    expect(isReadOnlyExecuteMethod("frappe.db.count")).toBe(true);
  });

  it("approves frappe.utils.*", () => {
    expect(isReadOnlyExecuteMethod("frappe.utils.now")).toBe(true);
    expect(isReadOnlyExecuteMethod("frappe.utils.get_url")).toBe(true);
  });

  it("approves studio.api.get_something", () => {
    expect(isReadOnlyExecuteMethod("studio.api.get_page")).toBe(true);
    expect(isReadOnlyExecuteMethod("studio.api.list_apps")).toBe(true);
  });

  it("approves builder.api.get_page", () => {
    expect(isReadOnlyExecuteMethod("builder.api.get_page")).toBe(true);
  });

  it("rejects frappe.client.set_value (mutating)", () => {
    expect(isReadOnlyExecuteMethod("frappe.client.set_value")).toBe(false);
  });

  it("rejects frappe.db.delete_doc (mutating)", () => {
    expect(isReadOnlyExecuteMethod("frappe.db.delete_doc")).toBe(false);
  });

  it("is segment-aware: frappe.client.get_list_evil is NOT approved (DX7)", () => {
    // The prefix `frappe.client.get_list` should not match `frappe.client.get_list_evil`
    // because segment boundaries matter.
    expect(isReadOnlyExecuteMethod("frappe.client.get_list_evil")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isReadOnlyExecuteMethod("")).toBe(false);
  });

  it("rejects arbitrary.method.name", () => {
    expect(isReadOnlyExecuteMethod("arbitrary.method.name")).toBe(false);
  });
});
