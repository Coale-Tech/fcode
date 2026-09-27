/**
 * Code tab entry point (T2 seam stub).
 *
 * Agent U (shell-tabs) builds the Monaco editor, the LRU open-files strip
 * and save-conflict handling into this shell. Keep the `<main>` landmark
 * when extending: keyboard users must land on a labelled main when switching
 * to this page. The file tree uses the existing fs-index channel; the editor
 * writes through the new `pi-desktop/fs/write` channel (E6/DX14).
 *
 * The 8000-entry truncation banner (E22) belongs in the file tree section,
 * not here at the root.
 */
export function CodePage() {
  return (
    <main className="page-frame code-page" aria-label="Code">
      <h1 className="page-header">Code</h1>
    </main>
  );
}
