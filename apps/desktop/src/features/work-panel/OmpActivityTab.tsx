/**
 * OmpActivityTab — Variant B "Activity" right-panel tab.
 *
 * Sections (top to bottom):
 *  1. "Needs your decision" amber block — only when a permission is pending.
 *     Shows tool name + "Review request" button that scrolls the inline
 *     PermissionCard into view; no Allow/Deny buttons here (those live on
 *     the PermissionCard itself).
 *  2. To-do list — from sessionTodoPhases; hidden when no todos.
 *  3. Tools run — one row per tool call (newest last), with status dot,
 *     display name, summary target, and duration.
 *  4. Changes — file list derived from workspace-review (same source as
 *     ReviewTab) with an "Open Review" button; no Keep/Rollback here.
 */
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { OmpTodoPhase } from "@pi-desktop/shared";
import { useAppStore } from "../../stores/app-store";
import { headPermission } from "../../lib/pending-permissions";
import { buildActivityTimeline } from "../../lib/activity-summary";
import { reviewChangesFromMessages } from "../../lib/workspace-review";
import { formatToolDuration } from "../../lib/tool-display";
import { toolWorkPanelTab } from "../../lib/work-panel-tabs";

// Stable fallback: a fresh [] per call breaks useSyncExternalStore snapshot caching.
const EMPTY_PHASES: OmpTodoPhase[] = [];

export const OmpActivityTab = memo(function OmpActivityTab() {
  const { t } = useTranslation();
  const sessionId = useAppStore((s) => s.activeSessionId);
  const messages = useAppStore((s) => s.messages);
  const pendingPermission = useAppStore((s) =>
    headPermission(s.pendingPermissions, sessionId ?? undefined),
  );
  const phases = useAppStore<OmpTodoPhase[]>((s) =>
    sessionId ? (s.sessionTodoPhases[sessionId] ?? EMPTY_PHASES) : EMPTY_PHASES,
  );
  const openWorkPanelTab = useAppStore((s) => s.openWorkPanelTab);

  const timeline = buildActivityTimeline(messages);
  const changes = reviewChangesFromMessages(messages);

  // Flat task list for the todo section
  const allTasks = phases.flatMap((p) => p.tasks);
  const doneTasks = allTasks.filter(
    (t) => t.status === "completed" || t.status === "abandoned",
  ).length;

  // Scroll the inline PermissionCard into view and focus its first button
  const handleReviewRequest = useCallback(() => {
    const card = document.querySelector<HTMLElement>(".permission-card");
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    requestAnimationFrame(() => {
      card.querySelector<HTMLButtonElement>("button")?.focus();
    });
  }, []);

  const handleOpenReview = useCallback(() => {
    openWorkPanelTab(toolWorkPanelTab("review"));
  }, [openWorkPanelTab]);

  return (
    <div className="activity-tab">
      {/* ── Decision block ─────────────────────────────────────────────── */}
      {pendingPermission && (
        <section className="activity-decision">
          <div className="activity-decision-header">
            <span className="activity-decision-icon" aria-hidden>⚠</span>
            {t("panel.activity.decisionNeeded")}
          </div>
          <div className="activity-decision-tool">
            {pendingPermission.toolName}
          </div>
          <button
            type="button"
            className="activity-decision-review-btn"
            onClick={handleReviewRequest}
          >
            {t("panel.activity.reviewRequest")}
          </button>
        </section>
      )}

      {/* ── To-do list ─────────────────────────────────────────────────── */}
      {allTasks.length > 0 && (
        <section>
          <div className="activity-section-label">
            {t("panel.activity.todo", { done: doneTasks, total: allTasks.length })}
          </div>
          {allTasks.map((task, i) => {
            const done = task.status === "completed" || task.status === "abandoned";
            return (
              <div
                key={task.id ?? i}
                className={`activity-todo-row${done ? " is-done" : ""}`}
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={done}
                  aria-label={task.content}
                  className="activity-todo-check"
                />
                <span className="activity-todo-label">{task.content}</span>
              </div>
            );
          })}
        </section>
      )}

      {/* ── Tool timeline ───────────────────────────────────────────────── */}
      <section>
        <div className="activity-section-label">{t("panel.activity.toolsRun")}</div>
        {timeline.length === 0 ? (
          <div className="activity-empty-row">{t("panel.activity.empty")}</div>
        ) : (
          timeline.map((row, i) => (
            <div key={row.id ?? i} className="activity-tool-row">
              <span
                className={`activity-tool-dot status-${row.status}`}
                aria-label={row.status}
              />
              <span className="activity-tool-name">{row.name}</span>
              <span className="activity-tool-target" title={row.target}>
                {row.target}
              </span>
              {row.durationMs !== undefined && (
                <span className="activity-tool-dur">
                  {formatToolDuration(row.durationMs / 1000)}
                </span>
              )}
            </div>
          ))
        )}
      </section>

      {/* ── Changes ────────────────────────────────────────────────────── */}
      {changes.length > 0 && (
        <section>
          <div className="activity-section-label">
            {t("panel.activity.changes")}
            <button
              type="button"
              className="activity-open-review-btn"
              onClick={handleOpenReview}
            >
              {t("panel.activity.openReview")}
            </button>
          </div>
          {changes.map((entry) => {
            const s = entry.change.status;
            const mark = s === "added" ? "A" : s === "deleted" ? "D" : "M";
            const name = entry.change.path.split("/").pop() || entry.change.path;
            return (
              <div key={entry.change.snapshotId} className="activity-change-row">
                <span className={`activity-change-badge badge-${mark}`}>{mark}</span>
                <span className="activity-change-path" title={entry.change.path}>
                  {name}
                </span>
                <span className="activity-change-counts">
                  {entry.change.additions > 0 && (
                    <span className="activity-count-add">+{entry.change.additions}</span>
                  )}
                  {entry.change.deletions > 0 && (
                    <span className="activity-count-del"> −{entry.change.deletions}</span>
                  )}
                </span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
});
