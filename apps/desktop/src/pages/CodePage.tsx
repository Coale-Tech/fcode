/**
 * Code tab — Monaco editor over the active workspace (E22, T11).
 *
 * E22: shows a truncation banner when getWorkspaceFileIndex hits the 8 000-entry
 * cap so users know the tree is partial, not exhaustive.
 *
 * T11 extends this file with an LRU open-files strip (max 8), full Monaco editor
 * integration and an on-disk conflict bar for dirty files changed by the agent.
 */
import { useCallback, useEffect, useState } from "react";
import type { FsIndexEntry, FsIndexResult } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { cx } from "../components/ui";

/**
 * Mirrors main-process FS_INDEX_MAX_ENTRIES so the banner can quote the right
 * number without importing from the main-process module tree.
 */
const FS_INDEX_MAX_ENTRIES = 8000;

export function CodePage() {
  const [index, setIndex] = useState<FsIndexResult | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);

  const loadIndex = useCallback(async () => {
    try {
      const result = await api.fsIndex();
      setIndex(result);
      setIndexError(null);
    } catch (err) {
      setIndexError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadIndex();
  }, [loadIndex]);

  return (
    <main className="page-frame code-page" aria-label="Code">
      <aside className="code-tree" aria-label="File tree">
        {indexError ? (
          <p className="code-tree-error" role="alert">
            Could not load file tree: {indexError}.{" "}
            <button type="button" onClick={() => void loadIndex()}>
              Retry
            </button>
          </p>
        ) : !index ? (
          <p className="code-tree-loading" role="status" aria-live="polite">
            Loading files…
          </p>
        ) : (
          <>
            {/*
             * E22: truncation banner — never silently show a partial tree as if
             * it were complete. See fs-index.ts FS_INDEX_MAX_ENTRIES = 8000.
             */}
            {index.truncated && (
              <div
                className="code-truncation-banner"
                role="status"
                aria-live="polite"
              >
                File tree truncated at {FS_INDEX_MAX_ENTRIES.toLocaleString()}{" "}
                entries. Open a narrower folder or search to find deeper files.
              </div>
            )}
            <FileTree
              entries={index.entries}
              activePath={activePath}
              onSelect={setActivePath}
            />
          </>
        )}
      </aside>

      <section className="code-editor-area">
        {activePath ? (
          <p className="code-editor-placeholder">
            {/* T11 replaces this placeholder with the Monaco editor. */}
            Selected: {activePath}
          </p>
        ) : (
          <div className="code-empty">
            <p>Select a file from the tree to open it.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function FileTree({
  entries,
  activePath,
  onSelect,
}: {
  entries: FsIndexEntry[];
  activePath: string | null;
  onSelect: (path: string) => void;
}) {
  if (entries.length === 0) {
    return <p className="code-tree-empty">No files in this workspace.</p>;
  }

  return (
    <ul className="code-tree-list" role="tree" aria-label="Workspace files">
      {entries.map((entry) => (
        <li
          key={entry.path}
          role="treeitem"
          aria-selected={entry.path === activePath}
          className={cx(
            "code-tree-item",
            `code-tree-${entry.kind}`,
            entry.path === activePath && "is-active",
          )}
        >
          {entry.kind === "file" ? (
            <button
              type="button"
              className="code-tree-item-btn"
              onClick={() => onSelect(entry.path)}
            >
              {entry.path.split("/").pop()}
            </button>
          ) : (
            <span className="code-tree-item-dir">
              {entry.path.split("/").pop()}/
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
