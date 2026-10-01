/**
 * Agent-managed git worktrees — reads ~/.omp/wt/ via the ompWorktreeList IPC
 * channel (same classification logic as `omp worktree list`).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpWorktreeEntry } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Badge } from "../ui";
import { SettingsCard } from "../../features/settings/primitives";

export function OmpWorktreeSection() {
  const { t } = useTranslation();
  const [worktrees, setWorktrees] = useState<OmpWorktreeEntry[] | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    api
      .ompWorktreeList()
      .then((res) => setWorktrees(res.worktrees))
      .catch(() => setError(true));
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

  if (error) {
    return (
      <SettingsCard title={t("settings.ompWorktreesGroup")}>
        <p className="settings-row-desc">{t("settings.ompWorktreesError")}</p>
      </SettingsCard>
    );
  }
  if (!worktrees) {
    return (
      <SettingsCard title={t("settings.ompWorktreesGroup")}>
        <p className="settings-row-desc">{t("common.loading")}</p>
      </SettingsCard>
    );
  }
  if (worktrees.length === 0) {
    return (
      <SettingsCard title={t("settings.ompWorktreesGroup")}>
        <p className="settings-row-desc">{t("settings.ompWorktreesEmpty")}</p>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard title={t("settings.ompWorktreesGroup")}>
      <ul className="omp-worktree-list">
        {worktrees.map((wt) => (
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
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
