/**
 * Bench cockpit entry point (T14 seam stub).
 *
 * Agent N (bench-cockpit) builds the master-detail bench list, the
 * sites/processes panel and the log stream into this shell. Keep the
 * landmark and heading when replacing this body: a keyboard user must still
 * land on a labelled `<main>` when switching to this page. Once the bench
 * list exists, give it roving tabindex (one stop for the whole list, arrow
 * keys move the active row) instead of one tab stop per bench.
 */
export function BenchPage() {
  return (
    <main className="page-frame bench-page" aria-label="Bench">
      <h1 className="page-header">Bench</h1>
    </main>
  );
}
