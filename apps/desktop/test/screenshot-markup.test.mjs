import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { normalizePt, arrowHeadPoints } = await import("../src/lib/screenshot-markup.ts");

// ── normalizePt ───────────────────────────────────────────────────────────────

test("normalizePt maps CSS origin to image origin", () => {
  const pt = normalizePt(0, 0, 400, 300, 800, 600);
  assert.deepEqual(pt, { x: 0, y: 0 });
});

test("normalizePt scales proportionally when canvas is half the image size", () => {
  // CSS canvas: 400×300, image natural: 800×600 (2× scale)
  const pt = normalizePt(100, 75, 400, 300, 800, 600);
  assert.deepEqual(pt, { x: 200, y: 150 });
});

test("normalizePt maps CSS bottom-right corner to image bottom-right corner", () => {
  const pt = normalizePt(640, 480, 640, 480, 1280, 960);
  assert.deepEqual(pt, { x: 1280, y: 960 });
});

test("normalizePt handles non-integer CSS positions", () => {
  const pt = normalizePt(0.5, 0.5, 100, 100, 200, 200);
  assert.deepEqual(pt, { x: 1, y: 1 });
});

// ── arrowHeadPoints ───────────────────────────────────────────────────────────

test("arrowHeadPoints returns two points", () => {
  const [w1, w2] = arrowHeadPoints({ x: 0, y: 0 }, { x: 100, y: 0 });
  assert.equal(typeof w1.x, "number");
  assert.equal(typeof w1.y, "number");
  assert.equal(typeof w2.x, "number");
  assert.equal(typeof w2.y, "number");
});

test("arrowHeadPoints wing tips are near the arrowhead tip", () => {
  const from = { x: 0, y: 0 };
  const to = { x: 100, y: 0 };
  const len = 14;
  const [w1, w2] = arrowHeadPoints(from, to, len);
  // Each wing should be within `len` of the tip.
  const dist = (p) => Math.hypot(p.x - to.x, p.y - to.y);
  assert.ok(Math.abs(dist(w1) - len) < 0.001, "w1 distance from tip equals len");
  assert.ok(Math.abs(dist(w2) - len) < 0.001, "w2 distance from tip equals len");
});

test("arrowHeadPoints wings are symmetric around the shaft axis", () => {
  const from = { x: 0, y: 0 };
  const to = { x: 100, y: 0 };
  const [w1, w2] = arrowHeadPoints(from, to);
  // For a horizontal arrow, wings should be symmetric: y values should be +/-.
  assert.ok(Math.abs(w1.y + w2.y) < 0.001, "wing y-offsets are symmetric");
  assert.ok(Math.abs(w1.x - w2.x) < 0.001, "wing x positions are equal");
});

test("arrowHeadPoints respects custom len", () => {
  const from = { x: 0, y: 0 };
  const to = { x: 50, y: 0 };
  const [w1] = arrowHeadPoints(from, to, 20);
  assert.ok(Math.abs(Math.hypot(w1.x - to.x, w1.y - to.y) - 20) < 0.001);
});

test("arrowHeadPoints works for diagonal arrows", () => {
  const from = { x: 0, y: 0 };
  const to = { x: 50, y: 50 };
  const [w1, w2] = arrowHeadPoints(from, to, 14);
  // Both wings exist and differ from the tip.
  assert.notDeepEqual(w1, to);
  assert.notDeepEqual(w2, to);
  // Wings should not be the same point.
  assert.notDeepEqual(w1, w2);
});
