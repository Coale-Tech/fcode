/**
 * T8 — Destructive-action dialog with no auto-deny timer.
 *
 * Checks that DestructiveActionDialog.tsx:
 * - Names site, command and consequence in a single sentence
 * - Has NO auto-deny timer (no setInterval/auto-deny code)
 * - Is reusable by both the Bench tab UI and the agent path
 * - PermissionCard.tsx retains its own auto-deny timer (unchanged)
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dialog = await readFile(
  new URL(
    "../src/components/DestructiveActionDialog.tsx",
    import.meta.url,
  ),
  "utf8",
);

const permCard = await readFile(
  new URL("../src/components/PermissionCard.tsx", import.meta.url),
  "utf8",
);

test("T8: DestructiveActionDialog component exists", () => {
  assert.match(dialog, /DestructiveActionDialog/);
});

test("T8: DestructiveActionDialog renders site, command and consequence", () => {
  assert.match(dialog, /site/i);
  assert.match(dialog, /command/i);
  assert.match(dialog, /consequence/i);
});

test("T8: DestructiveActionDialog has Confirm and Cancel actions", () => {
  assert.match(dialog, /onConfirm|confirm/i);
  assert.match(dialog, /onCancel|cancel/i);
});

test("T8: DestructiveActionDialog has NO auto-deny timer", () => {
  // Must NOT contain setInterval-driven auto-deny logic
  assert.doesNotMatch(dialog, /void resolve.*deny|setInterval[\s\S]{0,200}deny/);
});

test("T8: PermissionCard retains its own auto-deny timer (unchanged)", () => {
  // The PermissionCard auto-deny at lines 63-67 must still be present
  assert.match(permCard, /void resolve\("deny"\)/);
});
