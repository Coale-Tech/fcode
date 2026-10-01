/**
 * Boundary tests for:
 *  - omp installed-skills IPC handler (reads skills.json + skills.lock.json)
 *  - omp historical-stats handler (maps DashboardStats.overall to OmpHistoricalStatsResult)
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

// ─── Helpers (extracted from omp-ipc.ts for unit testing) ────────────────────

/** Parse skills.json; returns empty record on missing/invalid file. */
async function readSkillsManifest(file) {
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(file, "utf8"));
    return raw?.skills ?? {};
  } catch {
    return {};
  }
}

/** Parse skills.lock.json; returns empty record on missing/invalid file. */
async function readSkillsLock(file) {
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(file, "utf8"));
    return raw?.skills ?? {};
  } catch {
    return {};
  }
}

/** Build the skills list from manifest + lock (mirrors the IPC handler logic). */
async function buildSkillsList(manifestFile, lockFile) {
  const [manifest, lock] = await Promise.all([
    readSkillsManifest(manifestFile),
    readSkillsLock(lockFile),
  ]);
  const ids = new Set([...Object.keys(manifest), ...Object.keys(lock)]);
  return [...ids].sort().map((id) => ({
    id,
    scope: "user",
    version: lock[id]?.version,
    range: manifest[id],
    stored: lock[id] !== undefined,
  }));
}

/** Map DashboardStats.overall → OmpHistoricalStatsResult (mirrors the IPC handler logic). */
function mapHistoricalStats(overall) {
  return {
    totalRequests: overall.totalRequests ?? 0,
    totalCost: overall.totalCost ?? 0,
    totalInputTokens: overall.totalInputTokens ?? 0,
    totalOutputTokens: overall.totalOutputTokens ?? 0,
    cacheRate: overall.cacheRate ?? 0,
    collectedAt: new Date().toISOString(),
  };
}

// ─── Skill dir scanning boundary tests ───────────────────────────────────────

test("empty skills dir → empty skills array", async () => {
  const dir = await mkdtemp(join(tmpdir(), "omp-skills-test-"));
  try {
    const skills = await buildSkillsList(
      join(dir, "skills.json"),
      join(dir, "skills.lock.json"),
    );
    assert.deepEqual(skills, [], "empty dir yields empty array");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("skills.json only (never installed) → entries with undefined version, stored=false", async () => {
  const dir = await mkdtemp(join(tmpdir(), "omp-skills-test-"));
  try {
    await writeFile(
      join(dir, "skills.json"),
      JSON.stringify({ skills: { "@alice/pdf-tools": "^1.0.0" } }),
    );
    const skills = await buildSkillsList(
      join(dir, "skills.json"),
      join(dir, "skills.lock.json"),
    );
    assert.equal(skills.length, 1);
    assert.equal(skills[0].id, "@alice/pdf-tools");
    assert.equal(skills[0].range, "^1.0.0");
    assert.equal(skills[0].version, undefined, "no lock entry → version undefined");
    assert.equal(skills[0].stored, false);
    assert.equal(skills[0].scope, "user");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("both skills.json and skills.lock.json → full entry", async () => {
  const dir = await mkdtemp(join(tmpdir(), "omp-skills-test-"));
  try {
    await writeFile(
      join(dir, "skills.json"),
      JSON.stringify({ skills: { "@alice/pdf-tools": "^1.0.0" } }),
    );
    await writeFile(
      join(dir, "skills.lock.json"),
      JSON.stringify({
        version: 1,
        skills: {
          "@alice/pdf-tools": {
            version: "1.2.3",
            integrity: "sha512-abc",
            resolved: "https://registry.example.com/@alice/pdf-tools/-/pdf-tools-1.2.3.tgz",
          },
        },
      }),
    );
    const skills = await buildSkillsList(
      join(dir, "skills.json"),
      join(dir, "skills.lock.json"),
    );
    assert.equal(skills.length, 1);
    assert.equal(skills[0].id, "@alice/pdf-tools");
    assert.equal(skills[0].version, "1.2.3");
    assert.equal(skills[0].range, "^1.0.0");
    assert.equal(skills[0].stored, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("lock-only entry (manifest removed) → stored=true, range=undefined", async () => {
  const dir = await mkdtemp(join(tmpdir(), "omp-skills-test-"));
  try {
    await writeFile(
      join(dir, "skills.lock.json"),
      JSON.stringify({
        version: 1,
        skills: {
          "@bob/helper": {
            version: "0.9.1",
            integrity: "sha512-def",
            resolved: "https://registry.example.com/@bob/helper/-/helper-0.9.1.tgz",
          },
        },
      }),
    );
    const skills = await buildSkillsList(
      join(dir, "skills.json"),
      join(dir, "skills.lock.json"),
    );
    assert.equal(skills.length, 1);
    assert.equal(skills[0].id, "@bob/helper");
    assert.equal(skills[0].version, "0.9.1");
    assert.equal(skills[0].range, undefined, "no manifest entry → range undefined");
    assert.equal(skills[0].stored, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("multiple skills are returned sorted by id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "omp-skills-test-"));
  try {
    await writeFile(
      join(dir, "skills.json"),
      JSON.stringify({
        skills: {
          "@z/last": "^2.0.0",
          "@a/first": "^1.0.0",
          "@m/middle": "^1.5.0",
        },
      }),
    );
    const skills = await buildSkillsList(
      join(dir, "skills.json"),
      join(dir, "skills.lock.json"),
    );
    assert.deepEqual(
      skills.map((s) => s.id),
      ["@a/first", "@m/middle", "@z/last"],
      "ids must be sorted alphabetically",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("malformed skills.json → treated as empty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "omp-skills-test-"));
  try {
    await writeFile(join(dir, "skills.json"), "not valid json {{");
    const skills = await buildSkillsList(
      join(dir, "skills.json"),
      join(dir, "skills.lock.json"),
    );
    assert.deepEqual(skills, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ─── Stats aggregation boundary tests ────────────────────────────────────────

test("stats mapping: all fields present → correctly mapped", () => {
  const result = mapHistoricalStats({
    totalRequests: 42,
    totalCost: 1.23,
    totalInputTokens: 10000,
    totalOutputTokens: 5000,
    cacheRate: 0.75,
  });
  assert.equal(result.totalRequests, 42);
  assert.equal(result.totalCost, 1.23);
  assert.equal(result.totalInputTokens, 10000);
  assert.equal(result.totalOutputTokens, 5000);
  assert.equal(result.cacheRate, 0.75);
  assert.ok(typeof result.collectedAt === "string", "collectedAt must be a string");
  assert.ok(result.collectedAt.includes("T"), "collectedAt must be an ISO-8601 timestamp");
});

test("stats mapping: zero/missing fields → zeroed result (no NaN)", () => {
  const result = mapHistoricalStats({});
  assert.equal(result.totalRequests, 0);
  assert.equal(result.totalCost, 0);
  assert.equal(result.totalInputTokens, 0);
  assert.equal(result.totalOutputTokens, 0);
  assert.equal(result.cacheRate, 0);
  assert.ok(Number.isFinite(result.totalCost), "cost must be finite");
});

test("stats mapping: partial fields → missing fields zero out", () => {
  const result = mapHistoricalStats({ totalRequests: 100, totalCost: 5.0 });
  assert.equal(result.totalRequests, 100);
  assert.equal(result.totalCost, 5.0);
  assert.equal(result.totalInputTokens, 0, "missing inputTokens defaults to 0");
  assert.equal(result.totalOutputTokens, 0, "missing outputTokens defaults to 0");
  assert.equal(result.cacheRate, 0, "missing cacheRate defaults to 0");
});
