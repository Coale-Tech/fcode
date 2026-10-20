/**
 * Pure geometry and encoding helpers for the screenshot markup editor.
 * No DOM/Electron imports; importable from tests and the renderer.
 */

export type Point = { x: number; y: number };

/**
 * Normalize a pointer position from CSS display-space (as reported by pointer
 * events on the canvas element) to the canvas's natural image-pixel space.
 */
export function normalizePt(
  cssX: number,
  cssY: number,
  cssWidth: number,
  cssHeight: number,
  imgNatWidth: number,
  imgNatHeight: number,
): Point {
  return {
    x: (cssX / cssWidth) * imgNatWidth,
    y: (cssY / cssHeight) * imgNatHeight,
  };
}

/**
 * Compute the two arrowhead wing-points for a line drawn from `from` to `to`.
 * Returns [leftWing, rightWing] in the same pixel space as the inputs.
 *
 * @param len - Wing length in pixels (default 14)
 * @param angle - Half-angle of the arrowhead in radians (default π/6 = 30°)
 */
export function arrowHeadPoints(
  from: Point,
  to: Point,
  len = 14,
  angle = Math.PI / 6,
): [Point, Point] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const theta = Math.atan2(dy, dx);
  return [
    {
      x: to.x - len * Math.cos(theta - angle),
      y: to.y - len * Math.sin(theta - angle),
    },
    {
      x: to.x - len * Math.cos(theta + angle),
      y: to.y - len * Math.sin(theta + angle),
    },
  ];
}
