import assert from "node:assert/strict";
import { test } from "vitest";
import { shouldAutoApproveVerb } from "./bench-headless.js";

// ── E4: Verb allow-list (no start/console/serve) ─────────────────────────────

test("shouldAutoApproveVerb allows only the fixed verb list", () => {
  for (const verb of ["migrate", "clear-cache", "build", "list-apps", "install-app", "build-studio-app"]) {
    assert.ok(shouldAutoApproveVerb(verb), verb);
  }
  for (const verb of ["start", "console", "serve", "rm -rf /", "constructor", "__proto__"]) {
    assert.ok(!shouldAutoApproveVerb(verb), verb);
  }
});
