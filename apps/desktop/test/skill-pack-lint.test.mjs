/**
 * Integration tests for skill-pack lint surfacing in skillPackStatus and
 * OpenPr refusal when changed skills have errors.
 *
 * Secrets are built at runtime (string concatenation) so no realistic-looking
 * secret literal is committed to the repository.
 *
 * Run: node --test apps/desktop/test/skill-pack-lint.test.mjs
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const sh = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** Build a minimal git repo with one upstream commit; returns { origin, clone }. */
function makeRepo(root) {
  const origin = join(root, "origin.git");
  sh(root, "init", "-q", "--bare", "-b", "main", origin);
  sh(root, "clone", "-q", origin, "seed");
  const seed = join(root, "seed");
  writeFileSync(join(seed, "README.md"), "upstream");
  sh(seed, "add", "-A");
  sh(seed, "-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "init");
  sh(seed, "push", "-q", "origin", "HEAD:main");
  mkdirSync(join(root, "skills"));
  sh(join(root, "skills"), "clone", "-q", origin, "frappeskills");
  const clone = join(root, "skills", "frappeskills");
  sh(clone, "remote", "set-head", "origin", "main");
  sh(clone, "checkout", "-qb", "fcode/self-improve");
  return { origin, clone };
}

const VALID_FM = "---\nname: my-skill\ndescription: A reusable lesson\n---\n";
const CLEAN_SKILL = `${VALID_FM}# My Skill\n\nThis is a clean lesson with no issues.\n`;

// Build fake secret at runtime — never commit a realistic-looking literal.
const AWS_KEY = "AKIA" + "I0SOMELONGFAKEKEY";   // matches /AKIA[0-9A-Z]{16}/
const DIRTY_SKILL = `${VALID_FM}# Bad Skill\n\nMy key is ${AWS_KEY} here.\n`;
const INCIDENT_SKILL = `${VALID_FM}# Log\n\n- 2026-10-06: something happened\n- Fixed in #123\n`;

test("skillPackStatus populates lint for changed .md files", async () => {
  const root = mkdtempSync(join(tmpdir(), "sp-lint-"));
  try {
    const { clone } = makeRepo(root);
    process.env.PI_DESKTOP_DATA_DIR = root;

    const { skillPackStatus } = await import("../electron/main/skill-packs.ts");

    // Write a clean skill
    mkdirSync(join(clone, "frappe-testing"), { recursive: true });
    writeFileSync(join(clone, "frappe-testing", "SKILL.md"), CLEAN_SKILL);
    sh(clone, "add", "-A");
    sh(clone, "-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "frappe-testing: lesson");

    const s = await skillPackStatus();
    assert.equal(s.cloned, true);
    assert.equal(s.lint.length, 1, "should lint the added SKILL.md");
    const r = s.lint[0];
    assert.equal(r.errors.length, 0, `unexpected errors: ${r.errors.join(", ")}`);
    assert.equal(r.warnings.length, 0, `unexpected warnings: ${r.warnings.join(", ")}`);
  } finally {
    delete process.env.PI_DESKTOP_DATA_DIR;
    rmSync(root, { recursive: true, force: true });
  }
});

test("skillPackStatus reports lint errors for skill with planted secret", async () => {
  const root = mkdtempSync(join(tmpdir(), "sp-lint-"));
  try {
    const { clone } = makeRepo(root);
    process.env.PI_DESKTOP_DATA_DIR = root;

    const { skillPackStatus } = await import("../electron/main/skill-packs.ts");

    writeFileSync(join(clone, "bad.md"), DIRTY_SKILL);
    sh(clone, "add", "-A");
    sh(clone, "-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "bad skill");

    const s = await skillPackStatus();
    const r = s.lint.find((l) => l.skill === "bad.md");
    assert.ok(r, "bad.md should appear in lint results");
    assert.ok(r.errors.length > 0, "should have errors");

    const errMsg = r.errors.find((e) => e.includes("AWS access key"));
    assert.ok(errMsg, `expected 'AWS access key' error, got: ${r.errors.join(", ")}`);

    // Must NOT echo the secret value in any error message
    for (const e of r.errors) {
      assert.ok(!e.includes(AWS_KEY), `error must not echo the secret: ${e}`);
    }
  } finally {
    delete process.env.PI_DESKTOP_DATA_DIR;
    rmSync(root, { recursive: true, force: true });
  }
});

test("skillPackOpenPr refuses when a changed skill has lint errors", async () => {
  const root = mkdtempSync(join(tmpdir(), "sp-lint-"));
  try {
    const { clone } = makeRepo(root);
    process.env.PI_DESKTOP_DATA_DIR = root;

    const { skillPackOpenPr } = await import("../electron/main/skill-packs.ts");

    writeFileSync(join(clone, "secret.md"), DIRTY_SKILL);
    sh(clone, "add", "-A");
    sh(clone, "-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "add secret skill");

    await assert.rejects(
      () => skillPackOpenPr(),
      (err) => {
        assert.ok(err instanceof Error, "should throw an Error");
        assert.ok(err.message.includes("Lint errors"), `expected 'Lint errors' in message, got: ${err.message}`);
        return true;
      },
    );
  } finally {
    delete process.env.PI_DESKTOP_DATA_DIR;
    rmSync(root, { recursive: true, force: true });
  }
});

test("skillPackStatus warns but does not error for incident-log skill", async () => {
  const root = mkdtempSync(join(tmpdir(), "sp-lint-"));
  try {
    const { clone } = makeRepo(root);
    process.env.PI_DESKTOP_DATA_DIR = root;

    const { skillPackStatus } = await import("../electron/main/skill-packs.ts");

    writeFileSync(join(clone, "incident.md"), INCIDENT_SKILL);
    sh(clone, "add", "-A");
    sh(clone, "-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "incident log skill");

    const s = await skillPackStatus();
    const r = s.lint.find((l) => l.skill === "incident.md");
    assert.ok(r, "incident.md should appear in lint results");
    assert.equal(r.errors.length, 0, `unexpected errors: ${r.errors.join(", ")}`);
    assert.ok(r.warnings.length > 0, "should have incident-log warnings");
  } finally {
    delete process.env.PI_DESKTOP_DATA_DIR;
    rmSync(root, { recursive: true, force: true });
  }
});

test("skillPackStatus returns empty lint when no .md files changed", async () => {
  const root = mkdtempSync(join(tmpdir(), "sp-lint-"));
  try {
    const { clone } = makeRepo(root);
    process.env.PI_DESKTOP_DATA_DIR = root;

    const { skillPackStatus } = await import("../electron/main/skill-packs.ts");

    writeFileSync(join(clone, "config.json"), '{"key":"val"}');
    sh(clone, "add", "-A");
    sh(clone, "-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "non-md change");

    const s = await skillPackStatus();
    assert.deepEqual(s.lint, [], "no .md files → no lint results");
  } finally {
    delete process.env.PI_DESKTOP_DATA_DIR;
    rmSync(root, { recursive: true, force: true });
  }
});
