/**
 * Tests for bench discovery (E11, E12, DX1).
 * Tasks: DX1 — real discovery; E11 — lazy/cancellable; E12 — field-filtered site_config.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, delimiter } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { register } from "node:module";
import { dirname, join as pjoin } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(pjoin(here, "helpers/ts-import-hooks.mjs")));

const { discoverBenches, parseSiteConfig, defaultRoots, DEFAULT_ROOTS } = await import(
  "../electron/main/bench/discovery.ts"
);

// Helper: create a minimal bench directory tree for testing.
function makeBench(root, { name = "testbench", version = "16.0.0", sites = ["site1.local"] } = {}) {
  const bench = join(root, name);
  mkdirSync(join(bench, "apps", "frappe", "frappe"), { recursive: true });
  mkdirSync(join(bench, "sites"), { recursive: true });

  // Write Frappe __init__.py with a version string
  writeFileSync(
    join(bench, "apps", "frappe", "frappe", "__init__.py"),
    `__version__ = "${version}"\n`,
  );

  for (const site of sites) {
    mkdirSync(join(bench, "sites", site), { recursive: true });
    writeFileSync(
      join(bench, "sites", site, "site_config.json"),
      JSON.stringify({
        db_name: "site_db",
        db_password: "SECRET_PASSWORD",
        encryption_key: "SECRET_KEY",
        administrator_password: "ADMIN_SECRET",
        webserver_port: 8000,
      }),
    );
  }

  // Set the first site as default
  if (sites.length > 0) {
    writeFileSync(join(bench, "sites", "currentsite.txt"), sites[0]);
  }

  return bench;
}

test("discoverBenches finds a bench and returns summary without secrets (E12)", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "bench-disc-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  makeBench(root, { name: "coale_v16", version: "16.0.0", sites: ["v16.local"] });

  const { benches: results } = await discoverBenches({ roots: [root] });
  assert.equal(results.length, 1);
  assert.equal(results[0].version, 16);
  assert.ok(results[0].sites.length > 0);
  assert.equal(results[0].sites[0].name, "v16.local");
  assert.equal(results[0].sites[0].isDefault, true);

  // Verify no secrets leaked (E12)
  const json = JSON.stringify(results);
  assert.ok(!json.includes("SECRET_PASSWORD"), "db_password must not appear");
  assert.ok(!json.includes("SECRET_KEY"), "encryption_key must not appear");
  assert.ok(!json.includes("ADMIN_SECRET"), "administrator_password must not appear");
});

test("discoverBenches handles version 15 and 17 (E11)", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "bench-disc-v15-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  makeBench(root, { name: "v15bench", version: "15.4.1" });
  makeBench(root, { name: "v17bench", version: "17.0.0-dev" });

  const { benches: results } = await discoverBenches({ roots: [root] });
  const versions = results.map((b) => b.version).sort();
  assert.deepEqual(versions, [15, 17]);
});

test("discoverBenches badges an unparseable version as 'unknown' (DX10)", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "bench-disc-bad-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  makeBench(root, { name: "badbench", version: "not-a-version" });

  const { benches: results } = await discoverBenches({ roots: [root] });
  assert.equal(results.length, 1);
  assert.equal(results[0].version, "unknown");
});

test("discoverBenches skips directories without apps/ and sites/ (E11)", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "bench-disc-skip-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  // Create a directory that looks like a bench but is missing sites/
  const notABench = join(root, "notabench");
  mkdirSync(join(notABench, "apps"), { recursive: true });
  // No sites/

  const { benches: results } = await discoverBenches({ roots: [root] });
  assert.equal(results.length, 0);
});

test("parseSiteConfig redacts sensitive fields and preserves webserver_port (E12)", (t) => {
  const raw = {
    db_name: "mydb",
    db_password: "secret123",
    encryption_key: "mykey",
    administrator_password: "adminpw",
    webserver_port: 8001,
    builder_path: "builder",
    custom_field: "keep_me_not_in_allowed",
  };

  const result = parseSiteConfig(raw);
  // Allowed fields only
  assert.equal(result.webserverPort, 8001);
  assert.equal(result.builderPath, "builder");
  // No secrets
  assert.ok(!("db_password" in result), "db_password must be redacted");
  assert.ok(!("encryption_key" in result), "encryption_key must be redacted");
  assert.ok(!("administrator_password" in result), "administrator_password must be redacted");
  // Custom fields not in allowed list also excluded
  assert.ok(!("custom_field" in result), "unknown fields must be excluded");
});

test("discoverBenches aborts when AbortSignal is signalled (E11)", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "bench-disc-abort-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  // Create several benches to make the scan non-trivial
  for (let i = 0; i < 3; i++) {
    makeBench(root, { name: `bench${i}`, version: "16.0.0" });
  }

  const ac = new AbortController();
  ac.abort(); // abort immediately

  // Should resolve (not throw) with an empty or partial result when aborted
  const { benches: results } = await discoverBenches({ roots: [root], signal: ac.signal });
  // May return 0 results since we aborted immediately; must not throw.
  assert.ok(Array.isArray(results));
});

// Gap 4 / T6: unreadable root appears in failedRoots, readable roots still work
test("discoverBenches returns failedRoots for unreadable directories (T6 Gap4)", async (t) => {
  const goodRoot = mkdtempSync(join(tmpdir(), "bench-disc-good-"));
  t.after(() => rmSync(goodRoot, { recursive: true, force: true }));
  makeBench(goodRoot, { name: "okbench", version: "16.0.0" });

  const badRoot = "/nonexistent/bench/root/t6test";

  const { benches, failedRoots } = await discoverBenches({ roots: [goodRoot, badRoot] });
  // The good root bench is found
  assert.equal(benches.length, 1);
  assert.equal(benches[0].version, 16);
  // The bad root is surfaced in failedRoots
  assert.ok(failedRoots.length >= 1, "failedRoots must include the unreadable path");
  const failed = failedRoots.find((f) => f.root === badRoot);
  assert.ok(failed, "badRoot must appear in failedRoots");
  assert.ok(typeof failed.reason === "string" && failed.reason.length > 0, "reason must be non-empty");
});

// B10(a): dirs without site_config.json must not appear as sites
test("readSites excludes dirs without site_config.json (B10a)", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "bench-disc-sites-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const bench = join(root, "mybench");
  mkdirSync(join(bench, "apps", "frappe", "frappe"), { recursive: true });
  mkdirSync(join(bench, "sites"), { recursive: true });
  writeFileSync(join(bench, "apps", "frappe", "frappe", "__init__.py"), '__version__ = "16.0.0"\n');

  // Real site: has site_config.json
  mkdirSync(join(bench, "sites", "real.local"), { recursive: true });
  writeFileSync(join(bench, "sites", "real.local", "site_config.json"), JSON.stringify({ webserver_port: 8000 }));

  // Log/import folder: no site_config.json — should be excluded
  mkdirSync(join(bench, "sites", "import_2025"), { recursive: true });
  writeFileSync(join(bench, "sites", "import_2025", "some.log"), "data");

  const { benches } = await discoverBenches({ roots: [root] });
  assert.equal(benches.length, 1);
  const siteNames = benches[0].sites.map((s) => s.name);
  assert.ok(siteNames.includes("real.local"), "real site must be included");
  assert.ok(!siteNames.includes("import_2025"), "log folder must be excluded");
});

// B10(b): defaultRoots() falls back to ~/ERPNext when env is unset
test("defaultRoots() falls back to ~/ERPNext when FCODE_BENCH_ROOTS is unset (B10b)", (t) => {
  const saved = process.env.FCODE_BENCH_ROOTS;
  delete process.env.FCODE_BENCH_ROOTS;
  t.after(() => {
    if (saved !== undefined) process.env.FCODE_BENCH_ROOTS = saved;
    else delete process.env.FCODE_BENCH_ROOTS;
  });

  const roots = defaultRoots();
  assert.deepEqual(roots, DEFAULT_ROOTS);
});

// B10(b): FCODE_BENCH_ROOTS env overrides the default roots at call time
test("defaultRoots() uses FCODE_BENCH_ROOTS env when set (B10b)", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "bench-disc-env-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const saved = process.env.FCODE_BENCH_ROOTS;
  process.env.FCODE_BENCH_ROOTS = root;
  t.after(() => {
    if (saved !== undefined) process.env.FCODE_BENCH_ROOTS = saved;
    else delete process.env.FCODE_BENCH_ROOTS;
  });

  // defaultRoots() must reflect the env at call time
  assert.deepEqual(defaultRoots(), [root]);

  // discoverBenches() with no explicit roots must use the env path
  mkdirSync(join(root, "envbench", "apps", "frappe", "frappe"), { recursive: true });
  mkdirSync(join(root, "envbench", "sites"), { recursive: true });
  writeFileSync(join(root, "envbench", "apps", "frappe", "frappe", "__init__.py"), '__version__ = "16.0.0"\n');
  mkdirSync(join(root, "envbench", "sites", "s.local"), { recursive: true });
  writeFileSync(join(root, "envbench", "sites", "s.local", "site_config.json"), JSON.stringify({}));

  const { benches } = await discoverBenches();
  assert.equal(benches.length, 1, "bench from FCODE_BENCH_ROOTS must be discovered");
  assert.ok(benches[0].path.includes("envbench"));
});

// B10(b): multiple paths in FCODE_BENCH_ROOTS (delimiter-separated)
test("defaultRoots() splits multiple paths in FCODE_BENCH_ROOTS (B10b)", (t) => {
  const saved = process.env.FCODE_BENCH_ROOTS;
  const paths = ["/tmp/a", "/tmp/b"];
  process.env.FCODE_BENCH_ROOTS = paths.join(delimiter);
  t.after(() => {
    if (saved !== undefined) process.env.FCODE_BENCH_ROOTS = saved;
    else delete process.env.FCODE_BENCH_ROOTS;
  });

  assert.deepEqual(defaultRoots(), paths);
});
