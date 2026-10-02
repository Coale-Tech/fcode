#!/usr/bin/env node
/**
 * Guard: workflow_dispatch with sign_macos=false on a stable tag is forbidden.
 *
 * Stable tags produced v0.16.0, v0.17.0, and v0.17.1 unsigned because
 * workflow_dispatch bypasses the tag-push gate. This script is the first step
 * in the `verify` job and fails before any build starts.
 *
 * Fails when ALL of:
 *   - GITHUB_EVENT_NAME is workflow_dispatch
 *   - SIGN_MACOS is "false"
 *   - GITHUB_REF starts with refs/tags/v
 *   - GITHUB_REF_NAME contains no "-" (i.e. not a prerelease tag)
 *
 * A branch dispatch with sign_macos=false is the debug lane and passes.
 * A prerelease tag (vX.Y.Z-rc.N) passes — unsigned RC artifacts are fine.
 *
 * Usage in CI (release.yml verify job):
 *   - name: Check release dispatch guard
 *     env:
 *       SIGN_MACOS: ${{ inputs.sign_macos }}
 *     run: node scripts/check-release-dispatch.mjs
 *
 * Usage for local smoke testing:
 *   GITHUB_EVENT_NAME=workflow_dispatch SIGN_MACOS=false \
 *     GITHUB_REF=refs/tags/v1.2.3 GITHUB_REF_NAME=v1.2.3 \
 *     node scripts/check-release-dispatch.mjs
 */

const eventName = process.env.GITHUB_EVENT_NAME ?? "";
const signMacos = process.env.SIGN_MACOS ?? "true";
const ref = process.env.GITHUB_REF ?? "";
const refName = process.env.GITHUB_REF_NAME ?? "";

const isDispatch = eventName === "workflow_dispatch";
const isUnsigned = signMacos === "false";
const isStableTag =
  ref.startsWith("refs/tags/v") && !refName.includes("-");

if (isDispatch && isUnsigned && isStableTag) {
  process.stderr.write(
    `::error::sign_macos=false is not allowed on stable tag ${refName}. Use a prerelease tag (vX.Y.Z-rc.N) to build unsigned macOS artifacts.\n`,
  );
  process.exit(1);
}

console.log("Release dispatch check passed.");
