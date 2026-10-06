/**
 * Boundary test: approval mode → omp overlay mapping (makeOmpOverlay).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { makeOmpOverlay } = await import(
  "../../../packages/omp-bridge/src/bridge.ts"
);

const BASE_OPTS = {
  dataDir: "/tmp/fcode-test",
  resourcesPath: "/tmp/resources",
  screenshotsDir: "/tmp/fcode-test/screenshots",
};

test("makeOmpOverlay defaults to always-ask when no approvalMode given", () => {
  const yaml = makeOmpOverlay(BASE_OPTS);
  assert.ok(yaml.includes("approval_mode: always-ask"), "default must be always-ask");
});

test("makeOmpOverlay starts omp on Fcode's default model only when one is given", () => {
  assert.equal(parseYaml(makeOmpOverlay(BASE_OPTS)).modelRoles, undefined);
  const yaml = parseYaml(makeOmpOverlay({ ...BASE_OPTS, defaultModel: "fcode-p1/gpt-x" }));
  assert.deepEqual(yaml.modelRoles, { default: "fcode-p1/gpt-x" });
});

test("makeOmpOverlay uses provided approvalMode for all three modes", () => {
  for (const mode of ["always-ask", "write", "yolo"]) {
    const yaml = makeOmpOverlay({ ...BASE_OPTS, approvalMode: mode });
    assert.ok(yaml.includes(`approval_mode: ${mode}`), `mode=${mode} must appear in overlay`);
  }
});

test("FCODE_TOOL_APPROVAL_MODE guard: only write/yolo pass through, all others become always-ask", () => {
  // Replicate the inline guard from bridge.ts main()
  function resolveMode(raw) {
    return raw === "write" || raw === "yolo" ? raw : "always-ask";
  }
  assert.equal(resolveMode("yolo"), "yolo");
  assert.equal(resolveMode("write"), "write");
  assert.equal(resolveMode("always-ask"), "always-ask");
  assert.equal(resolveMode("evil"), "always-ask");
  assert.equal(resolveMode(undefined), "always-ask");
  assert.equal(resolveMode(""), "always-ask");
});

test("makeOmpOverlay auto-approves read-only bash by default, prompt guard first", () => {
  const { bash } = parseYaml(makeOmpOverlay(BASE_OPTS));
  // omp takes the first matching rule, so `git log --output=x` must hit the prompt rule.
  assert.deepEqual(bash.patterns[0], { match: "git *--output*", approval: "prompt" });
  assert.ok(bash.patterns.some((r) => r.match === "git status" && r.approval === "allow"));
  // Token-bounded, so `git difftool --extcmd=…` cannot ride the `git diff` rule.
  assert.ok(!bash.patterns.some((r) => r.match === "git diff*"));
  assert.ok(bash.patterns.slice(1).every((r) => r.approval === "allow"));
});

test("makeOmpOverlay omits bash.patterns when bash.autoApproveReadOnly is false", () => {
  const parsed = parseYaml(makeOmpOverlay({ ...BASE_OPTS, ompSettings: { "bash.autoApproveReadOnly": false } }));
  assert.equal(parsed.bash, undefined);
});
