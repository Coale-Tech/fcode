/**
 * OmpTodoPanel — live todo/phase panel driven by omp todo events (feat/session-data).
 *
 * Floats below the transcript inside SessionPane when there are active phases.
 * Receives todo phases from app-state.sessionTodoPhases, updated by:
 *   - todo tool tool_end events (primary source, has full phase structure)
 *   - todo_reminder omp events (flat list fallback)
 *   - todo_auto_clear omp events (clear)
 */
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../../stores/app-store";
import type { OmpTodoPhase, OmpTodoItem } from "@pi-desktop/shared";

// ─── helpers ──────────────────────────────────────────────────────────────────

function statusIcon(status: OmpTodoItem["status"]): string {
  switch (status) {
    case "completed": return "✓";
    case "in_progress": return "◉";
    case "abandoned": return "✗";
    case "blocked": return "⊘";
    default: return "○";
  }
}

function hasActiveTasks(phases: OmpTodoPhase[]): boolean {
  return phases.some((p) =>
    p.tasks.some((t) => t.status !== "completed" && t.status !== "abandoned"),
  );
}

// ─── row ──────────────────────────────────────────────────────────────────────

const TodoPhaseRow = memo(function TodoPhaseRow({ phase }: { phase: OmpTodoPhase }) {
  return (
    <div className="omp-todo-phase">
      {phase.name && <div className="omp-todo-phase-name">{phase.name}</div>}
      <ul className="omp-todo-task-list">
        {phase.tasks.map((task, i) => (
          <li
            key={task.id ?? i}
            className={`omp-todo-task omp-todo-task--${task.status}`}
          >
            <span className="omp-todo-task-icon" aria-hidden>
              {statusIcon(task.status)}
            </span>
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
    sessionId ? (s.sessionTodoPhases[sessionId] ?? []) : [],
  );
  const [collapsed, setCollapsed] = useState(false);

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
            <TodoPhaseRow key={phase.id ?? i} phase={phase} />
          ))}
        </div>
      )}
    </div>
  );
});
