import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { ProjectRecord, ScheduledTask, ScheduledTaskRun } from "@pi-desktop/shared";
import { useAppStore } from "../stores/app-store";
import { api } from "../lib/api";
import { formatClock, formatDayTime, formatWeekdays, runDurationSeconds } from "../lib/scheduled-format";
import { useBenchContext } from "../hooks/use-bench-context";
import { Badge, Button, Panel, TooltipButton } from "../components/ui";
import { ContextMenu, useContextMenu } from "../components/ContextMenu";
import {
  IconClock,
  IconDownload,
  IconExternal,
  IconMore,
  IconPlay,
  IconPlus,
  IconSquarePen,
  IconTrash,
  IconUpload,
} from "../components/icons";
import { ScheduledEditor, type ScheduledDraft } from "../features/scheduled/ScheduledEditor";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Scheduled tasks (Direction D `pages-d/scheduled/fragment.html`): a task list
 * card and, for the selected task, a 340px detail card on the page canvas.
 */
export function ScheduledPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const showToast = useAppStore((s) => s.showToast);
  const selectSession = useAppStore((s) => s.selectSession);
  const setPage = useAppStore((s) => s.setPage);
  const currentWorkspacePath = useAppStore((s) => s.workspace?.path ?? "");
  const bench = useBenchContext();
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();
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
  const runNow = (task: ScheduledTask) =>
    void action(async () => {
      await api.executeScheduled(task.id);
      if (mounted.current) setTab("runs");
    });
  const toggleEnabled = (task: ScheduledTask) =>
    void action(async () => {
      await api.updateScheduled({ id: task.id, enabled: !task.enabled });
    });
  const remove = (task: ScheduledTask) => {
    if (!window.confirm(t("scheduled.deleteConfirm", { title: task.title }))) return;
    void action(async () => {
      await api.deleteScheduled(task.id);
      if (mounted.current && selectedTaskId === task.id) setSelectedTaskId(null);
    });
  };
  const date = (value: string) =>
    new Date(value).toLocaleString(i18n.resolvedLanguage ?? i18n.language);
  /** "Today 08:00" / "Tomorrow 02:00" / "Mon 07:30" / "Oct 11, 08:00". */
  const dayTime = (value: string) => {
    const result = formatDayTime(new Date(value), new Date(), locale);
    return result.kind === "date" ? result.text : t(`scheduled.${result.kind}`, { time: result.time });
  };
  const cadenceKey = {
    manual: "scheduled.cadenceManual",
    hourly: "scheduled.cadenceHourly",
    daily: "scheduled.cadenceDaily",
    weekly: "scheduled.cadenceWeekly",
    monthly: "scheduled.cadenceMonthly",
  } as const;
  const statusKey = {
    running: "scheduled.statusRunning",
    completed: "scheduled.statusCompleted",
    aborted: "scheduled.statusAborted",
    error: "scheduled.statusError",
  } as const;
  /** Days a task fires on (Monday = 0); null when the cadence is not day-based. */
  const taskDays = (task: ScheduledTask): number[] | null => {
    if (!task.schedule) return null;
    if (task.cadence === "daily") return task.schedule?.weekdays ?? ALL_DAYS;
    if (task.cadence === "weekly") return task.schedule.weekdays ?? [task.schedule.weekday];
    return null;
  };
  /** Cadence pill: "Daily", "Weekly · Mon". */
  const cadenceLabel = (task: ScheduledTask) => {
    const days = task.cadence === "weekly" ? taskDays(task) : null;
    return days ? `${t(cadenceKey.weekly)} · ${formatWeekdays(days, locale)}` : t(cadenceKey[task.cadence]);
  };
  /** Row meta line: next run and workspace, or why there is none. Hourly runs
   *  later today read as a bare clock ("Next run: 14:00"). */
  const nextRunLabel = (task: ScheduledTask) => {
    if (!task.enabled) return t("scheduled.pausedNoRun");
    if (task.schedule && task.nextRunAt) {
      const next = formatDayTime(new Date(task.nextRunAt), new Date(), locale);
      const when = task.cadence === "hourly" && next.kind === "today" ? next.time : dayTime(task.nextRunAt);
      return `${t("scheduled.nextRun")}: ${when}`;
    }
    return t(task.cadence !== "manual" && !task.schedule ? "scheduled.legacyHint" : "scheduled.noNextRun");
  };
  const taskState = (task: ScheduledTask) => {
    const running = runs.some((run) => run.taskId === task.id && run.status === "running");
    const lastRun = runs
      .filter((run) => run.taskId === task.id && run.status !== "running")
      .sort((a, b) => (b.startedAt > a.startedAt ? 1 : -1))[0];
    const lastFailed = lastRun?.status === "error" || lastRun?.status === "aborted";
    return { running, lastFailed };
  };
  /** D `.d-pill`: Disabled (gray) / Running / Last: failed (amber) / Enabled. */
  const statusPill = (task: ScheduledTask, running: boolean, lastFailed: boolean) => {
    if (!task.enabled) return <span className="d-pill gray">{t("scheduled.disabled")}</span>;
    const failed = lastFailed && !running;
    return (
      <span className={`d-pill ${failed ? "amber" : "green"}`}>
        <span className="d-pill-dot" aria-hidden />
        {t(running ? "scheduled.statusRunningShort" : failed ? "scheduled.lastFailed" : "scheduled.enabled")}
      </span>
    );
  };
  const openTaskMenu = (event: MouseEvent<HTMLElement>, task: ScheduledTask, running: boolean) =>
    openContextMenu(event, {
      label: t("scheduled.moreActions"),
      items: [
        {
          id: "run-now",
          label: t("scheduled.runNow"),
          icon: <IconPlay size={13} />,
          disabled: busy || running,
          onSelect: () => runNow(task),
        },
        {
          id: "toggle",
          label: t(task.enabled ? "scheduled.pause" : "scheduled.resume"),
          disabled: busy,
          onSelect: () => toggleEnabled(task),
        },
        {
          id: "delete",
          label: t("scheduled.delete"),
          icon: <IconTrash size={13} />,
          danger: true,
          separatorBefore: true,
          disabled: busy,
          onSelect: () => remove(task),
        },
      ],
    });
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
  const tickSeconds = health?.lastTickAt ? Math.round((Date.now() - health.lastTickAt) / 1000) : 0;
  return (
    <div className="sch-page">
      <div className="sch-layout">

        {/* ── Main panel ── */}
        <div className="sch-main">
          <div className="d-page-head">
            <span className="d-page-title">{t("scheduled.pageTitle")}</span>
            {health && !health.lastError && health.lastTickAt && Date.now() - health.lastTickAt < 90_000 && (
              <span className="d-pill green">
                <span className="d-pill-dot" aria-hidden />
                {t("scheduled.schedulerHealthy")}
              </span>
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
                <IconUpload size={13} aria-hidden />
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
                <IconDownload size={13} aria-hidden />
                {t("scheduled.import")}
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => { setTab("tasks"); setEditor("new"); }}
              >
                <IconPlus size={13} aria-hidden />
                {t("scheduled.newTask")}
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
                  ? bench.kind === "running"
                    ? t("scheduled.healthTickBench", { seconds: tickSeconds, bench: bench.benchName })
                    : t("scheduled.healthTick", { seconds: tickSeconds })
                  : t("scheduled.healthStale")}
            </div>
          )}

          {error && (
            <Panel>
              <p role="alert">{error}</p>
              <Button onClick={() => void refresh()}>{t("scheduled.retry")}</Button>
            </Panel>
          )}
          {!loaded && !error && <p role="status" className="sch-loading">{t("common.loading")}</p>}

          <div className="d-panel-body flush sch-scroll">
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
                  <div className="d-empty sch-empty">
                    <IconClock size={24} className="sch-empty-icon" />
                    <div className="sch-empty-title">{t("scheduled.emptyTitle")}</div>
                    <p className="sch-empty-body">{t("scheduled.description")}</p>
                  </div>
                )}
                <div className="dest-list">
                  {tasks.map((task) => {
                    const { running, lastFailed } = taskState(task);
                    const selected = selectedTaskId === task.id;
                    return (
                      <div
                        key={task.id}
                        className={`dest-row sch-row${selected ? " selected" : ""}${task.enabled ? "" : " is-disabled"}`}
                        onClick={() => setSelectedTaskId(selected ? null : task.id)}
                      >
                        <div className={`dest-row-icon sch-row-icon${lastFailed && !running ? " dest-row-icon-warn" : ""}`}><IconClock size={14} /></div>
                        <div className="dest-row-body">
                          <div className="dest-row-title sch-row-title">
                            <span>{task.title}</span>
                            {statusPill(task, running, lastFailed)}
                            <span className={`d-pill ${selected ? "violet" : "gray"}`}>{cadenceLabel(task)}</span>
                          </div>
                          <p className="sch-row-prompt">{task.prompt}</p>
                          <p className="dest-row-meta sch-row-meta">
                            {nextRunLabel(task)}
                            {task.enabled && task.workspacePath ? ` · ${task.workspacePath}` : ""}
                          </p>
                        </div>
                        <div className="dest-row-actions" onClick={(e) => e.stopPropagation()}>
                          {task.enabled ? (
                            <Button size="sm" variant="secondary" disabled={busy || running} onClick={() => runNow(task)}>
                              {t(running ? "scheduled.runningEllipsis" : "scheduled.runNow")}
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => toggleEnabled(task)}>
                              {t("scheduled.resume")}
                            </Button>
                          )}
                          <TooltipButton
                            type="button"
                            className="icon-btn icon-btn-square"
                            tooltip={t("scheduled.edit")}
                            ariaLabel={t("scheduled.edit")}
                            disabled={busy}
                            onClick={() => setEditor(task)}
                          >
                            <IconSquarePen size={13} />
                          </TooltipButton>
                          {task.enabled ? (
                            <TooltipButton
                              type="button"
                              className="icon-btn icon-btn-square"
                              tooltip={t("scheduled.moreActions")}
                              ariaLabel={t("scheduled.moreActions")}
                              onClick={(event) => openTaskMenu(event, task, running)}
                            >
                              <IconMore size={13} />
                            </TooltipButton>
                          ) : (
                            <TooltipButton
                              type="button"
                              className="icon-btn icon-btn-square sch-delete-btn"
                              tooltip={t("scheduled.delete")}
                              ariaLabel={t("scheduled.delete")}
                              disabled={busy}
                              onClick={() => remove(task)}
                            >
                              <IconTrash size={13} />
                            </TooltipButton>
                          )}
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
                  <div className="sch-insights">
                    <Badge>{t("scheduled.insightsRuns")}: {insights.total}</Badge>
                    <Badge tone="success">{t("scheduled.insightsSuccess")}: {insights.successRate}%</Badge>
                    <Badge>{t("scheduled.insightsAvgDuration")}: {insights.avgSeconds}s</Badge>
                  </div>
                )}
                {!runs.length && loaded && (
                  <div className="sch-empty-runs">{t("scheduled.emptyRuns")}</div>
                )}
                <div className="dest-list">
                  {runs.map((run) => (
                    <div className="dest-row" key={run.id}>
                      <div className="dest-row-body">
                        <div className="dest-row-title">
                          <span>{tasks.find((task) => task.id === run.taskId)?.title ?? t("scheduled.title")}</span>
                          <Badge tone={run.status === "completed" ? "success" : run.status === "running" ? "neutral" : "error"}>{t(statusKey[run.status])}</Badge>
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
          const { running, lastFailed } = taskState(task);
          const recentRuns = runs
            .filter((run) => run.taskId === task.id && run.status !== "running")
            .sort((a, b) => (b.startedAt > a.startedAt ? 1 : -1))
            .slice(0, 3);
          const days = taskDays(task);
          const timed = task.schedule && task.cadence !== "manual" && task.cadence !== "hourly";
          return (
            <div className="sch-detail">
              <div className="d-mini-head">
                <span className="d-mini-title">{task.title}</span>
                <div className="d-mini-act">
                  <TooltipButton
                    type="button"
                    className="icon-btn icon-btn-square"
                    tooltip={t("scheduled.edit")}
                    ariaLabel={t("scheduled.edit")}
                    disabled={busy}
                    onClick={() => setEditor(task)}
                  >
                    <IconSquarePen size={13} />
                  </TooltipButton>
                  <TooltipButton
                    type="button"
                    className="icon-btn icon-btn-square"
                    tooltip={t("scheduled.moreActions")}
                    ariaLabel={t("scheduled.moreActions")}
                    onClick={(event) => openTaskMenu(event, task, running)}
                  >
                    <IconMore size={13} />
                  </TooltipButton>
                </div>
              </div>
              <div className="d-panel-body sch-detail-body">
                <div className="sch-detail-field">
                  <div className="sch-detail-label">{t("scheduled.detailStatus")}</div>
                  {statusPill(task, running, lastFailed)}
                </div>
                <div className="sch-detail-field">
                  <div className="sch-detail-label">{t("scheduled.detailSchedule")}</div>
                  <div className="sch-detail-value">
                    {timed ? (
                      <Trans
                        i18nKey="scheduled.scheduleAt"
                        values={{
                          cadence: t(cadenceKey[task.cadence]),
                          time: formatClock(new Date(2000, 0, 1, task.schedule!.hour, task.schedule!.minute), locale),
                        }}
                        components={{ strong: <strong /> }}
                      />
                    ) : (
                      t(cadenceKey[task.cadence])
                    )}
                  </div>
                  {days ? (
                    <div className="sch-detail-sub">{formatWeekdays(days, locale)}</div>
                  ) : task.enabled && task.nextRunAt ? (
                    <div className="sch-detail-sub">{t("scheduled.nextRun")}: {dayTime(task.nextRunAt)}</div>
                  ) : null}
                </div>
                <div className="sch-detail-field">
                  <div className="sch-detail-label">{t("scheduled.detailPrompt")}</div>
                  <div className="sch-detail-prompt">{task.prompt}</div>
                </div>
                {task.workspacePath && (
                  <div className="sch-detail-field">
                    <div className="sch-detail-label">{t("scheduled.detailWorkspace")}</div>
                    <code className="sch-detail-mono">{task.workspacePath}</code>
                  </div>
                )}
                {task.modelId && (
                  <div className="sch-detail-field">
                    <div className="sch-detail-label">{t("scheduled.detailModel")}</div>
                    <div className="sch-detail-value">{task.modelId}</div>
                  </div>
                )}
                {recentRuns.length > 0 && (
                  <div>
                    <div className="sch-detail-label">{t("scheduled.recentRuns")}</div>
                    <div className="sch-recent-runs">
                      {recentRuns.map((run) => {
                        const seconds = runDurationSeconds(run.startedAt, run.endedAt);
                        return (
                          <div key={run.id} className="sch-recent-run">
                            <span className={`d-pill ${run.status === "completed" ? "green" : "red"}`}>
                              {t(run.status === "completed" ? "scheduled.runDone" : statusKey[run.status])}
                            </span>
                            <span className="sch-recent-run-time">{dayTime(run.startedAt)}</span>
                            {seconds !== null && (
                              <span className="sch-recent-run-dur">{t("scheduled.durationSeconds", { seconds })}</span>
                            )}
                            {run.sessionId && (
                              <TooltipButton
                                type="button"
                                className="icon-btn icon-btn-square"
                                tooltip={t("scheduled.openResult")}
                                ariaLabel={t("scheduled.openResult")}
                                disabled={busy}
                                onClick={() => void action(() => openSession(run.sessionId!))}
                              >
                                <IconExternal size={11} />
                              </TooltipButton>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="sch-detail-actions">
                  <Button size="sm" variant="secondary" className="sch-detail-run" disabled={busy || running || !task.enabled}
                    onClick={() => runNow(task)}>
                    {t(running ? "scheduled.runningEllipsis" : "scheduled.runNow")}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => toggleEnabled(task)}>
                    {t(task.enabled ? "scheduled.pause" : "scheduled.resume")}
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
      <ContextMenu state={contextMenu} onClose={closeContextMenu} />
    </div>
  );
}
