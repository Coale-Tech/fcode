/**
 * Code tab — Monaco editor over the active workspace (E22, T11).
 *
 * E22: shows a truncation banner when getWorkspaceFileIndex hits the 8 000-entry
 * cap so users know the tree is partial, not exhaustive.
 *
 * T11: adds an LRU open-files strip (max 8), full Monaco editor integration, and
 * an on-disk conflict bar for dirty files changed by the agent or file system
 * while the editor holds unsaved edits.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import type { FsIndexEntry, FsIndexResult } from "@pi-desktop/shared";
import { IPC } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { cx } from "../components/ui";

/**
 * Mirrors main-process FS_INDEX_MAX_ENTRIES so the banner can quote the right
 * number without importing from the main-process module tree.
 */
const FS_INDEX_MAX_ENTRIES = 8000;

/** Max files in the LRU open-files strip (T11). */
const MAX_OPEN_FILES = 8;

type DirtyMap = Record<string, string>; // path → editor content

interface OpenFile {
  path: string;
  content: string;
  /** mtimeMs when we last fetched from disk — used for conflict detection. */
  mtimeMs: number;
}

/** Add path to LRU list, evicting the oldest when MAX_OPEN_FILES is exceeded. */
function addToLRU(list: string[], path: string): string[] {
  const without = list.filter((p) => p !== path);
  const updated = [path, ...without];
  return updated.length > MAX_OPEN_FILES ? updated.slice(0, MAX_OPEN_FILES) : updated;
}

