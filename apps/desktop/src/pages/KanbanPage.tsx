/**
 * KanbanPage — Hermes-style board (Triage → Done): filter bar, column headers
 * with dot/count/add/subtitle, card chips, multi-select + bulk bar, and a
 * right-side drawer (features/kanban/KanbanDrawer).
 *
 * HD4: [kanban] sessions are filtered out of the sidebar by default.
 * HD2: "Needs approval" badge shown on running cards that emit tool_permission_request.
 *
 * Ponytail: native HTML5 drag-and-drop; no external DnD library.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { KanbanBoard, KanbanStatus, KanbanTask } from "@pi-desktop/shared";
import { IPC } from "@pi-desktop/shared";
import { useAppStore } from "../stores/app-store";
import { api } from "../lib/api";
import { formatUpdated } from "../lib/project-archive";
import { IconPlus, IconKanban, IconChat } from "../components/icons";
import { Button, Input, Select, Textarea, Checkbox, portalOverlay } from "../components/ui";
import { KanbanDrawer } from "../features/kanban/KanbanDrawer";
import {
  KANBAN_COLUMNS,
  NO_FILTERS,
  boardProjects,
  canMoveTo,
  childProgress,
  commentCount,
  filterTasks,
  filtersActive,
  linkCounts,
  projectName,
  rangeBetween,
  shortId,
  type KanbanFilters,
} from "../features/kanban/kanban-model";

/** Columns whose "+" creates a card (the dispatcher owns Running; Blocked/Done are outcomes). */
const CREATE_COLUMNS: KanbanStatus[] = ["triage", "todo", "ready"];

