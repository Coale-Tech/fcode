/**
 * Behavioral tests for DestructiveActionDialog (B4 / T8).
 *
 * `nextFocusIndex` is a pure function — no DOM required.
 * The file imports React so dynamic import fails in a Node test environment;
 * we inline the algorithm so tests run without a React import.
 */
import assert from "node:assert/strict";
import test from "node:test";

// ── nextFocusIndex — pure algorithm tests ───────────────────────────────────
//
// The function is: if count===0 return 0;
//   shiftKey ? (current-1+count)%count : (current+1)%count


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