export function CodePage() {
  // ── file tree ──────────────────────────────────────────────────────────────
  const [index, setIndex] = useState<FsIndexResult | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);

  // ── open-files LRU strip (T11) ─────────────────────────────────────────────
  /** Ordered list of open file paths: most-recently-used first. */
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  /** Active (visible) file path. */
  const [activePath, setActivePath] = useState<string | null>(null);
  /** Cached file contents keyed by path. */
  const fileCache = useRef<Record<string, OpenFile>>({});
  /** Dirty editor content (unsaved) keyed by path. */
  const [dirty, setDirty] = useState<DirtyMap>({});
  /** True when the disk file changed while the current file is dirty (T11). */
  const [diskChanged, setDiskChanged] = useState(false);
  /** Updated disk content when a conflict is detected. */
  const [diskContent, setDiskContent] = useState<string | null>(null);

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

  // ── file loading ───────────────────────────────────────────────────────────
  const openFile = useCallback(async (path: string) => {
    if (!(path in fileCache.current)) {
      try {
        const result = await api.fsRead(path);
        fileCache.current[path] = {
          path,
          content: typeof result.content === "string" ? result.content : "",
          mtimeMs: result.mtimeMs ?? 0,
        };
      } catch {
        fileCache.current[path] = { path, content: "", mtimeMs: 0 };
      }
    }
    setOpenFiles((prev) => addToLRU(prev, path));
    setActivePath(path);
    setDiskChanged(false);
    setDiskContent(null);
  }, []);

  // ── disk-change polling (T11) ──────────────────────────────────────────────
  // Poll every 2 s to detect external edits (e.g. agent edits the active file).
  useEffect(() => {
    if (!activePath) return;

    const interval = setInterval(async () => {
      try {
        const result = await api.fsRead(activePath);
        const newMtime = result.mtimeMs ?? 0;
        const cached = fileCache.current[activePath];
        if (!cached) return;

        const isDirty = activePath in dirty;
        if (newMtime !== cached.mtimeMs) {
          const newContent =
            typeof result.content === "string" ? result.content : "";
          // Update cached mtime so we don't re-trigger on the same change.
          fileCache.current[activePath] = { ...cached, mtimeMs: newMtime };
          if (isDirty) {
            // Conflict: user has unsaved edits AND disk changed.
            setDiskChanged(true);
            setDiskContent(newContent);
          } else {
            // Clean file — silent reload.
            fileCache.current[activePath] = {
              ...cached,
              content: newContent,
              mtimeMs: newMtime,
            };
            setDirty((prev) => {
              const next = { ...prev };
              delete next[activePath];
              return next;
            });
          }
        }
      } catch {
        // Ignore transient read errors.
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activePath, dirty]);

  // ── save (T11) ─────────────────────────────────────────────────────────────
  const saveFile = useCallback(async () => {
    if (!activePath) return;
    const content = dirty[activePath] ?? fileCache.current[activePath]?.content ?? "";
    try {
      await window.piDesktop?.invoke(IPC.invoke.fsWrite, { path: activePath, content });
      const result = await api.fsRead(activePath);
      const cached = fileCache.current[activePath];
      if (cached) {
        fileCache.current[activePath] = {
          ...cached,
          content,
          mtimeMs: result.mtimeMs ?? 0,
        };
      }
      setDirty((prev) => {
        const next = { ...prev };
        delete next[activePath];
        return next;
      });
      setDiskChanged(false);
      setDiskContent(null);
    } catch {
      // TODO: surface save error to user
    }
  }, [activePath, dirty]);

  // ── conflict resolution (T11) ──────────────────────────────────────────────
  const keepMine = useCallback(() => {
    setDiskChanged(false);
    setDiskContent(null);
  }, []);

  const takeTheirs = useCallback(() => {
    if (!activePath || !diskContent) return;
    const cached = fileCache.current[activePath];
    if (cached) {
      fileCache.current[activePath] = { ...cached, content: diskContent };
    }
    setDirty((prev) => {
      const next = { ...prev };
      delete next[activePath];
      return next;
    });
    setDiskChanged(false);
    setDiskContent(null);
  }, [activePath, diskContent]);

  // ── close tab ──────────────────────────────────────────────────────────────
  const closeTab = useCallback(
    (path: string) => {
      setOpenFiles((prev) => {
        const next = prev.filter((p) => p !== path);
        if (activePath === path) {
          setActivePath(next[0] ?? null);
        }
        return next;
      });
      delete fileCache.current[path];
      setDirty((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
    },
    [activePath],
  );

  const activeFile = activePath ? fileCache.current[activePath] : null;
  const activeContent =
    activePath && activePath in dirty
      ? dirty[activePath]
      : (activeFile?.content ?? "");

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!activePath) return;
      setDirty((prev) => {
        const original = fileCache.current[activePath]?.content ?? "";
        if (value === original) {
          const next = { ...prev };
          delete next[activePath];
          return next;
        }
        return { ...prev, [activePath]: value ?? "" };
      });
    },
    [activePath],
  );

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
              onSelect={(path) => void openFile(path)}
            />
          </>
        )}
      </aside>

      <div className="code-editor-column">
        {/* ── LRU open-files tab strip (T11) ─────────────────────────────── */}
        {openFiles.length > 0 && (
          <div className="code-tabs" role="tablist" aria-label="Open files">
            {openFiles.map((path) => {
              const name = path.split("/").pop() ?? path;
              const isDirty = path in dirty;
              return (
                <div
                  key={path}
                  role="tab"
                  aria-selected={path === activePath}
                  className={cx("code-tab", path === activePath && "is-active")}
                >
                  <button
                    type="button"
                    className="code-tab-label"
                    onClick={() => void openFile(path)}
                  >
                    {isDirty ? `${name} ●` : name}
                  </button>
                  <button
                    type="button"
                    className="code-tab-close"
                    aria-label={`Close ${name}`}
                    onClick={() => closeTab(path)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── conflict bar (T11) ─────────────────────────────────────────── */}
        {diskChanged && (
          <div
            className="code-conflict-bar"
            role="alert"
            aria-live="assertive"
          >
            <span>File changed on disk while you have unsaved edits.</span>
            <button type="button" onClick={keepMine}>
              Keep mine
            </button>
            <button type="button" onClick={takeTheirs}>
              Take theirs
            </button>
          </div>
        )}

        {/* ── Monaco editor (T11) ────────────────────────────────────────── */}
        <section className="code-editor-area">
          {activePath ? (
            <>
              <div className="code-editor-actions">
                {activePath in dirty && (
                  <button
                    type="button"
                    className="code-save-btn"
                    onClick={() => void saveFile()}
                  >
                    Save
                  </button>
                )}
              </div>
              <Editor
                path={activePath}
                value={activeContent}
                onChange={handleEditorChange}
                options={{
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  fontFamily: "var(--font-mono)",
                }}
              />
            </>
          ) : (
            <div className="code-empty">
              <p>Select a file from the tree to open it.</p>
            </div>
          )}
        </section>
      </div>
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
