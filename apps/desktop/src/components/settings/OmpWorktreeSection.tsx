/**
 * Agent-managed git worktrees — reads ~/.omp/wt/ via the ompWorktreeList IPC
 * channel (same classification logic as `omp worktree list`).
 *
 * Actions (T7):
 *  - Clear: remove a specific worktree (refuses dirty unless force is ticked)
 *  - Prune All: prune orphaned (empty/stray) worktrees
 *  - Add: create a new worktree for a repo + branch
 */
import { useEffect, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpWorktreeEntry } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Badge, Button } from "../ui";
import { SettingsCard } from "../../features/settings/primitives";
import { DestructiveActionDialog } from "../DestructiveActionDialog";

type State = { worktrees: OmpWorktreeEntry[] | null; error: boolean };
type Action =
  | { type: "loaded"; worktrees: OmpWorktreeEntry[] }
  | { type: "error" }
  | { type: "reload" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "loaded": return { worktrees: action.worktrees, error: false };
    case "error":  return { worktrees: null, error: true };
    case "reload": return { ...state, error: false };
  }
}

export function OmpWorktreeSection() {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(reducer, { worktrees: null, error: false });
  const [pendingClear, setPendingClear] = useState<OmpWorktreeEntry | null>(null);
  const [clearForce, setClearForce] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [pendingPrune, setPendingPrune] = useState(false);
  const [pruneForce, setPruneForce] = useState(false);
  const [pruneError, setPruneError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addRepoPath, setAddRepoPath] = useState("");
  const [addBranch, setAddBranch] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const load = () => {
    dispatch({ type: "reload" });
    api
      .ompWorktreeList()
      .then((res) => dispatch({ type: "loaded", worktrees: res.worktrees }))
      .catch(() => dispatch({ type: "error" }));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const kindLabel = (kind: OmpWorktreeEntry["kind"]): string => {
    switch (kind) {
      case "pr-checkout": return t("settings.ompWorktreesKindPr");
      case "task-isolation": return t("settings.ompWorktreesKindTask");
      case "empty": return t("settings.ompWorktreesKindEmpty");
      case "stray": return t("settings.ompWorktreesKindStray");
      default: return kind;
    }
  };

  const handleClearConfirm = () => {
    if (!pendingClear) return;
    const wt = pendingClear;
    setPendingClear(null);
    setClearError(null);
    api.ompWorktreeClear(wt.path, clearForce).then((res) => {
      if (res.ok) {
        load();
      } else if (res.error === "dirty") {
        setClearError(t("settings.ompWorktreeDirtyRefuse"));
      } else {
        setClearError(t("settings.ompWorktreeClearError", { path: wt.path, error: res.error ?? "" }));
      }
    }).catch((e: unknown) => {
      setClearError(t("settings.ompWorktreeClearError", { path: wt.path, error: String(e) }));
    });
  };

  const handlePruneConfirm = () => {
    setPendingPrune(false);
    setPruneError(null);
    api.ompWorktreePrune(pruneForce).then((res) => {
      if (res.ok) {
        load();
      } else {
        const hasDirty = res.error?.includes("dirty:") ?? false;
        if (hasDirty && !pruneForce) {
          setPruneError(t("settings.ompWorktreeDirtyRefuse"));
        } else {
          setPruneError(t("settings.ompWorktreePruneError", { error: res.error ?? "" }));
        }
      }
    }).catch((e: unknown) => {
      setPruneError(t("settings.ompWorktreePruneError", { error: String(e) }));
    });
  };

  const handleAdd = () => {
    const repo = addRepoPath.trim();
    const branch = addBranch.trim();
    if (!repo || !branch) return;
    setAddBusy(true);
    setAddError(null);
    api.ompWorktreeAdd(repo, branch).then((res) => {
      setAddBusy(false);
      if (res.ok) {
        setShowAdd(false);
        setAddRepoPath("");
        setAddBranch("");
        load();
      } else {
        setAddError(t("settings.ompWorktreeAddError", { error: res.error ?? "" }));
      }
    }).catch((e: unknown) => {
      setAddBusy(false);
      setAddError(t("settings.ompWorktreeAddError", { error: String(e) }));
    });
  };

  if (state.error) {
    return (
      <SettingsCard title={t("settings.ompWorktreesGroup")}>
        <p className="settings-row-desc">{t("settings.ompWorktreesError")}</p>
      </SettingsCard>
    );
  }
  if (!state.worktrees) {
    return (
      <SettingsCard title={t("settings.ompWorktreesGroup")}>
        <p className="settings-row-desc">{t("common.loading")}</p>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard title={t("settings.ompWorktreesGroup")}>
      {/* Actions bar */}
      <div className="omp-worktree-actions">
        <Button
          type="button"
          size="sm"
          onClick={() => setShowAdd((v) => !v)}
        >
          {t("settings.ompWorktreeAdd")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => { setPendingPrune(true); setPruneForce(false); setPruneError(null); }}
          disabled={state.worktrees.length === 0}
        >
          {t("settings.ompWorktreePrune")}
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="omp-worktree-add-form">
          <input
            type="text"
            className="settings-input"
            placeholder={t("settings.ompWorktreeAddRepoPath")}
            value={addRepoPath}
            onChange={(e) => setAddRepoPath(e.target.value)}
          />
          <input
            type="text"
            className="settings-input"
            placeholder={t("settings.ompWorktreeAddBranch")}
            value={addBranch}
            onChange={(e) => setAddBranch(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={handleAdd}
            disabled={addBusy || !addRepoPath.trim() || !addBranch.trim()}
          >
            {t("settings.ompWorktreeAddSubmit")}
          </Button>
          {addError && <p className="settings-row-desc text-warning">{addError}</p>}
        </div>
      )}

      {/* Prune error */}
      {pruneError && (
        <div className="omp-worktree-error" role="alert">
          <p className="settings-row-desc">{pruneError}</p>
          <label className="omp-worktree-force-label">
            <input
              type="checkbox"
              checked={pruneForce}
              onChange={(e) => setPruneForce(e.target.checked)}
            />
            {" "}{t("settings.ompWorktreeForce")}
          </label>
          <Button
            type="button"
            size="sm"
            onClick={() => { setPendingPrune(true); }}
          >
            {t("settings.ompWorktreeRetry")}
          </Button>
        </div>
      )}

      {/* Clear error */}
      {clearError && (
        <div className="omp-worktree-error" role="alert">
          <p className="settings-row-desc">{clearError}</p>
          {clearError === t("settings.ompWorktreeDirtyRefuse") && (
            <label className="omp-worktree-force-label">
              <input
                type="checkbox"
                checked={clearForce}
                onChange={(e) => setClearForce(e.target.checked)}
              />
              {" "}{t("settings.ompWorktreeForce")}
            </label>
          )}
        </div>
      )}

      {state.worktrees.length === 0 ? (
        <p className="settings-row-desc">{t("settings.ompWorktreesEmpty")}</p>
      ) : (
        <ul className="omp-worktree-list">
          {state.worktrees.map((wt) => (
            <li key={wt.path} className="omp-worktree-row">
              <div className="omp-worktree-meta">
                <Badge tone={wt.orphanReason ? "warning" : "neutral"}>
                  {kindLabel(wt.kind)}
                </Badge>
                {wt.branch && (
                  <span className="omp-worktree-branch font-mono text-xs">{wt.branch}</span>
                )}
              </div>
              <div className="omp-worktree-path font-mono text-xs text-text-muted" title={wt.path}>
                {wt.path.replace(/^.*[\\/]\.omp[\\/]wt[\\/]/, "…/wt/")}
              </div>
              {wt.orphanReason && (
                <div className="omp-worktree-orphan text-xs text-text-muted">
                  {t("settings.ompWorktreesOrphan")}: {wt.orphanReason}
                </div>
              )}
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => { setPendingClear(wt); setClearForce(false); setClearError(null); }}
              >
                {t("settings.ompWorktreeClear")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Clear confirmation dialog */}
      {pendingClear && (
        <div className="wb-dialog-overlay">
          <div className="omp-worktree-dialog">
            <DestructiveActionDialog
              site={pendingClear.path.replace(/^.*[\\/]\.omp[\\/]wt[\\/]/, "…/wt/")}
              command={t("settings.ompWorktreeClear")}
              consequence={t("settings.ompWorktreeClearConsequence")}
              onConfirm={handleClearConfirm}
              onCancel={() => setPendingClear(null)}
            />
            <label className="omp-worktree-force-label">
              <input
                type="checkbox"
                checked={clearForce}
                onChange={(e) => setClearForce(e.target.checked)}
              />
              {" "}{t("settings.ompWorktreeForce")}
            </label>
          </div>
        </div>
      )}

      {/* Prune confirmation dialog */}
      {pendingPrune && (
        <div className="wb-dialog-overlay">
          <div className="omp-worktree-dialog">
            <DestructiveActionDialog
              site="~/.omp/wt/"
              command={t("settings.ompWorktreePrune")}
              consequence={t("settings.ompWorktreePruneConsequence")}
              onConfirm={handlePruneConfirm}
              onCancel={() => setPendingPrune(false)}
            />
            <label className="omp-worktree-force-label">
              <input
                type="checkbox"
                checked={pruneForce}
                onChange={(e) => setPruneForce(e.target.checked)}
              />
              {" "}{t("settings.ompWorktreeForce")}
            </label>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
