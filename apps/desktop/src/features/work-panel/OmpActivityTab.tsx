/**
 * OmpActivityTab — Variant D "Activity" right-panel tab.
 *
 * Three inner sub-tabs (design: fragment.html:453-526 .d-panel-tabs):
 *  - Todos: decision block (Allow/Deny) + Open todos + Recent activity events
 *  - Timeline: tool call timeline with duration
 *  - Changes: file diffs with status badges
 *
 * Below the strip (always visible):
 *  - Session: OmpTuiPanel + OmpCollabPanel (no design home — ruled into Activity)
 */
import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OmpTodoPhase } from "@pi-desktop/shared";
import { IconTriangleAlert } from "../../components/icons";
import { Button } from "../../components/ui";
import { useAppStore } from "../../stores/app-store";
import { headPermission } from "../../lib/pending-permissions";
import { buildActivityTimeline, type ActivityTimelineRow } from "../../lib/activity-summary";
import { reviewChangesFromMessages } from "../../lib/workspace-review";
import { formatToolDuration } from "../../lib/tool-display";
import { toolWorkPanelTab } from "../../lib/work-panel-tabs";
import { OmpCollabPanel } from "../chat/transcript/OmpCollabPanel";
import { OmpTuiPanel } from "../chat/transcript/OmpTuiPanel";

// Stable fallback: a fresh [] per call breaks useSyncExternalStore snapshot caching.
const EMPTY_PHASES: OmpTodoPhase[] = [];

type ActivitySubTab = "todos" | "timeline" | "changes";

