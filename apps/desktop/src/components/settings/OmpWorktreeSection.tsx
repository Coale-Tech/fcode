/**
 * Agent-managed git worktrees — reads ~/.omp/wt/ via the ompWorktreeList IPC
 * channel (same classification logic as `omp worktree list`).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpWorktreeEntry } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Badge } from "../ui";

const KIND_LABELS: Record<OmpWorktreeEntry["kind"], string> = {
  "pr-checkout": "PR",
  "task-isolation": "task",
  "empty": "empty",
  "stray": "stray",
};

export function OmpWorktreeSection() {
  const { t } = useTranslation();
  const [worktrees, setWorktrees] = useState<OmpWorktreeEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .ompWorktreeList()
      .then((res) => setWorktrees(res.worktrees))
      .catch(() => setError(true));
  }, []);

  if (error) return null;
  if (!worktrees) {
    return (
      <section className="settings-card-block">
        <h2 className="settings-card-heading">{t("settings.ompWorktreesGroup")}</h2>
        <p className="settings-row-desc">{t("common.loading")}</p>
      </section>
    );
  }
  if (worktrees.length === 0) {
    return (
      <section className="settings-card-block">
        <h2 className="settings-card-heading">{t("settings.ompWorktreesGroup")}</h2>
        <p className="settings-row-desc">{t("settings.ompWorktreesEmpty")}</p>
      </section>
    );
  }

  return (
    <section className="settings-card-block">
      <h2 className="settings-card-heading">{t("settings.ompWorktreesGroup")}</h2>
      <ul className="omp-worktree-list">
        {worktrees.map((wt) => (
          <li key={wt.path} className="omp-worktree-row">
            <div className="omp-worktree-meta">
              <Badge tone={wt.orphanReason ? "warning" : "neutral"}>
                {KIND_LABELS[wt.kind]}
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
          </li>
        ))}
      </ul>
    </section>
  );
}
