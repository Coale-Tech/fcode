/**
 * OmpTodoPanel — live todo/phase panel driven by omp todo events (feat/session-data).
 *
 * Floats below the transcript inside SessionPane when there are active phases.
 * Receives todo phases from app-state.sessionTodoPhases, updated by:
 *   - todo tool tool_end events (primary source, has full phase structure)
 *   - todo_reminder omp events (flat list fallback)
 *   - todo_auto_clear omp events (clear)
 *
 * Each task has a toggle button; clicking calls set_todos via editTodosWithRevert.
 * Agent events always win: if an agent event updates sessionTodoPhases during a
 * save call, the RPC result is silently discarded.
 */
import { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../../stores/app-store";
import type { OmpTodoPhase, OmpTodoItem } from "@pi-desktop/shared";
import { api } from "../../../lib/api";
import { hasActiveTasks, toggleTaskStatus, editTodosWithRevert } from "./omp-todo-logic";

// Stable fallback: a fresh [] per selector call never settles in useSyncExternalStore.
const EMPTY_PHASES: OmpTodoPhase[] = [];

// ─── helpers ──────────────────────────────────────────────────────────────────

function statusIcon(status: OmpTodoItem["status"]): string {
  switch (status) {
    case "completed":  return "✓";
    case "abandoned":  return "✗";
    case "in_progress":return "●";
    case "blocked":    return "!";
    default:           return "○";
  }
}

// ─── row ──────────────────────────────────────────────────────────────────────

const TodoPhaseRow = memo(function TodoPhaseRow({
  phase,
  phaseIdx,
  onToggle,
  saving,
}: {
  phase: OmpTodoPhase;
  phaseIdx: number;
  onToggle: (phaseIdx: number, taskIdx: number) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="omp-todo-phase">
      {phase.name && <div className="omp-todo-phase-name">{phase.name}</div>}
      <ul className="omp-todo-task-list">
        {phase.tasks.map((task, i) => (
          <li
            key={task.id ?? i}
            className={`omp-todo-task omp-todo-task--${task.status}`}
          >
            <button
              type="button"
              className="omp-todo-task-toggle"
              disabled={saving}
              onClick={() => onToggle(phaseIdx, i)}
              aria-label={
                task.status === "completed"
                  ? t("chat.ompTodoMarkPending")
                  : t("chat.ompTodoMarkDone")
              }
            >
              <span className="omp-todo-task-icon" aria-hidden>
                {statusIcon(task.status)}
              </span>
            </button>
            <span className="omp-todo-task-content">{task.content}</span>
            {task.blocker && (
              <span className="omp-todo-task-blocker"> ({task.blocker})</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
});

// ─── panel ────────────────────────────────────────────────────────────────────

export const OmpTodoPanel = memo(function OmpTodoPanel({
  sessionId,
}: {
  sessionId: string | undefined;
}) {
  const { t } = useTranslation();
  const phases = useAppStore((s) =>
    sessionId ? (s.sessionTodoPhases[sessionId] ?? EMPTY_PHASES) : EMPTY_PHASES,
  );
  const [collapsed, setCollapsed] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Last failed nextPhases, kept for the retry action.
  const pendingRef = useRef<OmpTodoPhase[] | null>(null);

  const doSave = useCallback(
    async (nextPhases: OmpTodoPhase[]) => {
      if (!sessionId) return;
      setSaving(true);
      setEditError(null);
      pendingRef.current = nextPhases;
      const prevPhases = phases;
      const result = await editTodosWithRevert({
        prevPhases,
        nextPhases,
        getCurrentPhases: () =>
          useAppStore.getState().sessionTodoPhases[sessionId] ?? EMPTY_PHASES,
        setPhases: (ps) =>
          useAppStore.setState((state) => ({
            sessionTodoPhases: { ...state.sessionTodoPhases, [sessionId]: ps },
          })),
        callSetTodos: (ps) => api.ompSessionSetTodos(ps),
      });
      setSaving(false);
      if (!result.ok) {
        setEditError(result.error ?? t("chat.ompTodoEditError", { error: "" }));
      } else {
        pendingRef.current = null;
      }
    },
    [sessionId, phases, t],
  );

  const handleToggle = useCallback(
    (phaseIdx: number, taskIdx: number) => {
      void doSave(toggleTaskStatus(phases, phaseIdx, taskIdx));
    },
    [phases, doSave],
  );

  const handleRetry = useCallback(() => {
    if (pendingRef.current) void doSave(pendingRef.current);
  }, [doSave]);

  if (!sessionId || phases.length === 0 || !hasActiveTasks(phases)) return null;

  const totalTasks = phases.reduce((n, p) => n + p.tasks.length, 0);
  const doneTasks = phases.reduce(
    (n, p) => n + p.tasks.filter((t) => t.status === "completed" || t.status === "abandoned").length,
    0,
  );

  return (
    <div className="omp-todo-panel" aria-label={t("chat.ompTodoPanel")}>
      <button
        type="button"
        className="omp-todo-panel-header"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span className="omp-todo-panel-title">{t("chat.ompTodoPanelTitle")}</span>
        <span className="omp-todo-panel-progress">
          {t("chat.ompTodoPanelProgress", { done: doneTasks, total: totalTasks })}
        </span>
        <span className="omp-todo-panel-toggle" aria-hidden>
          {collapsed ? "▲" : "▼"}
        </span>
      </button>
      {!collapsed && (
        <div className="omp-todo-panel-body">
          {phases.map((phase, i) => (
            <TodoPhaseRow
              key={phase.id ?? i}
              phase={phase}
              phaseIdx={i}
              onToggle={handleToggle}
              saving={saving}
            />
          ))}
          {editError && (
            <div className="omp-todo-panel-error" role="alert">
              <span className="omp-todo-panel-error-text">
                {t("chat.ompTodoEditError", { error: editError })}
              </span>
              <button
                type="button"
                className="omp-todo-panel-retry"
                onClick={handleRetry}
              >
                {t("chat.ompTodoEditRetry")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