function useKanbanBoard() {
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [error, setError] = useState("");
  const [paused, setPaused] = useState(false);
  const revision = useRef(0);

  const refresh = useCallback(async () => {
    const req = ++revision.current;
    try {
      const result = await api.kanbanList();
      if (revision.current !== req) return;
      setBoard(result.board);
      setPaused(result.paused);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Listen for board changes from the main process
  useEffect(() => {
    return window.piDesktop?.on?.(IPC.event.kanbanChanged, () => { void refresh(); });
  }, [refresh]);

  return { board, error, refresh, paused, setPaused };
}

// ── Drag state ────────────────────────────────────────────────────────────────
let dragTaskId: string | null = null;

// ── Card ──────────────────────────────────────────────────────────────────────

function KanbanCard({
  task,
  board,
  selected,
  needsApproval,
  onOpen,
  onSelect,
}: {
  task: KanbanTask;
  board: KanbanBoard;
  selected: boolean;
  needsApproval: boolean;
  onOpen: (taskId: string) => void;
  onSelect: (taskId: string, mode: "toggle" | "range") => void;
}) {
  const { t, i18n } = useTranslation();
  const progress = childProgress(board, task.id);
  const links = linkCounts(board, task.id);
  const comments = commentCount(board, task.id);
  const linkTotal = links.parents + links.children;

  return (
    <div
      className={`kanban-card${selected ? " kanban-card-selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${task.title} — ${shortId(task.id)} — ${t(`kanban.columns.${task.status}`)}`}
      draggable={task.status !== "running"}
      onDragStart={() => { dragTaskId = task.id; }}
      onDragEnd={() => { dragTaskId = null; }}
      onClick={(e) => {
        if (e.shiftKey) onSelect(task.id, "range");
        else if (e.metaKey || e.ctrlKey) onSelect(task.id, "toggle");
        else onOpen(task.id);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(task.id);
        }
      }}
      data-status={task.status}
      data-archived={task.archived || undefined}
      data-blocked={task.blockKind ?? undefined}
    >
      <div className="kanban-card-row">
        <input
          type="checkbox"
          className="kanban-card-check"
          checked={selected}
          aria-label={t("kanban.card.select", { id: shortId(task.id) })}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onSelect(task.id, "toggle")}
        />
        <span className="kanban-card-id">{shortId(task.id)}</span>
        {needsApproval && (
          <span className="kanban-badge kanban-badge-approval">{t("kanban.card.needsApproval")}</span>
        )}
        {task.blockKind === "gave_up" && (
          <span className="kanban-badge kanban-badge-gave-up">{t("kanban.card.gaveUp")}</span>
        )}
        {task.priority > 0 && (
          <span className="kanban-chip kanban-chip-priority" title={t("kanban.card.priority", { count: task.priority })}>
            P{task.priority}
          </span>
        )}
        <span className="kanban-chip" title={task.projectPath}>{projectName(task.projectPath)}</span>
        {progress && (
          <span
            className={`kanban-chip kanban-chip-progress${progress.done === progress.total ? " kanban-chip-full" : ""}`}
            title={t("kanban.card.progress", progress)}
          >
            {progress.done}/{progress.total}
          </span>
        )}
        {task.archived && <span className="kanban-chip">{t("kanban.card.archived")}</span>}
      </div>

      <div className="kanban-card-title">{task.title}</div>

      <div className="kanban-card-row kanban-card-meta">
        <span>{t(task.createdBy === "agent" ? "kanban.card.byAgent" : "kanban.card.byUser")}</span>
        {comments > 0 && (
          <span className="kanban-count" title={t("kanban.card.comments", { count: comments })}>
            <IconChat size={11} aria-hidden /> {comments}
          </span>
        )}
        {linkTotal > 0 && (
          <span className="kanban-count" title={t("kanban.card.links", links)}>↔ {linkTotal}</span>
        )}
        <span className="kanban-card-ago" title={new Date(task.createdAt).toLocaleString(i18n.language)}>
          {formatUpdated(task.createdAt, i18n.language)}
        </span>
      </div>
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  tasks,
  board,
  selected,
  needsApprovalSet,
  onOpen,
  onSelect,
  onSelectAll,
  onAdd,
  onDropTo,
}: {
  status: KanbanStatus;
  tasks: KanbanTask[];
  board: KanbanBoard;
  selected: Set<string>;
  needsApprovalSet: Set<string>;
  onOpen: (taskId: string) => void;
  onSelect: (taskId: string, mode: "toggle" | "range") => void;
  onSelectAll: (ids: string[], on: boolean) => void;
  onAdd: (status: KanbanStatus) => void;
  onDropTo: (taskId: string, status: KanbanStatus) => void;
}) {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);
  const label = t(`kanban.columns.${status}`);
  const allSelected = tasks.length > 0 && tasks.every((x) => selected.has(x.id));

  return (
    <section
      className={`kanban-column${over ? " kanban-column-over" : ""}`}
      data-column={status}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (dragTaskId) onDropTo(dragTaskId, status);
      }}
      aria-label={label}
    >
      <div className="kanban-column-header">
        <input
          type="checkbox"
          className="kanban-card-check"
          checked={allSelected}
          disabled={tasks.length === 0}
          aria-label={t("kanban.column.selectAll", { column: label })}
          onChange={() => onSelectAll(tasks.map((x) => x.id), !allSelected)}
        />
        <span className="kanban-dot" data-status={status} aria-hidden />
        <span className="kanban-column-title">{label}</span>
        <span className="kanban-column-count" title={t("kanban.column.count", { count: tasks.length })}>
          {tasks.length}
        </span>
        {CREATE_COLUMNS.includes(status) && (
          <button
            type="button"
            className="kanban-column-add"
            aria-label={t("kanban.column.add", { column: label })}
            title={t("kanban.column.add", { column: label })}
            onClick={() => onAdd(status)}
          >
            <IconPlus size={12} aria-hidden />
          </button>
        )}
      </div>
      <div className="kanban-column-sub">{t(`kanban.columnHelp.${status}`)}</div>
      <div className="kanban-column-cards">
        {tasks.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            board={board}
            selected={selected.has(task.id)}
            needsApproval={needsApprovalSet.has(task.id)}
            onOpen={onOpen}
            onSelect={onSelect}
          />
        ))}
        {tasks.length === 0 && <div className="kanban-column-empty">{t("kanban.column.empty")}</div>}
      </div>
    </section>
  );
}

// ── New card sheet ────────────────────────────────────────────────────────────