export const OmpActivityTab = memo(function OmpActivityTab() {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<ActivitySubTab>("todos");

  const sessionId = useAppStore((s) => s.activeSessionId);
  const messages = useAppStore((s) => s.messages);
  const pendingPermission = useAppStore((s) =>
    headPermission(s.pendingPermissions, sessionId ?? undefined),
  );
  const phases = useAppStore<OmpTodoPhase[]>((s) =>
    sessionId ? (s.sessionTodoPhases[sessionId] ?? EMPTY_PHASES) : EMPTY_PHASES,
  );
  const openWorkPanelTab = useAppStore((s) => s.openWorkPanelTab);
  const resolvePermission = useAppStore((s) => s.resolvePermission);
  // SESSION panel (OmpTuiPanel + OmpCollabPanel) only for remote-connected sessions.
  // "desktop" source = plain local session → no TUI launcher needed; hides the
  // "OPEN IN OMP TUI" / "SHARE SNAPSHOT" sections that do not appear in ref D1-D3.
  const isOmpSession = useAppStore((s) =>
    sessionId ? s.sessions.find((x) => x.id === sessionId)?.source === "remote" : false,
  );
  const projectPath = useAppStore((s) => s.workspace?.path ?? undefined);

  // Capture override: __PI_ACTIVITY_EVENTS__ injects reference-matching rows.
  type CaptureRow = { id: string; name: string; target: string; status: "ok" | "running" | "error"; durationMs?: number; timestamp?: string };
  const captureEvents: CaptureRow[] | undefined = typeof window !== "undefined"
    ? (window as Window & { __PI_ACTIVITY_EVENTS__?: CaptureRow[] }).__PI_ACTIVITY_EVENTS__
    : undefined;
  const timeline: (ActivityTimelineRow | CaptureRow)[] =
    captureEvents?.length ? captureEvents : buildActivityTimeline(messages);
  const changes = reviewChangesFromMessages(messages);

  // Flat task list for the todo section
  const allTasks = phases.flatMap((p) => p.tasks);

  const handleOpenReview = useCallback(() => {
    openWorkPanelTab(toolWorkPanelTab("review"));
  }, [openWorkPanelTab]);

  const handleAllow = useCallback(() => {
    if (!sessionId || !pendingPermission) return;
    void resolvePermission(sessionId, pendingPermission.requestId, "allow-once");
  }, [sessionId, pendingPermission, resolvePermission]);

  const handleDeny = useCallback(() => {
    if (!sessionId || !pendingPermission) return;
    void resolvePermission(sessionId, pendingPermission.requestId, "deny");
  }, [sessionId, pendingPermission, resolvePermission]);

  return (
    <div className="activity-tab">
      {/* ── Sub-tab strip (design: fragment.html:459-463 .d-panel-tabs) ── */}
      <div className="activity-inner-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={subTab === "todos"}
          className={`activity-inner-tab${subTab === "todos" ? " is-active" : ""}`}
          onClick={() => setSubTab("todos")}
        >
          {t("panel.activity.todoTab")}
          {allTasks.length > 0 && (
            <span className="activity-tab-count">{allTasks.length}</span>
          )}
        </button>
        <button
          role="tab"
          aria-selected={subTab === "timeline"}
          className={`activity-inner-tab${subTab === "timeline" ? " is-active" : ""}`}
          onClick={() => setSubTab("timeline")}
        >
          {t("panel.activity.timeline")}
        </button>
        <button
          role="tab"
          aria-selected={subTab === "changes"}
          className={`activity-inner-tab${subTab === "changes" ? " is-active" : ""}`}
          onClick={() => setSubTab("changes")}
        >
          {t("panel.activity.changes")}
          {changes.length > 0 && (
            <span className="activity-tab-count">{changes.length}</span>
          )}
        </button>
      </div>

      {/* ── Todos tab ──────────────────────────────────────────────────── */}
      {subTab === "todos" && (
        <div className="activity-tab-panel" role="tabpanel">

          {/* Decision block (design: fragment.html:465-476 .d-approval-box) */}
          {pendingPermission && (
            <section className="activity-decision">
              <div className="activity-decision-header">
                <IconTriangleAlert size={13} className="activity-decision-icon" aria-hidden />
                {t("panel.activity.decisionNeeded")}
              </div>
              {/* Compose desc: "Edit payment_entry.py — 12 lines…" matching reference */}
              {(pendingPermission.toolName || pendingPermission.reason) && (
                <div className="activity-decision-desc">
                  {pendingPermission.toolName}
                  {pendingPermission.argsPreview && typeof pendingPermission.argsPreview === "object" && "path" in pendingPermission.argsPreview
                    ? ` ${(pendingPermission.argsPreview as { path: string }).path.split("/").pop()}`
                    : ""}
                  {pendingPermission.reason ? ` — ${pendingPermission.reason}` : ""}
                </div>
              )}
              <div className="activity-decision-actions">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleAllow}
                >
                  {t("panel.activity.allow")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDeny}
                >
                  {t("panel.activity.deny")}
                </Button>
              </div>
            </section>
          )}

          {/* Open todos (design: fragment.html:478-493 .cf-todo rows) */}
          <div className="activity-section-label">
            {t("panel.activity.openTodos")}
          </div>
          {allTasks.length === 0 ? (
            <div className="activity-empty-row">{t("panel.activity.empty")}</div>
          ) : (
            allTasks.map((task, i) => {
              const done = task.status === "completed" || task.status === "abandoned";
              const statusLabel =
                task.status === "completed" ? t("panel.activity.todoStatusDone", { defaultValue: "done" })
                : task.status === "abandoned" ? t("panel.activity.todoStatusAbandoned", { defaultValue: "skipped" })
                : task.status === "in_progress" ? t("panel.activity.todoStatusRunning", { defaultValue: "running" })
                : undefined;
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
                  {statusLabel && (
                    <span className="activity-todo-time">{statusLabel}</span>
                  )}
                </div>
              );
            })
          )}

          {/* Recent activity events (design: fragment.html:495-519 .cf-event rows) */}
          {timeline.length > 0 && (
            <>
              <div className="activity-section-label" style={{ marginTop: "6px" }}>
                {t("panel.activity.recentActivity")}
              </div>
              {timeline.map((row, i) => (
                <div key={row.id ?? i} className="activity-event-row">
                  <span className={`activity-event-dot status-${row.status}`} aria-hidden />
                  <span className="activity-event-body">
                    <strong>{row.name}</strong>
                    {row.target ? ` · ${row.target}` : ""}
                  </span>
                  {((row as CaptureRow).timestamp !== undefined || row.durationMs !== undefined) && (
                    <span className="activity-event-time">
                      {(row as CaptureRow).timestamp ?? formatToolDuration((row.durationMs ?? 0) / 1000)}
                    </span>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Timeline tab ──────────────────────────────────────────────── */}
      {subTab === "timeline" && (
        <div className="activity-tab-panel" role="tabpanel">
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
        </div>
      )}

      {/* ── Changes tab ───────────────────────────────────────────────── */}
      {subTab === "changes" && (
        <div className="activity-tab-panel" role="tabpanel">
          <div className="activity-section-label">
            {t("panel.activity.changes")}
            {changes.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleOpenReview}
              >
                {t("panel.activity.openReview")}
              </Button>
            )}
          </div>
          {changes.length === 0 ? (
            <div className="activity-empty-row">{t("panel.activity.empty")}</div>
          ) : (
            changes.map((entry) => {
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
            })
          )}
        </div>
      )}

      {/* ── Session (always visible — omp TUI + share; no design home) ── */}
      {sessionId && isOmpSession && (
        <section className="activity-session">
          <div className="activity-section-label">
            {t("panel.activity.session")}
          </div>
          <OmpTuiPanel sessionId={sessionId} projectPath={projectPath} />
          <OmpCollabPanel sessionId={sessionId} />
        </section>
      )}
    </div>
  );
});
