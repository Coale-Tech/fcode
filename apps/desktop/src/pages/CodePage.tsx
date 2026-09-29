/**
 * Code tab — full IDE surface (design A+B+C combined, fcode 0.15.7-fcode.3 L7).
 *
 * A: left 256px sidebar (Files | DocTypes toggle) + nested file tree + Monaco
 *    editor island (tabs, breadcrumb, status bar). Cmd+S saves.
 * B: right "Changed this session" panel (ReviewChange records), toggled from
 *    editor toolbar. DiffEditor vs git HEAD, Keep/Revert per file.
 * C: DocType browser grouped app→module→DocType, migrate badge + Run migrate
 *    button wired to benchRun. Opens Schema/Controller/FormJS/Tests sub-tabs.
 * Cmd+P: quick-open palette over files + doctypes.
 *
 * Monaco is loaded fully offline: loader.config({ monaco }) + EditorWorker
 * prevents any cdn.jsdelivr.net request blocked by the app's CSP.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { DiffEditor, loader } from "@monaco-editor/react";
import * as monacoNS from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import type { FsIndexEntry, FsIndexResult } from "@pi-desktop/shared";
import { buildMonacoTheme } from "../components/code/monaco-theme";
import { FileTree } from "../components/code/FileTree";
import { ChangedPanel } from "../components/code/ChangedPanel";
import { DocTypeTree } from "../components/code/DocTypeTree";
import { api } from "../lib/api";
import { cx } from "../components/ui";

// ── Monaco offline setup (module-level, runs once) ────────────────────────────
// Prevents any cdn.jsdelivr.net request that the app's CSP would block.
if (typeof self !== "undefined") {
  // Monaco requires MonacoEnvironment on globalThis; one-off assignment, cast via unknown.
  (self as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = {
    getWorker: () => new EditorWorker() as Worker,
  };
}
loader.config({ monaco: monacoNS });

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_OPEN_FILES = 8;
const FS_INDEX_MAX_ENTRIES = 8000;

// ── Types ─────────────────────────────────────────────────────────────────────
type SidebarTab = "files" | "doctypes";

interface OpenFile {
  path: string;
  content: string;
  mtimeMs: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function addToLRU(list: string[], path: string): string[] {
  const without = list.filter((p) => p !== path);
  const updated = [path, ...without];
  return updated.length > MAX_OPEN_FILES ? updated.slice(0, MAX_OPEN_FILES) : updated;
}

function extToLanguage(path: string): string {
  const ext = path.split(".").pop() ?? "";
  const map: Record<string, string> = {
    py: "python", js: "javascript", ts: "typescript", tsx: "typescript",
    jsx: "javascript", json: "json", html: "html", css: "css",
    md: "markdown", txt: "plaintext", sh: "shell", yaml: "yaml", yml: "yaml",
    toml: "toml", ini: "ini", sql: "sql", rs: "rust",
  };
  return map[ext] ?? "plaintext";
}

// ── CmdPalette ────────────────────────────────────────────────────────────────

function CmdPalette({
  entries,
  onOpen,
  onClose,
}: {
  entries: FsIndexEntry[];
  onOpen: (path: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const lower = query.toLowerCase();
  const filtered = entries
    .filter((e) => e.kind === "file" && (!lower || e.path.toLowerCase().includes(lower)))
    .slice(0, 50);

  return (
    <div className="cmdpalette-overlay" role="dialog" aria-modal aria-label="Quick open">
      <div className="cmdpalette-box">
        <input
          ref={inputRef}
          type="search"
          className="cmdpalette-input"
          placeholder="Go to file…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered[0]) { onOpen(filtered[0].path); onClose(); }
          }}
        />
        <ul className="cmdpalette-list" role="listbox">
          {filtered.map((e) => {
            const name = e.path.split("/").pop() ?? e.path;
            return (
              <li key={e.path} role="option">
                <button
                  type="button"
                  className="cmdpalette-item"
                  onClick={() => { onOpen(e.path); onClose(); }}
                >
                  <span className="cmdpalette-name">{name}</span>
                  <span className="cmdpalette-path">{e.path}</span>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && <li className="cmdpalette-empty">No files match.</li>}
        </ul>
      </div>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export function CodePage() {
  // ── Sidebar ──────────────────────────────────────────────────────────────
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("files");

  // ── File index ────────────────────────────────────────────────────────────
  const [index, setIndex] = useState<FsIndexResult | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);

  // ── Open files (LRU tab strip) ────────────────────────────────────────────
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const fileCache = useRef<Record<string, OpenFile>>({});
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Conflict detection ────────────────────────────────────────────────────
  const [diskChanged, setDiskChanged] = useState(false);
  const [diskContent, setDiskContent] = useState<string | null>(null);
  const [showConflictDiff, setShowConflictDiff] = useState(false);

  // ── Monaco theme ──────────────────────────────────────────────────────────
  const [monacoTheme, setMonacoTheme] = useState("vs-dark");
  useEffect(() => {
    const obs = new MutationObserver(() => {
      // Force beforeMount to re-run on next render to re-register theme
      setMonacoTheme((prev) => (prev === "fcode-dark" ? "fcode-dark-r" : "fcode-dark"));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  // ── Status bar ────────────────────────────────────────────────────────────
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number } | null>(null);
  const [branch, setBranch] = useState<string | null>(null);

  // ── Panels ────────────────────────────────────────────────────────────────
  const [showChanged, setShowChanged] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  // ── Load file index ───────────────────────────────────────────────────────
  const loadIndex = useCallback(async () => {
    try {
      const result = await api.fsIndex();
      setIndex(result);
      setIndexError(null);
    } catch (err) {
      setIndexError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { void loadIndex(); }, [loadIndex]);

  // ── Load git branch (cheaply) ─────────────────────────────────────────────
  useEffect(() => {
    api.gitBranch().then((r) => setBranch(r.branch)).catch(() => {});
  }, []);

  // ── File open ────────────────────────────────────────────────────────────
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
    setSaveError(null);
    setShowConflictDiff(false);
  }, []);

  // ── Disk-change polling ───────────────────────────────────────────────────
  useEffect(() => {
    if (!activePath) return;
    const interval = setInterval(async () => {
      try {
        const result = await api.fsRead(activePath);
        const newMtime = result.mtimeMs ?? 0;
        const cached = fileCache.current[activePath];
        if (!cached || newMtime === cached.mtimeMs) return;
        const newContent = typeof result.content === "string" ? result.content : "";
        fileCache.current[activePath] = { ...cached, mtimeMs: newMtime };
        if (activePath in dirty) {
          setDiskChanged(true);
          setDiskContent(newContent);
        } else {
          fileCache.current[activePath] = { ...cached, content: newContent, mtimeMs: newMtime };
        }
      } catch { /* ignore transient errors */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [activePath, dirty]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const saveFile = useCallback(async () => {
    if (!activePath) return;
    const content = dirty[activePath] ?? fileCache.current[activePath]?.content ?? "";
    const expectedMtimeMs = fileCache.current[activePath]?.mtimeMs;
    setSaving(true);
    try {
      const result = await api.fsWrite(activePath, content, expectedMtimeMs);
      fileCache.current[activePath] = { path: activePath, content, mtimeMs: result.mtimeMs };
      setDirty((prev) => { const n = { ...prev }; delete n[activePath]; return n; });
      setDiskChanged(false);
      setDiskContent(null);
      setSaveError(null);
    } catch (error) {
      if ((error as { code?: string }).code === "CONFLICT") {
        const fresh = await api.fsRead(activePath).catch(() => null);
        if (fresh && typeof fresh.content === "string") {
          fileCache.current[activePath] = { path: activePath, content: fresh.content, mtimeMs: fresh.mtimeMs ?? 0 };
          setDiskChanged(true);
          setDiskContent(fresh.content);
          setSaveError(null);
        }
      } else {
        setSaveError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setSaving(false);
    }
  }, [activePath, dirty]);

  // ── Conflict resolution ───────────────────────────────────────────────────
  const keepMine = useCallback(() => {
    setDiskChanged(false); setShowConflictDiff(false); setDiskContent(null);
  }, []);

  const takeTheirs = useCallback(() => {
    if (!activePath || !diskContent) return;
    const cached = fileCache.current[activePath];
    if (cached) fileCache.current[activePath] = { ...cached, content: diskContent };
    setDirty((prev) => { const n = { ...prev }; delete n[activePath]; return n; });
    setDiskChanged(false); setDiskContent(null); setShowConflictDiff(false);
  }, [activePath, diskContent]);

  // ── Close tab ─────────────────────────────────────────────────────────────
  const closeTab = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const next = prev.filter((p) => p !== path);
      if (activePath === path) setActivePath(next[0] ?? null);
      return next;
    });
    delete fileCache.current[path];
    setDirty((prev) => { const n = { ...prev }; delete n[path]; return n; });
  }, [activePath]);

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "p") { e.preventDefault(); setShowPalette((v) => !v); }
      if (mod && e.key === "s") { e.preventDefault(); void saveFile(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveFile]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeContent = activePath && activePath in dirty
    ? dirty[activePath]
    : (fileCache.current[activePath ?? ""]?.content ?? "");

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!activePath) return;
    setDirty((prev) => {
      const original = fileCache.current[activePath]?.content ?? "";
      if (value === original) { const n = { ...prev }; delete n[activePath]; return n; }
      return { ...prev, [activePath]: value ?? "" };
    });
  }, [activePath]);

  const breadcrumbs = activePath?.split("/") ?? [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="page-frame code-page" aria-label="Code">
      {/* 256px sidebar */}
      <aside className="code-sidebar" aria-label="Code sidebar">
        <div className="code-sidebar-toggle" role="tablist" aria-label="Sidebar view">
          <button
            type="button"
            role="tab"
            className={cx("code-sidebar-tab", sidebarTab === "files" && "is-active")}
            aria-selected={sidebarTab === "files"}
            onClick={() => setSidebarTab("files")}
          >
            Files
          </button>
          <button
            type="button"
            role="tab"
            className={cx("code-sidebar-tab", sidebarTab === "doctypes" && "is-active")}
            aria-selected={sidebarTab === "doctypes"}
            onClick={() => setSidebarTab("doctypes")}
          >
            DocTypes
          </button>
        </div>

        {sidebarTab === "files" ? (
          indexError ? (
            <div className="code-tree-error" role="alert">
              <p>Could not load file tree: {indexError}</p>
              <button type="button" onClick={() => void loadIndex()}>Retry</button>
            </div>
          ) : !index ? (
            <p className="code-tree-loading" role="status" aria-live="polite">Loading files…</p>
          ) : (
            <>
              {index.truncated && (
                <div className="code-truncation-banner" role="status">
                  File tree truncated at {FS_INDEX_MAX_ENTRIES.toLocaleString()} entries.
                </div>
              )}
              <FileTree
                entries={index.entries}
                activePath={activePath}
                onSelect={(path) => void openFile(path)}
              />
            </>
          )
        ) : (
          <DocTypeTree onOpen={(path) => void openFile(path)} />
        )}
      </aside>

      {/* Editor island on a canvas background */}
      <div className="code-editor-column">
        <div className="code-editor-canvas">
          <div className="code-editor-island island">
            {/* Tab strip */}
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
                        title={path}
                      >
                        {name}
                        {isDirty && <span className="code-tab-dot" aria-label="unsaved" />}
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
                <div className="code-tabs-toolbar">
                  <button
                    type="button"
                    className={cx("code-toolbar-btn", showChanged && "is-active")}
                    onClick={() => setShowChanged((v) => !v)}
                    title="Changed this session"
                    aria-pressed={showChanged}
                  >
                    Changed
                  </button>
                </div>
              </div>
            )}

            {/* Conflict bar */}
            {diskChanged && (
              <div className="code-conflict-bar" role="alert" aria-live="assertive">
                <span>File changed on disk while you have unsaved edits.</span>
                <button type="button" onClick={keepMine}>Keep mine</button>
                <button type="button" onClick={takeTheirs}>Take theirs</button>
                <button type="button" onClick={() => setShowConflictDiff((v) => !v)}>
                  {showConflictDiff ? "Hide diff" : "Diff"}
                </button>
              </div>
            )}

            {saveError && !diskChanged && (
              <div className="code-save-error" role="alert">
                <span>Save failed: {saveError}</span>
                <button type="button" onClick={() => void saveFile()}>Retry</button>
              </div>
            )}

            {/* Breadcrumb */}
            {activePath && (
              <div className="code-breadcrumb" aria-label="File path">
                {breadcrumbs.map((seg, i) => (
                  <span key={i} className="code-breadcrumb-seg">
                    {i > 0 && <span className="code-breadcrumb-sep" aria-hidden>/</span>}
                    {seg}
                  </span>
                ))}
              </div>
            )}

            {/* Editor */}
            <div className="code-editor-area">
              {activePath ? (
                showConflictDiff && diskChanged ? (
                  <DiffEditor
                    original={diskContent ?? ""}
                    modified={activeContent}
                    theme={monacoTheme}
                    beforeMount={(monaco) => {
                      const name = buildMonacoTheme(monaco);
                      setMonacoTheme(name);
                    }}
                    options={{ readOnly: true, minimap: { enabled: false }, scrollBeyondLastLine: false, fontFamily: "var(--font-mono)" }}
                  />
                ) : (
                  <Editor
                    path={activePath}
                    value={activeContent}
                    theme={monacoTheme}
                    language={extToLanguage(activePath)}
                    beforeMount={(monaco) => {
                      const name = buildMonacoTheme(monaco);
                      setMonacoTheme(name);
                    }}
                    onMount={(editor) => {
                      editor.onDidChangeCursorPosition((e) => {
                        setCursorPos({ line: e.position.lineNumber, col: e.position.column });
                      });
                    }}
                    onChange={handleEditorChange}
                    options={{ minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: "on", fontFamily: "var(--font-mono)", fontSize: 13 }}
                  />
                )
              ) : (
                <div className="code-empty">
                  <p>Select a file, or press <kbd>⌘P</kbd> to quick-open.</p>
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className="code-status-bar" aria-label="Editor status">
              {branch && <span className="code-status-branch">⎇ {branch}</span>}
              {activePath && cursorPos && (
                <span className="code-status-pos">Ln {cursorPos.line}, Col {cursorPos.col}</span>
              )}
              {activePath && (
                <span className="code-status-lang">{extToLanguage(activePath)}</span>
              )}
              {activePath && activePath in dirty && !diskChanged && (
                <button
                  type="button"
                  className="code-save-btn"
                  onClick={() => void saveFile()}
                  disabled={saving}
                  title="Save (⌘S)"
                >
                  {saving ? "Saving…" : "● Save"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Changed this session panel (B) */}
      {showChanged && <ChangedPanel monacoTheme={monacoTheme} />}

      {/* Cmd+P palette */}
      {showPalette && (
        <CmdPalette
          entries={index?.entries ?? []}
          onOpen={(path) => void openFile(path)}
          onClose={() => setShowPalette(false)}
        />
      )}
    </main>
  );
}
