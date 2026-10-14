import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectRecord, ScheduledTask, ScheduledTaskRun } from "@pi-desktop/shared";
import { useAppStore } from "../stores/app-store";
import { api } from "../lib/api";
import { Badge, Button, Panel } from "../components/ui";
import { IconClock } from "../components/icons";
import { ScheduledEditor, type ScheduledDraft } from "../features/scheduled/ScheduledEditor";

export function ScheduledPage() {
  const { t, i18n } = useTranslation();
  const showToast = useAppStore((s) => s.showToast);
  const selectSession = useAppStore((s) => s.selectSession);
  const setPage = useAppStore((s) => s.setPage);
  const currentWorkspacePath = useAppStore((s) => s.workspace?.path ?? "");
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [runs, setRuns] = useState<ScheduledTaskRun[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [tab, setTab] = useState<"tasks" | "runs">("tasks");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<{ lastTickAt: number | undefined; lastError: string | undefined; hostAvailable: boolean } | null>(null);
  const [editor, setEditor] = useState<ScheduledTask | "new" | null>(null);
  const mounted = useRef(false);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++revision.current;
    try {
      const [taskResult, runResult, projectResult] = await Promise.all([
        api.listScheduled(),
        api.listScheduledRuns(),
        api.listProjects().catch(() => ({ projects: [] as ProjectRecord[] })),
      ]);
      if (!mounted.current || request !== revision.current) return;
      setTasks(taskResult.tasks);
      if (taskResult.health) setHealth(taskResult.health);
      setRuns(runResult.runs);
      setProjects(projectResult.projects);
      setError("");
      setLoaded(true);
    } catch (failure) {
      if (mounted.current && request === revision.current)
        setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => {
      mounted.current = false;
      revision.current++;
      clearInterval(timer);
    };
  }, [refresh]);
  const action = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
      if (mounted.current) await refresh();
    } catch (failure) {
      showToast(failure instanceof Error ? failure.message : String(failure), { variant: "error" });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const save = (draft: ScheduledDraft) =>
    action(async () => {
      if (editor && editor !== "new") await api.updateScheduled({ id: editor.id, ...draft });
      else await api.createScheduled(draft);
      if (mounted.current) setEditor(null);
    });
  const openSession = async (id: string) => {
    await selectSession(id);
    if (mounted.current) setPage("chat");
  };
  const date = (value: string) =>
    new Date(value).toLocaleString(i18n.resolvedLanguage ?? i18n.language);
  const cadenceKey = {
    manual: "scheduled.cadenceManual",
    hourly: "scheduled.cadenceHourly",
    daily: "scheduled.cadenceDaily",
    weekly: "scheduled.cadenceWeekly",
  } as const;
  const statusKey = {
    running: "scheduled.statusRunning",
    completed: "scheduled.statusCompleted",
    aborted: "scheduled.statusAborted",
    error: "scheduled.statusError",
  } as const;
  const insights = useMemo(() => {
    const completed = runs.filter((run) => run.status === "completed");
    const durations = completed
      .filter((run) => run.endedAt)
      .map((run) => Date.parse(run.endedAt!) - Date.parse(run.startedAt));
    const avgMs = durations.length ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length : 0;
    return {
      total: runs.length,
      successRate: runs.length ? Math.round((completed.length / runs.length) * 100) : 0,
      avgSeconds: Math.round(avgMs / 1000),
    };
  }, [runs]);
  return (
    <div className="sch-page">
      <div className="sch-layout">

        {/* ── Main panel ── */}
        <div className="sch-main">
          <div className="d-page-head">
            <span className="d-page-title">{t("scheduled.title")}</span>
            {health && !health.lastError && health.lastTickAt && Date.now() - health.lastTickAt < 90_000 && (
              <Badge tone="success">{t("scheduled.schedulerHealthy")}</Badge>
            )}
            <div className="d-page-head-actions">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void action(async () => {
                  const result = await api.exportScheduled();
                  if (result) showToast(t("scheduled.exportDone", { count: result.count }));
                })}
              >
                {t("scheduled.export")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void action(async () => {
                  const result = await api.importScheduled();
                  if (result) showToast(t("scheduled.importDone", { count: result.imported }));
                })}
              >
                {t("scheduled.import")}
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => { setTab("tasks"); setEditor("new"); }}
              >
                {t("scheduled.create")}
              </Button>
            </div>
          </div>

          {/* D-style underline tabs */}
          <div className="d-panel-tabs" role="tablist" aria-label={t("scheduled.title")}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "tasks"}
              className={`d-panel-tab${tab === "tasks" ? " active" : ""}`}
              onClick={() => setTab("tasks")}
            >
              {t("scheduled.tasks")}
              <span className="d-tab-count">{tasks.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "runs"}
              className={`d-panel-tab${tab === "runs" ? " active" : ""}`}
              onClick={() => setTab("runs")}
            >
              {t("scheduled.runs")}
              <span className="d-tab-count">{runs.length}</span>
            </button>
          </div>

          {/* Health strip — always visible */}
          {health && (
            <div className="sch-health">
              <span className={`sch-health-dot${health.lastError || !health.lastTickAt || Date.now() - (health.lastTickAt ?? 0) > 90_000 ? " warn" : ""}`} />
              {health.lastError
                ? t("scheduled.healthError", { error: health.lastError })
                : health.lastTickAt
                  ? t("scheduled.healthTick", { seconds: Math.round((Date.now() - health.lastTickAt) / 1000) })
                  : t("scheduled.healthStale")}
            </div>
          )}

          {error && (
            <Panel>
              <p role="alert">{error}</p>
              <Button onClick={() => void refresh()}>{t("scheduled.retry")}</Button>
            </Panel>
          )}
          {!loaded && !error && <p role="status" style={{ padding: "12px" }}>{t("common.loading")}</p>}

          <div className="d-panel-body flush" style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
            {tab === "tasks" && (
              <>
                {editor && (
                  <ScheduledEditor
                    key={editor === "new" ? "new" : editor.id}
                    task={editor === "new" ? undefined : editor}
                    projects={projects}
                    currentWorkspacePath={currentWorkspacePath}
                    busy={busy}
                    save={save}
                    cancel={() => setEditor(null)}
                  />
                )}
                {loaded && !tasks.length && !editor && (
                  <div className="d-empty" style={{ padding: "32px 16px", textAlign: "center" }}>
                    <IconClock size={24} style={{ color: "var(--ink-gray-3)", marginBottom: 8 }} />
                    <div style={{ fontWeight: 500 }}>{t("scheduled.emptyTitle")}</div>
                    <p style={{ fontSize: "var(--d-text-sm)", color: "var(--ink-gray-4)" }}>{t("scheduled.description")}</p>
                  </div>
                )}
                <div className="dest-list">
                  {tasks.map((task) => {
                    const running = runs.some((run) => run.taskId === task.id && run.status === "running");
                    return (
                      <div
                        key={task.id}
                        className={`dest-row${selectedTaskId === task.id ? " selected" : ""}`}
                        onClick={() => setSelectedTaskId(task.id === selectedTaskId ? null : task.id)}
                      >
                        <div className="dest-row-icon"><IconClock size={16} /></div>
                        <div className="dest-row-body">
                          <div className="dest-row-title">
                            <span>{task.title}</span>
                            <Badge tone={task.enabled ? "success" : "neutral"}>
                              {t(task.enabled ? "scheduled.enabled" : "scheduled.disabled")}
                            </Badge>
                            <Badge tone="neutral">{t(cadenceKey[task.cadence])}</Badge>
                          </div>
                          <p className="dest-row-meta line-clamp-2">{task.prompt}</p>
                          <p className="dest-row-meta">
                            {task.schedule && task.enabled && task.nextRunAt
                              ? `${t("scheduled.nextRun")}: ${date(task.nextRunAt)}`
                              : t(task.enabled && task.cadence !== "manual" && !task.schedule ? "scheduled.legacyHint" : "scheduled.noNextRun")}
                          </p>
                        </div>
                        <div className="dest-row-actions" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" disabled={busy || running}
                            onClick={() => void action(async () => {
                              await api.executeScheduled(task.id);
                              if (mounted.current) setTab("runs");
                            })}>
                            {t(running ? "scheduled.statusRunning" : "scheduled.runNow")}
                          </Button>
                          <Button size="sm" disabled={busy} onClick={() => setEditor(task)}>
                            {t("scheduled.edit")}
                          </Button>
                          <Button size="sm" disabled={busy}
                            onClick={() => void action(async () => {
                              await api.updateScheduled({ id: task.id, enabled: !task.enabled });
                            })}>
                            {t(task.enabled ? "scheduled.pause" : "scheduled.resume")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {tab === "runs" && (
              <>
                {runs.length > 0 && (
                  <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: "1px solid var(--d-border)" }}>
                    <Badge>{t("scheduled.insightsRuns")}: {insights.total}</Badge>
                    <Badge tone="success">{t("scheduled.insightsSuccess")}: {insights.successRate}%</Badge>
                    <Badge>{t("scheduled.insightsAvgDuration")}: {insights.avgSeconds}s</Badge>
                  </div>
                )}
                {!runs.length && loaded && (
                  <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--ink-gray-4)", fontSize: "var(--d-text-sm)" }}>
                    {t("scheduled.emptyRuns")}
                  </div>
                )}
                <div className="dest-list">
                  {runs.map((run) => (
                    <div className="dest-row" key={run.id}>
                      <div className="dest-row-body">
                        <div className="dest-row-title">
                          <span>{tasks.find((task) => task.id === run.taskId)?.title ?? t("scheduled.title")}</span>
                          <Badge tone={run.status === "completed" ? "success" : "neutral"}>{t(statusKey[run.status])}</Badge>
                        </div>
                        <p className="dest-row-meta">{date(run.startedAt)}</p>
                        {run.errorCode && <p className="dest-row-meta">{t("scheduled.runError")} ({run.errorCode})</p>}
                      </div>
                      {run.sessionId && (
                        <Button size="sm" disabled={busy}
                          onClick={() => void action(() => openSession(run.sessionId!))}>
                          {t("scheduled.openResult")}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Detail panel (340px, shown when task selected) ── */}
        {selectedTaskId && (() => {
          const task = tasks.find((tsk) => tsk.id === selectedTaskId);
          if (!task) return null;
          const running = runs.some((run) => run.taskId === task.id && run.status === "running");
          const recentRuns = runs.filter((run) => run.taskId === task.id).slice(0, 3);
          return (
            <div className="sch-detail">
              <div className="d-mini-head">
                <span className="d-mini-title">{task.title}</span>
                <div className="d-mini-act">
                  <Button size="sm" variant="ghost" onClick={() => setEditor(task)}>{t("scheduled.edit")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedTaskId(null)}>✕</Button>
                </div>
              </div>
              <div className="d-panel-body" style={{ overflowY: "auto" }}>
                <div style={{ marginBottom: 12 }}>
                  <div className="sch-detail-label">{t("scheduled.detailStatus")}</div>
                  <Badge tone={task.enabled ? "success" : "neutral"}>
                    {t(task.enabled ? (running ? "scheduled.statusRunning" : "scheduled.enabled") : "scheduled.disabled")}
                  </Badge>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div className="sch-detail-label">{t("scheduled.detailSchedule")}</div>
                  <div className="sch-detail-value">{t(cadenceKey[task.cadence])}</div>
                  {task.nextRunAt && <div style={{ fontSize: "var(--d-text-xs)", color: "var(--ink-gray-4)", marginTop: 2 }}>{t("scheduled.nextRun")}: {date(task.nextRunAt)}</div>}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div className="sch-detail-label">{t("scheduled.prompt")}</div>
                  <div style={{ fontSize: "var(--d-text-sm)", color: "var(--ink-gray-7)", lineHeight: 1.55 }}>{task.prompt}</div>
                </div>
                {task.workspacePath && (
                  <div style={{ marginBottom: 12 }}>
                    <div className="sch-detail-label">{t("scheduled.detailWorkspace")}</div>
                    <code style={{ fontFamily: "ui-monospace,monospace", fontSize: "var(--d-text-xs)", background: "var(--surface-gray-2)", border: "1px solid var(--d-border)", borderRadius: 4, padding: "2px 6px" }}>
                      {task.workspacePath}
                    </code>
                  </div>
                )}
                {recentRuns.length > 0 && (
                  <div>
                    <div className="sch-detail-label">{t("scheduled.recentRuns")}</div>
                    <div style={{ marginTop: 4, border: "1px solid var(--d-border)", borderRadius: 6, overflow: "hidden" }}>
                      {recentRuns.map((run, i) => (
                        <div key={run.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", fontSize: "var(--d-text-xs)", borderTop: i > 0 ? "1px solid var(--d-border)" : undefined }}>
                          <Badge tone={run.status === "completed" ? "success" : "neutral"} style={{ flexShrink: 0 }}>{t(statusKey[run.status])}</Badge>
                          <span style={{ flex: 1, color: "var(--ink-gray-5)" }}>{date(run.startedAt)}</span>
                          {run.sessionId && (
                            <Button size="sm" variant="ghost" onClick={() => void action(() => openSession(run.sessionId!))}>↗</Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                  <Button size="sm" variant="secondary" style={{ flex: 1 }} disabled={busy || running}
                    onClick={() => void action(async () => {
                      await api.executeScheduled(task.id);
                      if (mounted.current) setTab("runs");
                    })}>
                    {t(running ? "scheduled.statusRunning" : "scheduled.runNow")}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy}
                    onClick={() => void action(async () => {
                      await api.updateScheduled({ id: task.id, enabled: !task.enabled });
                    })}>
                    {t(task.enabled ? "scheduled.pause" : "scheduled.resume")}
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
