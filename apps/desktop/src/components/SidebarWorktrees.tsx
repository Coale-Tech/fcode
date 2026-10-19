/**
 * Worktree switcher for the active workspace, shown under the Sessions list.
 * Lists the repo's agent-managed worktrees (parentRepo match) plus the repo
 * itself; when a worktree is the active workspace its parent repo is used, so
 * the main checkout stays one click away. Renders nothing without worktrees.
 * Refreshes on mount and on the "worktree-changed" window event.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpWorktreeEntry } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { normalizeProjectPath } from "../lib/sidebar-session-groups";
import { useAppStore } from "../stores/app-store";

export function SidebarWorktrees({ activePath }: { activePath?: string }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<OmpWorktreeEntry[]>([]);
  const activateProject = useAppStore((s) => s.activateProject);

  useEffect(() => {
    const load = () => {
      api.ompWorktreeList().then((res) => {
        setEntries(res.worktrees.filter((e) => e.kind !== "stray" && e.kind !== "empty" && e.parentRepo));
      }).catch(() => { /* best-effort: keep previous list */ });
    };
    load();
    window.addEventListener("worktree-changed", load);
    return () => window.removeEventListener("worktree-changed", load);
  }, []);

  const active = normalizeProjectPath(activePath);
  const current = entries.find((e) => normalizeProjectPath(e.path) === active);
  const repo = normalizeProjectPath(current?.parentRepo) ?? active;
  const siblings = entries.filter((e) => normalizeProjectPath(e.parentRepo) === repo);
  const repoPath = siblings[0]?.parentRepo;
  if (!repo || !repoPath) return null;

  const rows = [
    { path: repoPath, label: repoPath.split(/[\\/]/).filter(Boolean).pop() ?? repoPath },
    ...siblings.map((e) => ({ path: e.path, label: e.branch ?? e.path })),
  ];

  return (
    <section className="sidebar-worktrees" aria-label={t("nav.worktrees")}>
      <div className="sidebar-list-toolbar sidebar-list-toolbar-secondary">
        <span className="sidebar-list-label">{t("nav.worktrees")}</span>
      </div>
      <div className="sidebar-worktree-list">
        {rows.map((row) => (
          <button
            key={row.path}
            type="button"
            className={`sidebar-worktree-row${normalizeProjectPath(row.path) === active ? " active" : ""}`}
            title={row.path}
            onClick={() => { void activateProject(row.path); }}
          >
            <span className="sidebar-worktree-branch">{row.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
