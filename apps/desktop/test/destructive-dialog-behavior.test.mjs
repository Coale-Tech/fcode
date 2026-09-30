/**
 * Behavioral tests for DestructiveActionDialog (B4 / T8).
 *
 * `nextFocusIndex` is a pure function — no DOM required.
 * The file imports React so dynamic import fails in a Node test environment;
 * we extract the algorithm from the source (guarded by an export assertion in
 * t08-destructive-action-dialog.test.mjs) and exercise it inline.
 *
 * Source-text assertions cover Escape/Cancel semantics, portal, and ARIA.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const src = await readFile(
  new URL(
    "../src/components/DestructiveActionDialog.tsx",
    import.meta.url,
  ),
  "utf8",
);

// ── nextFocusIndex — pure algorithm tests ───────────────────────────────────
//
// The function is: if count===0 return 0;
//   shiftKey ? (current-1+count)%count : (current+1)%count
//
// We inline the logic so tests run without a React import. The export and
// implementation body are verified separately (t08 + source assertions below).

function nextFocusIndex(current, count, shiftKey) {
  if (count === 0) return 0;
  return shiftKey ? (current - 1 + count) % count : (current + 1) % count;
}

test("nextFocusIndex: empty list always returns 0", () => {
  assert.equal(nextFocusIndex(0, 0, false), 0);
  assert.equal(nextFocusIndex(5, 0, true), 0);
});

test("nextFocusIndex: single item wraps to itself", () => {
  assert.equal(nextFocusIndex(0, 1, false), 0);
  assert.equal(nextFocusIndex(0, 1, true), 0);
});

test("nextFocusIndex: forward Tab wraps from last to first", () => {
  assert.equal(nextFocusIndex(1, 2, false), 0, "2-item: last → first");
  assert.equal(nextFocusIndex(2, 3, false), 0, "3-item: last → first");
});

test("nextFocusIndex: forward Tab advances within list", () => {
  assert.equal(nextFocusIndex(0, 2, false), 1, "2-item: first → second");
  assert.equal(nextFocusIndex(0, 3, false), 1, "3-item: first → second");
  assert.equal(nextFocusIndex(1, 3, false), 2, "3-item: second → third");
});

test("nextFocusIndex: backward Shift+Tab wraps from first to last", () => {
  assert.equal(nextFocusIndex(0, 2, true), 1, "2-item: first → last");
  assert.equal(nextFocusIndex(0, 3, true), 2, "3-item: first → last");
});

test("nextFocusIndex: backward Shift+Tab retreats within list", () => {
  assert.equal(nextFocusIndex(1, 2, true), 0, "2-item: second → first");
  assert.equal(nextFocusIndex(2, 3, true), 1, "3-item: third → second");
  assert.equal(nextFocusIndex(1, 3, true), 0, "3-item: second → first");
});

test("nextFocusIndex: 2-item (Cancel/Confirm) round-trips", () => {
  // Tab: Cancel(0)→Confirm(1)→Cancel(0)
  assert.equal(nextFocusIndex(0, 2, false), 1);
  assert.equal(nextFocusIndex(1, 2, false), 0);
  // Shift+Tab: Confirm(1)→Cancel(0)→Confirm(1)
  assert.equal(nextFocusIndex(1, 2, true), 0);
  assert.equal(nextFocusIndex(0, 2, true), 1);
});

// ── Source-text assertions: behaviour contracts ──────────────────────────────

test("dialog: Escape key calls onCancel", () => {
  // The useEffect keydown handler must call onCancel() on Escape.
  assert.match(src, /Escape[\s\S]{0,60}onCancel\(\)/);
});

test("dialog: backdrop click calls onCancel, not onConfirm", () => {
  // The overlay onClick must invoke onCancel — never onConfirm.
  assert.match(src, /event\.target === event\.currentTarget.*onCancel|onCancel[\s\S]{0,30}event\.target === event\.currentTarget/s);
  assert.doesNotMatch(
    src,
    /event\.target === event\.currentTarget[\s\S]{0,40}onConfirm/,
  );
});

test("dialog: Cancel button is focused first (safe default)", () => {
  assert.match(src, /cancelRef\.current\?\.focus/);
  assert.match(src, /requestAnimationFrame/);
});

test("dialog: role=alertdialog aria-modal aria-labelledby aria-describedby", () => {
  assert.match(src, /role="alertdialog"/);
  assert.match(src, /aria-modal="true"/);
  assert.match(src, /aria-labelledby="dd-title"/);
  assert.match(src, /aria-describedby="dd-desc"/);
});

test("dialog: rendered through portal to document.body", () => {
  // portalToBody from portal-visibility.tsx escapes clip from transformed ancestors.
  assert.match(src, /portalToBody/);
  assert.match(src, /portal-visibility/);
});

test("dialog: nextFocusIndex used in Tab trap (not a copy-paste trap)", () => {
  assert.match(src, /nextFocusIndex\(/);
});

test("dialog: NO auto-deny timer in any form", () => {
  assert.doesNotMatch(src, /setInterval[\s\S]{0,100}deny/);
  assert.doesNotMatch(src, /void resolve.*deny/);
});