function NewCardSheet({
  board,
  workspacePath,
  status,
  onDone,
}: {
  board: KanbanBoard;
  workspacePath: string;
  status: KanbanStatus | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const showToast = useAppStore((s) => s.showToast);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("0");
  const [parent, setParent] = useState("");
  const [projectPath, setProjectPath] = useState(workspacePath);
  const [busy, setBusy] = useState(false);
  const canSubmit = title.trim() !== "" && projectPath.trim() !== "";

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      await api.kanbanCreate({
        title: title.trim(),
        body,
        projectPath: projectPath.trim(),
        priority: Number(priority) || 0,
        parentIds: parent ? [parent] : [],
        status: status === "triage" || status === "todo" ? status : undefined,
      });
      onDone();
    } catch (e) {
      showToast(String(e), { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return portalOverlay(
    <div className="overlay kanban-sheet-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onDone(); }}>
      <div className="kanban-new-card-sheet dialog" role="dialog" aria-label={t("kanban.newCard")}>
        <h2 className="kanban-new-card-title">
          {t("kanban.newCard")}
          {status && <span className="kanban-new-card-in"> · {t(`kanban.columns.${status}`)}</span>}
        </h2>
        <label className="kanban-field">
          <span>{t("kanban.form.title")}</span>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
          />
        </label>
        <label className="kanban-field">
          <span>{t("kanban.form.body")}</span>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
        </label>
        <div className="kanban-field-row">
          <label className="kanban-field">
            <span>{t("kanban.form.priority")}</span>
            <Input type="number" min={0} value={priority} onChange={(e) => setPriority(e.target.value)} />
          </label>
          <label className="kanban-field">
            <span>{t("kanban.form.parent")}</span>
            <Select value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">{t("kanban.form.noParent")}</option>
              {board.tasks.filter((x) => !x.archived).map((x) => (
                <option key={x.id} value={x.id}>{`${shortId(x.id)} · ${x.title}`}</option>
              ))}
            </Select>
          </label>
        </div>
        <label className="kanban-field">
          <span>{t("kanban.form.project")}</span>
          <Input value={projectPath} onChange={(e) => setProjectPath(e.target.value)} />
        </label>
        <div className="kanban-new-card-actions">
          <Button variant="ghost" onClick={onDone} disabled={busy}>{t("errors.action.dismiss")}</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !canSubmit}>
            {t("kanban.addCard")}
          </Button>
        </div>
      </div>
    </div>,
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function KanbanPage() {
  const { t } = useTranslation();
  const showToast = useAppStore((s) => s.showToast);
  const workspacePath = useAppStore((s) => s.workspace?.path ?? "");
  const { board, error, refresh, paused, setPaused } = useKanbanBoard();
  const [newCard, setNewCard] = useState<{ status: KanbanStatus | null } | null>(null);
  const [filters, setFilters] = useState<KanbanFilters>(NO_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkPriority, setBulkPriority] = useState("");
  const anchor = useRef<string | null>(null);
  // taskId → true for tasks whose running session needs approval
  const [needsApproval, setNeedsApproval] = useState<Set<string>>(new Set());

  // HD2: listen for permission_request events and map sessionId → taskId
  useEffect(() => {
    if (!board) return;
    const sessionToTask = new Map<string, string>(
      board.tasks
        .filter((t: KanbanTask): t is KanbanTask & { sessionId: string } => typeof t.sessionId === "string")
        .map((t: KanbanTask & { sessionId: string }) => [t.sessionId, t.id]),
    );
    const bridge = window.piDesktop;
    if (!bridge?.on) return;
    const off = bridge.on(IPC.event.agentMessage, (payload) => {
      if (
        payload &&
        typeof payload === "object" &&
        "event" in payload &&
        "sessionId" in payload
      ) {
        const ev = payload as { event: { type?: string }; sessionId: string };
        if (ev.event?.type === "tool_permission_request") {
          const taskId = sessionToTask.get(ev.sessionId);
          if (taskId) setNeedsApproval((prev: Set<string>) => new Set<string>([...prev, taskId]));
        }
        // Clear when session ends (agent_end / error)
        if (ev.event?.type === "agent_end" || ev.event?.type === "error") {
          const taskId = sessionToTask.get(ev.sessionId);
          if (taskId) setNeedsApproval((prev: Set<string>) => { const n = new Set<string>(prev); n.delete(taskId); return n; });
        }
      }
    });
    return off;
  }, [board]);

  // Drop selection / drawer for cards that no longer exist.
  useEffect(() => {
    if (!board) return;
    const ids = new Set(board.tasks.map((x) => x.id));
    setSelected((prev) => (prev.size === 0 || [...prev].every((id) => ids.has(id)) ? prev : new Set([...prev].filter((id) => ids.has(id)))));
    setOpenId((id) => (id && !ids.has(id) ? null : id));
  }, [board]);

  /** Run an IPC mutation: toast failures, then refresh. */
  const act = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), { variant: "error" });
    }
    await refresh();
  }, [refresh, showToast]);

  /** Run one call per id; surface a single toast if any failed. */
  const actAll = useCallback(async (ids: string[], fn: (id: string) => Promise<unknown>) => {
    const results = await Promise.allSettled(ids.map(fn));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) showToast(failed.reason instanceof Error ? failed.reason.message : String(failed.reason), { variant: "error" });
    await refresh();
  }, [refresh, showToast]);

  const visibleTasks = useMemo(() => (board ? filterTasks(board.tasks, filters) : []), [board, filters]);
  const tasksByColumn = useMemo(() => {
    const sorted = [...visibleTasks].sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    return Object.fromEntries(
      KANBAN_COLUMNS.map((col) => [col, sorted.filter((x) => x.status === col)]),
    ) as Record<KanbanStatus, KanbanTask[]>;
  }, [visibleTasks]);
  const visibleOrder = useMemo(() => KANBAN_COLUMNS.flatMap((c) => tasksByColumn[c].map((x) => x.id)), [tasksByColumn]);
  const projects = useMemo(() => (board ? boardProjects(board.tasks) : []), [board]);

  const onSelect = useCallback((taskId: string, mode: "toggle" | "range") => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (mode === "range" && anchor.current) {
        for (const id of rangeBetween(visibleOrder, anchor.current, taskId)) next.add(id);
      } else {
        if (next.has(taskId)) next.delete(taskId);
        else next.add(taskId);
        anchor.current = taskId;
      }
      return next;
    });
  }, [visibleOrder]);

  const onSelectAll = useCallback((ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const selectedTasks = board ? board.tasks.filter((x) => selected.has(x.id)) : [];

  const moveSelected = (status: KanbanStatus, only?: KanbanStatus) => {
    const ids = selectedTasks.filter((x) => canMoveTo(x, status) && (!only || x.status === only)).map((x) => x.id);
    setSelected(new Set());
    void actAll(ids, (id) => api.kanbanMove(id, status));
  };

  const onDropTo = (taskId: string, status: KanbanStatus) => {
    // Dragging a selected card moves the whole selection.
    if (selected.has(taskId) && selected.size > 1) moveSelected(status);
    else void act(() => api.kanbanMove(taskId, status));
  };

  const togglePause = async () => {
    const next = !paused;
    try {
      await api.kanbanSetPaused(next);
      setPaused(next);
    } catch (e) {
      showToast(String(e), { variant: "error" });
    }
  };

  if (error) {
    return (
      <main className="wb-page kanban-page" aria-label={t("kanban.title")}>
        <div className="kanban-error">{error}</div>
      </main>
    );
  }

  if (!board) {
    return (
      <main className="wb-page kanban-page" aria-label={t("kanban.title")}>
        <div className="kanban-loading" aria-busy />
      </main>
    );
  }

  const openTask = openId ? board.tasks.find((x) => x.id === openId) : undefined;

  return (
    <main className="wb-page kanban-page" aria-label={t("kanban.title")}>
      <header className="kanban-toolbar">
        <span className="kanban-toolbar-title">
          <IconKanban size={16} aria-hidden />
          {t("kanban.title")}
        </span>
        <div className="kanban-toolbar-actions">
          <Button
            variant="ghost"
            onClick={() => void togglePause()}
            aria-pressed={paused}
          >
            {paused ? t("kanban.dispatcher.resume") : t("kanban.dispatcher.pause")}
          </Button>
          <Button onClick={() => setNewCard({ status: null })}>
            <IconPlus size={14} aria-hidden />
            {t("kanban.addCard")}
          </Button>
        </div>
      </header>

      <div className="kanban-filters">
        <label className="kanban-filter kanban-filter-search">
          <span>{t("kanban.filter.search")}</span>
          <Input
            value={filters.search}
            placeholder={t("kanban.filter.searchPlaceholder")}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </label>
        <label className="kanban-filter">
          <span>{t("kanban.filter.project")}</span>
          <Select value={filters.project} onChange={(e) => setFilters({ ...filters, project: e.target.value })}>
            <option value="">{t("kanban.filter.allProjects")}</option>
            {projects.map((p) => (
              <option key={p} value={p}>{projectName(p)}</option>
            ))}
          </Select>
        </label>
        <Checkbox
          label={t("kanban.filter.showArchived")}
          checked={filters.showArchived}
          onChange={(e) => setFilters({ ...filters, showArchived: e.target.checked })}
        />
        <span className="kanban-filters-spacer" />
        <Button size="sm" onClick={() => void act(() => api.kanbanNudge())} title={t("kanban.toolbar.nudgeHint")}>
          {t("kanban.toolbar.nudge")}
        </Button>
        <Button size="sm" onClick={() => void refresh()}>{t("kanban.toolbar.refresh")}</Button>
        {filtersActive(filters) && (
          <Button size="sm" variant="ghost" onClick={() => setFilters(NO_FILTERS)}>
            {t("kanban.filter.clear")}
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="kanban-bulk" role="toolbar" aria-label={t("kanban.bulk.label")}>
          <strong className="kanban-bulk-count">{t("kanban.bulk.selected", { count: selected.size })}</strong>
          <Button size="sm" onClick={() => moveSelected("todo")}>{t("kanban.action.toTodo")}</Button>
          <Button size="sm" onClick={() => moveSelected("ready")}>{t("kanban.action.toReady")}</Button>
          <Button size="sm" onClick={() => moveSelected("blocked")}>{t("kanban.action.block")}</Button>
          <Button size="sm" onClick={() => moveSelected("ready", "blocked")}>{t("kanban.action.unblock")}</Button>
          <Button size="sm" onClick={() => moveSelected("done")}>{t("kanban.action.complete")}</Button>
          <Button
            size="sm"
            onClick={() => {
              const ids = [...selected];
              setSelected(new Set());
              void actAll(ids, (id) => api.kanbanArchive(id, true));
            }}
          >
            {t("kanban.card.archive")}
          </Button>
          <Input
            className="kanban-bulk-priority"
            type="number"
            min={0}
            value={bulkPriority}
            placeholder={t("kanban.bulk.priorityPlaceholder")}
            onChange={(e) => setBulkPriority(e.target.value)}
          />
          <Button
            size="sm"
            disabled={bulkPriority === ""}
            onClick={() => {
              const priority = Number(bulkPriority) || 0;
              setBulkPriority("");
              void actAll([...selected], (id) => api.kanbanUpdate(id, { priority }));
            }}
          >
            {t("kanban.bulk.setPriority")}
          </Button>
          <span className="kanban-filters-spacer" />
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(visibleOrder))}>
            {t("kanban.bulk.selectAllVisible")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t("kanban.bulk.clear")}</Button>
        </div>
      )}

      {newCard && (
        <NewCardSheet
          board={board}
          workspacePath={workspacePath}
          status={newCard.status}
          onDone={() => { setNewCard(null); void refresh(); }}
        />
      )}

      <div className="kanban-board">
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col}
            status={col}
            tasks={tasksByColumn[col]}
            board={board}
            selected={selected}
            needsApprovalSet={needsApproval}
            onOpen={setOpenId}
            onSelect={onSelect}
            onSelectAll={onSelectAll}
            onAdd={(status) => setNewCard({ status })}
            onDropTo={onDropTo}
          />
        ))}
      </div>

      {openTask && (
        <KanbanDrawer
          key={openTask.id}
          board={board}
          task={openTask}
          act={act}
          onClose={() => setOpenId(null)}
          onOpen={setOpenId}
        />
      )}
    </main>
  );
}
