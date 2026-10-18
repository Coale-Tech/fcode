/**
 * T14 — bench detail IPC: readBenchApps, readProcfileEntries.
 *
 * Behavioral tests: verify that real filesystem data is returned and that
 * the function never returns hardcoded names. Source-pin assertions are
 * prohibited; all checks operate on runtime behavior.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { register } from "node:module";
import { dirname, join as pjoin } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(pjoin(here, "helpers/ts-import-hooks.mjs")));

const { readBenchApps, readBenchAppsWithVersions, readProcfileEntries } = await import(
  "../electron/main/bench/discovery.ts"
);

// ── readBenchApps ────────────────────────────────────────────────────────────

test("readBenchApps returns sorted app names from apps/ directory", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-detail-test-"));
  try {
    mkdirSync(join(root, "apps", "frappe"), { recursive: true });
    mkdirSync(join(root, "apps", "erpnext"), { recursive: true });
    mkdirSync(join(root, "apps", "raven"), { recursive: true });

    const apps = readBenchApps(root);
    assert.deepEqual(apps, ["erpnext", "frappe", "raven"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readBenchAppsWithVersions returns {name, version} objects", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-detail-test-"));
  try {
    mkdirSync(join(root, "apps", "frappe", "frappe"), { recursive: true });
    writeFileSync(join(root, "apps", "frappe", "frappe", "__version__.py"), '__version__ = "16.8.2"\n');
    mkdirSync(join(root, "apps", "erpnext", "erpnext"), { recursive: true });
    // no __version__.py — version should be empty string

    const apps = readBenchAppsWithVersions(root);
    assert.equal(apps.length, 2);
    assert.equal(apps[0].name, "erpnext");
    assert.equal(apps[0].version, "");
    assert.equal(apps[1].name, "frappe");
    assert.equal(apps[1].version, "16.8.2");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readBenchApps excludes hidden directories", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-detail-test-"));
  try {
    mkdirSync(join(root, "apps", "frappe"), { recursive: true });
    mkdirSync(join(root, "apps", ".git"), { recursive: true });
    mkdirSync(join(root, "apps", ".cache"), { recursive: true });

    const apps = readBenchApps(root);
    assert.deepEqual(apps, ["frappe"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readBenchApps returns empty array when apps/ is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-detail-test-"));
  try {
    const apps = readBenchApps(root);
    assert.deepEqual(apps, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readBenchApps result contains only what is on disk (no hardcoded names)", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-detail-test-"));
  try {
    mkdirSync(join(root, "apps", "custom_app"), { recursive: true });

    const apps = readBenchApps(root);
    // Result must contain custom_app and must NOT contain any hardcoded name.
    assert.ok(apps.includes("custom_app"), "should find custom_app");
    for (const hardcoded of ["frappe", "erpnext", "hrms", "raven", "studio", "builder"]) {
      assert.ok(!apps.includes(hardcoded), `must not return hardcoded '${hardcoded}'`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── readProcfileEntries ───────────────────────────────────────────────────────

test("readProcfileEntries parses standard Frappe Procfile format", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-detail-test-"));
  try {
    writeFileSync(
      join(root, "Procfile"),
      [
        "web: bench serve --port 8000",
        "worker_short: bench worker --queue short",
        "worker_long: bench worker --queue long",
        "redis_cache: redis-server config/redis_cache.conf",
        "schedule: bench schedule",
      ].join("\n"),
    );

    const entries = readProcfileEntries(root);
    assert.deepEqual(entries, [
      "web",
      "worker_short",
      "worker_long",
      "redis_cache",
      "schedule",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readProcfileEntries skips comment lines and blank lines", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-detail-test-"));
  try {
    writeFileSync(
      join(root, "Procfile"),
      [
        "# comment",
        "",
        "web: bench serve",
        "# another comment",
        "schedule: bench schedule",
      ].join("\n"),
    );

    const entries = readProcfileEntries(root);
    assert.deepEqual(entries, ["web", "schedule"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readProcfileEntries returns empty array when Procfile is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-detail-test-"));
  try {
    const entries = readProcfileEntries(root);
    assert.deepEqual(entries, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
