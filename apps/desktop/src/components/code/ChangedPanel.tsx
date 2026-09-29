/**
 * ChangedPanel — "Changed this session" right-side panel (design B).
 *
 * Sources agent-edited files from the active session's ReviewChange records
 * (durable workspace mutation evidence embedded in transcript messages).
 * Per file: name, dir, +/- counts, 'new' badge; selecting a file opens a
 * Monaco DiffEditor vs git HEAD. Keep (dismiss from list) and Revert (git
 * restore or delete, confirmed before execution) actions.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { useAppStore } from "../../stores/app-store";
import { reviewChangesFromMessages } from "../../lib/workspace-review";
import { api } from "../../lib/api";
import { buildMonacoTheme } from "./monaco-theme";
import { cx } from "../ui";

type DiffEntry = {
  /** Workspace-relative path. */
  path: string;
  additions: number;
  deletions: number;
  status: "added" | "modified" | "deleted";
  /** ReviewChange snapshotId — used as stable key. */
  snapshotId: string;
};

// ── File row ─────────────────────────────────────────────────────────────────

function DiffFileRow({
  entry,
  selected,
  dismissed,
  onSelect,
  onDismiss,
  onRevert,
}: {
  entry: DiffEntry;
  selected: boolean;
  dismissed: boolean;
  onSelect: () => void;
  onDismiss: () => void;
  onRevert: () => void;
}) {
  if (dismissed) return null;
  const name = entry.path.split("/").pop() ?? entry.path;
  const dir = entry.path.includes("/")
    ? entry.path.slice(0, entry.path.lastIndexOf("/"))
    : "";

  return (
    <div
      className={cx("changed-file-row", selected && "is-selected")}
      role="option"
      aria-selected={selected}
    >
      <button type="button" className="changed-file-main" onClick={onSelect}>
        <span className="changed-file-name">{name}</span>
        {dir && <span className="changed-file-dir">{dir}</span>}
        <span className="changed-file-stats">
          {entry.additions > 0 && (
            <span className="changed-adds">+{entry.additions}</span>
          )}
          {entry.deletions > 0 && (
            <span className="changed-dels">−{entry.deletions}</span>
          )}
        </span>
        {entry.status === "added" && (
          <span className="changed-badge-new">new</span>
        )}
      </button>
      <div className="changed-file-actions">
        <button
          type="button"
          className="changed-action-btn"
          title="Dismiss from list"
          onClick={onDismiss}
        >
          Keep
        </button>
        <button
          type="button"
          className="changed-action-btn changed-action-revert"
          title="Revert file (destructive)"
          onClick={onRevert}
        >
          Revert
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ChangedPanel({
  monacoTheme,
}: {
  monacoTheme: string;
}) {
  const messages = useAppStore((s) => s.messages);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [confirmRevert, setConfirmRevert] = useState<DiffEntry | null>(null);
  const [originalContent, setOriginalContent] = useState<string>("");
  const [currentContent, setCurrentContent] = useState<string>("");
  const [loadingDiff, setLoadingDiff] = useState(false);
  const themeRef = useRef(monacoTheme);
  themeRef.current = monacoTheme;

  // Derive changed entries from transcript ReviewChanges
  const changes = reviewChangesFromMessages(messages);

  // Deduplicate by path (latest change for each path wins)
  const byPath = new Map<string, DiffEntry>();
  for (const { change } of changes) {
    if (change.state !== "rolledBack") {
      byPath.set(change.path, {
        path: change.path,
        additions: change.additions,
        deletions: change.deletions,
        status: change.status,
        snapshotId: change.snapshotId,
      });
    }
  }
  const entries = Array.from(byPath.values());
  const visible = entries.filter((e) => !dismissed.has(e.snapshotId));

  // Load diff content when selection changes
  useEffect(() => {
    if (!selectedPath) return;
    let cancelled = false;
    setLoadingDiff(true);
    Promise.all([api.gitShow(selectedPath), api.fsRead(selectedPath)]).then(
      ([head, current]) => {
        if (cancelled) return;
        setOriginalContent(head.content ?? "");
        setCurrentContent(
          typeof current.content === "string" ? current.content : "",
        );
        setLoadingDiff(false);
      },
      () => {
        if (!cancelled) setLoadingDiff(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  const handleDismiss = useCallback((snapshotId: string) => {
    setDismissed((prev) => new Set([...prev, snapshotId]));
  }, []);

  const handleRevert = useCallback(async (entry: DiffEntry) => {
    try {
      await api.gitRestore(entry.path, entry.status === "added");
      setDismissed((prev) => new Set([...prev, entry.snapshotId]));
      if (selectedPath === entry.path) setSelectedPath(null);
    } catch {
      // error surfaced to user via alert; keep entry in list
      alert(`Revert failed for ${entry.path}`);
    }
    setConfirmRevert(null);
  }, [selectedPath]);

  const dismissAll = () => {
    setDismissed(new Set(entries.map((e) => e.snapshotId)));
    setSelectedPath(null);
  };

  const revertAll = async () => {
    for (const entry of visible) {
      try {
        await api.gitRestore(entry.path, entry.status === "added");
      } catch {
        // continue reverting remaining files
      }
    }
    dismissAll();
  };

  return (
    <aside className="code-changed-panel" aria-label="Changed this session">
      <div className="changed-header">
        <span className="changed-title">Changed this session</span>
        {visible.length > 0 && (
          <div className="changed-bulk-actions">
            <button type="button" className="changed-action-btn" onClick={dismissAll}>
              Keep all
            </button>
            <button
              type="button"
              className="changed-action-btn changed-action-revert"
              onClick={() => void revertAll()}
            >
              Revert all
            </button>
          </div>
        )}
      </div>

      <div className="changed-file-list" role="listbox" aria-label="Changed files">
        {visible.length === 0 ? (
          <p className="changed-empty">No agent changes in this session.</p>
        ) : (
          visible.map((entry) => (
            <DiffFileRow
              key={entry.snapshotId}
              entry={entry}
              selected={selectedPath === entry.path}
              dismissed={false}
              onSelect={() => setSelectedPath(entry.path)}
              onDismiss={() => handleDismiss(entry.snapshotId)}
              onRevert={() => setConfirmRevert(entry)}
            />
          ))
        )}
      </div>

      {selectedPath && (
        <div className="changed-diff-area">
          {loadingDiff ? (
            <div className="changed-diff-loading">Loading diff…</div>
          ) : (
            <DiffEditor
              original={originalContent}
              modified={currentContent}
              theme={monacoTheme}
              beforeMount={(monaco) => {
                buildMonacoTheme(monaco);
              }}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
            />
          )}
        </div>
      )}

      {confirmRevert && (
        <div className="changed-confirm-overlay" role="dialog" aria-modal>
          <div className="changed-confirm-dialog">
            <p className="changed-confirm-msg">
              Revert <strong>{confirmRevert.path.split("/").pop()}</strong>?
              {confirmRevert.status === "added"
                ? " This will permanently delete the file."
                : " This will discard all edits since the last git commit."}
            </p>
            <div className="changed-confirm-actions">
              <button
                type="button"
                className="changed-action-btn"
                onClick={() => setConfirmRevert(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="changed-action-btn changed-action-revert"
                onClick={() => void handleRevert(confirmRevert)}
              >
                Confirm Revert
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
