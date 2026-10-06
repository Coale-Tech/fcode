import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("./check-release-dispatch.mjs", import.meta.url),
);

function runCheck(env = {}) {
  try {
    const stdout = execFileSync("node", [script], {
      encoding: "utf8",
      // Strip CI env so tests run cleanly from a developer workstation.
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      code: error.status ?? 1,
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() ?? "",
    };
  }
}

test("stable tag + sign_macos=false fails with the required error text", () => {
  const result = runCheck({
    GITHUB_EVENT_NAME: "workflow_dispatch",
    SIGN_MACOS: "false",
    GITHUB_REF: "refs/tags/v1.2.3",
    GITHUB_REF_NAME: "v1.2.3",
  });
  assert.equal(result.code, 1, "exit code must be 1");
  assert.match(
    result.stderr,
    /sign_macos=false is not allowed on stable tag v1\.2\.3/,
    "error text must name the tag",
  );
  assert.match(
    result.stderr,
    /vX\.Y\.Z-rc\.N/,
    "error text must suggest a prerelease tag",
  );
});

test("-rc prerelease tag + sign_macos=false passes (unsigned RC artifacts are fine)", () => {
  const result = runCheck({
    GITHUB_EVENT_NAME: "workflow_dispatch",
    SIGN_MACOS: "false",
    GITHUB_REF: "refs/tags/v1.2.3-rc.1",
    GITHUB_REF_NAME: "v1.2.3-rc.1",
  });
  assert.equal(result.code, 0, "prerelease tags must pass");
});

test("stable tag + sign_macos=false passes only with allow_unsigned_stable=true", () => {
  const env = {
    GITHUB_EVENT_NAME: "workflow_dispatch",
    SIGN_MACOS: "false",
    GITHUB_REF: "refs/tags/v1.2.3",
    GITHUB_REF_NAME: "v1.2.3",
  };
  const allowed = runCheck({ ...env, ALLOW_UNSIGNED_STABLE: "true" });
  assert.equal(allowed.code, 0, "explicit opt-in must pass");
  assert.match(allowed.stdout, /::warning::Publishing v1\.2\.3 as an unsigned stable release/);
  assert.equal(runCheck({ ...env, ALLOW_UNSIGNED_STABLE: "false" }).code, 1);
});

test("branch dispatch + sign_macos=false passes (debug lane)", () => {
  const result = runCheck({
    GITHUB_EVENT_NAME: "workflow_dispatch",
    SIGN_MACOS: "false",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REF_NAME: "main",
  });
  assert.equal(result.code, 0, "branch dispatch must pass");
});

test("push event passes regardless of sign_macos (tag-push gate is separate)", () => {
  const result = runCheck({
    GITHUB_EVENT_NAME: "push",
    SIGN_MACOS: "false",
    GITHUB_REF: "refs/tags/v1.2.3",
    GITHUB_REF_NAME: "v1.2.3",
  });
  assert.equal(result.code, 0, "push events must pass");
});

test("stable tag + sign_macos=true passes (normal signed release)", () => {
  const result = runCheck({
    GITHUB_EVENT_NAME: "workflow_dispatch",
    SIGN_MACOS: "true",
    GITHUB_REF: "refs/tags/v1.2.3",
    GITHUB_REF_NAME: "v1.2.3",
  });
  assert.equal(result.code, 0, "signed dispatch must pass");
});
