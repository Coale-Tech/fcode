/**
 * Build tab entry point (T14 seam stub).
 *
 * Agent U (shell-tabs) builds the Studio/Builder control strip and the
 * embedded `WebContentsView` canvas into this shell. When the canvas
 * mounts, announce focus entry through an `aria-live="polite"` region (T14
 * verify: "entering the canvas is announced") instead of a silent
 * WebContentsView takeover, and return focus to the control strip on
 * dialog close.
 */
export function BuildPage() {
  return (
    <main className="page-frame build-page" aria-label="Build">
      <h1 className="page-header">Build</h1>
    </main>
  );
}
