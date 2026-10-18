/**
 * Bench discovery: single-site default rule (B-01/B-02).
 *
 * Behavioral tests: verify that a single-site bench with no currentsite.txt
 * gets its only site marked isDefault, and that a multi-site bench without
 * currentsite.txt leaves all sites as non-default. Source-pin assertions are
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

const { discoverBenches } = await import("../electron/main/bench/discovery.ts");

function makeBench(root, name, siteNames, defaultSite) {
  const benchPath = join(root, name);
  mkdirSync(join(benchPath, "apps"), { recursive: true });
  for (const site of siteNames) {
    mkdirSync(join(benchPath, "sites", site), { recursive: true });
    writeFileSync(join(benchPath, "sites", site, "site_config.json"), "{}");
  }
  if (defaultSite) {
    writeFileSync(join(benchPath, "sites", "currentsite.txt"), defaultSite);
  }
  return benchPath;
}

test("single-site bench with no currentsite.txt: only site is isDefault", async () => {
  const root = mkdtempSync(join(tmpdir(), "bench-disc-test-"));
  try {
    makeBench(root, "my_bench", ["gbiwholesale"], null);
    const { benches } = await discoverBenches({ roots: [root] });
    assert.equal(benches.length, 1, "should discover one bench");
    const sites = benches[0].sites;
    assert.equal(sites.length, 1, "should have one site");
    assert.equal(sites[0].name, "gbiwholesale");
    assert.equal(sites[0].isDefault, true, "single site must be marked isDefault when no currentsite.txt");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("single-site bench with currentsite.txt: named site is isDefault", async () => {
  const root = mkdtempSync(join(tmpdir(), "bench-disc-test-"));
  try {
    makeBench(root, "my_bench", ["mysite"], "mysite");
    const { benches } = await discoverBenches({ roots: [root] });
    assert.equal(benches.length, 1);
    const sites = benches[0].sites;
    assert.equal(sites[0].isDefault, true, "site matching currentsite.txt must be isDefault");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("multi-site bench with no currentsite.txt: no site is isDefault", async () => {
  const root = mkdtempSync(join(tmpdir(), "bench-disc-test-"));
  try {
    makeBench(root, "multi_bench", ["site_a", "site_b"], null);
    const { benches } = await discoverBenches({ roots: [root] });
    assert.equal(benches.length, 1);
    const sites = benches[0].sites;
    assert.equal(sites.length, 2, "should have two sites");
    const defaults = sites.filter((s) => s.isDefault);
    assert.equal(defaults.length, 0, "multi-site bench with no currentsite.txt must have no default");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("multi-site bench with currentsite.txt: only named site is isDefault", async () => {
  const root = mkdtempSync(join(tmpdir(), "bench-disc-test-"));
  try {
    makeBench(root, "multi_bench", ["site_a", "site_b"], "site_a");
    const { benches } = await discoverBenches({ roots: [root] });
    assert.equal(benches.length, 1);
    const sites = benches[0].sites;
    const def = sites.find((s) => s.isDefault);
    assert.ok(def, "should have a default site");
    assert.equal(def.name, "site_a", "default should be the site in currentsite.txt");
    assert.equal(sites.filter((s) => s.isDefault).length, 1, "exactly one site is default");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
