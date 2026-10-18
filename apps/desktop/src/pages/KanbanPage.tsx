/**
 * KanbanPage — Direction D board (pages-d/kanban/fragment.html): one canvas
 * card with the page head, a filter row, six status columns and the
 * dispatcher footer; a right-side drawer (features/kanban/KanbanDrawer)
 * opens a card. Cmd/Ctrl-click and Shift-click select cards for the bulk bar.
 *
 * HD4: [kanban] sessions are filtered out of the sidebar by default.
 * HD2: "Needs approval" chip on running cards whose worker session has a queued permission request.
 *
 * Ponytail: native HTML5 drag-and-drop; no external DnD library.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { KanbanBoard, KanbanStatus, KanbanTask } from "@pi-desktop/shared";
import { IPC } from "@pi-desktop/shared";
import { useAppStore } from "../stores/app-store";
import { useBenchContext } from "../hooks/use-bench-context";
import { api } from "../lib/api";
import {
  IconChat,
  IconPause,
  IconPlay,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSquareCheck,
} from "../components/icons";
import { Button, Input, Select, Textarea, Checkbox, cx, portalOverlay } from "../components/ui";
import { KanbanDrawer } from "../features/kanban/KanbanDrawer";
import {
  KANBAN_COLUMNS,
  NO_FILTERS,
  agoParts,
  boardProjects,
  boardSummary,
  canMoveTo,
  childProgress,
  commentCount,
  filterTasks,
  filtersActive,
  formatDuration,
  projectName,
  rangeBetween,
  shortId,
  sortForColumn,
  type KanbanFilters,
} from "../features/kanban/kanban-model";

/** Columns whose "+" creates a card (the dispatcher owns Running; Blocked/Done are outcomes). */
const CREATE_COLUMNS: KanbanStatus[] = ["triage", "todo", "ready"];
/** Columns a dragged card can land in from the board (Running is dispatcher-owned). */
const DROP_COLUMNS: KanbanStatus[] = ["triage", "todo", "ready", "blocked"];
/** A drop target is drawn under the cards while the column is still short. */
const DROP_HINT_BELOW = 3;
/** Done keeps the latest few on the board; the rest sit behind "+ N more". */
const DONE_PREVIEW = 3;

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
  open,
  needsApproval,
  onOpen,
  onSelect,
}: {
  task: KanbanTask;
  board: KanbanBoard;
  selected: boolean;
  open: boolean;
  needsApproval: boolean;
  onOpen: (taskId: string) => void;
  onSelect: (taskId: string, mode: "toggle" | "range") => void;
}) {
  const { t, i18n } = useTranslation();
  const progress = childProgress(board, task.id);
  const comments = commentCount(board, task.id);
  const ago = agoParts(task.createdAt, Date.now());

  return (
    <div
      className={cx("kanban-card", selected && "kanban-card-selected", open && "kanban-card-open")}
      role="button"
      tabIndex={0}
      aria-pressed={selected || undefined}
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
          if (e.metaKey || e.ctrlKey) onSelect(task.id, "toggle");
          else onOpen(task.id);
        }
      }}
      data-status={task.status}
      data-archived={task.archived || undefined}
      data-blocked={task.blockKind ?? undefined}
    >
      <div className="kanban-card-chips">
        <span className="kanban-card-id">{shortId(task.id)}</span>
        {needsApproval && (
          <span className="kanban-chip kanban-chip-approval">{t("kanban.card.needsApproval")}</span>
        )}
        {task.blockKind === "gave_up" && (
          <span className="kanban-chip kanban-chip-gave-up">{t("kanban.card.gaveUp")}</span>
        )}
        {task.priority > 0 && (
          <span className="kanban-chip kanban-chip-priority" title={t("kanban.card.priority", { count: task.priority })}>
            P{task.priority}
          </span>
        )}
        <span className="kanban-chip" title={task.projectPath}>{projectName(task.projectPath)}</span>
        {task.agent && (
          <span className="kanban-chip kanban-chip-agent" title={t("kanban.card.agent", { agent: task.agent })}>
            {task.agent}
          </span>
        )}
        {progress && (
          <span
            className={cx("kanban-chip kanban-chip-progress", progress.done === progress.total && "kanban-chip-full")}
            title={t("kanban.card.progress", progress)}
          >
            {progress.done}/{progress.total}
          </span>
        )}
        {task.archived && <span className="kanban-chip">{t("kanban.card.archived")}</span>}
      </div>

      <div className="kanban-card-title">{task.title}</div>

      <div className="kanban-card-meta">
        <span>{t(task.createdBy === "agent" ? "kanban.card.byAgent" : "kanban.card.byUser")}</span>
        {comments > 0 && (
          <span className="kanban-count" title={t("kanban.card.comments", { count: comments })}>
            <IconChat size={10} aria-hidden /> {comments}
          </span>
        )}
        <span className="kanban-card-ago" title={new Date(task.createdAt).toLocaleString(i18n.language)}>
          {t(`kanban.card.${ago.key}`, { count: ago.count })}
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
  openId,
  needsApprovalSet,
  showArchived,
  onOpen,
  onSelect,
  onAdd,
  onDropTo,
  onShowArchived,
}: {
  status: KanbanStatus;
  tasks: KanbanTask[];
  board: KanbanBoard;
  selected: Set<string>;
  openId: string | null;
  needsApprovalSet: Set<string>;
  showArchived: boolean;
  onOpen: (taskId: string) => void;
  onSelect: (taskId: string, mode: "toggle" | "range") => void;
  onAdd: (status: KanbanStatus) => void;
  onDropTo: (taskId: string, status: KanbanStatus) => void;
  onShowArchived: () => void;
}) {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const label = t(`kanban.columns.${status}`);
  const collapsible = status === "done" && !expanded && tasks.length > DONE_PREVIEW;
  const shown = collapsible ? tasks.slice(0, DONE_PREVIEW) : tasks;
  const dropHint = DROP_COLUMNS.includes(status) && tasks.length < DROP_HINT_BELOW;

  return (
    <section
      className={cx("kanban-column", over && "kanban-column-over")}
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
        {status === "running" && <span className="kanban-run-dot" aria-hidden />}
        <span className="kanban-column-title" title={t(`kanban.columnHelp.${status}`)}>{label}</span>
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
            <IconPlus size={11} aria-hidden />
          </button>
        )}
      </div>
      <div className="kanban-column-cards">
        {shown.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            board={board}
            selected={selected.has(task.id)}
            open={openId === task.id}
            needsApproval={needsApprovalSet.has(task.id)}
            onOpen={onOpen}
            onSelect={onSelect}
          />
        ))}
        {collapsible && (
          <div className="kanban-column-more">
            <button type="button" className="kanban-column-more-btn" onClick={() => setExpanded(true)}>
              {t("kanban.column.more", { count: tasks.length - DONE_PREVIEW })}
            </button>
            {!showArchived && (
              <>
                <span aria-hidden> · </span>
                <button type="button" className="kanban-column-more-btn" onClick={onShowArchived}>
                  {t("kanban.column.showArchived")}
                </button>
              </>
            )}
          </div>
        )}
        {dropHint && (
          <div className="kanban-column-drop">
            {status !== "blocked" && <IconSquareCheck size={16} aria-hidden />}
            {t("kanban.column.drop")}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Active-worker roster ──────────────────────────────────────────────────────

function KanbanRoster({ board }: { board: KanbanBoard }) {
  const { t } = useTranslation();
  const running = board.tasks.filter((x) => x.status === "running" && !x.archived);
  if (running.length === 0) return null;
  return (
    <section className="kanban-roster" aria-label={t("kanban.roster.title")}>
      <strong className="kanban-roster-title">{t("kanban.roster.title")}</strong>
      {running.map((task) => {
        const run = board.runs.find((r) => r.taskId === task.id && r.endedAt == null);
        return (
          <span key={task.id} className="kanban-roster-item" title={task.title}>
            <span className="kanban-roster-agent">{task.agent ?? t("kanban.roster.generic")}</span>
            <span className="kanban-roster-task">{task.title}</span>
            {run && <span className="kanban-roster-time">{formatDuration(Date.now() - run.startedAt)}</span>}
          </span>
        );
      })}
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
        status: status === null ? "triage" : status === "triage" || status === "todo" ? status : undefined,
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
  const bench = useBenchContext();
  const { board, error, refresh, paused, setPaused } = useKanbanBoard();
  const [newCard, setNewCard] = useState<{ status: KanbanStatus | null } | null>(null);
  const [filters, setFilters] = useState<KanbanFilters>(NO_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkPriority, setBulkPriority] = useState("");
  const anchor = useRef<string | null>(null);
  // HD2: a running card needs approval while its worker session has a queued
  // tool permission request (the store keeps one queue per session until answered).
  const pendingPermissions = useAppStore((s) => s.pendingPermissions);
  const needsApproval = useMemo(
    () =>
      new Set(
        (board?.tasks ?? [])
          .filter((x) => x.status === "running" && x.sessionId && pendingPermissions[x.sessionId]?.length)
          .map((x) => x.id),
      ),
    [board, pendingPermissions],
  );

  // Drop selection / drawer for cards that no longer exist.
  useEffect(() => {
    if (!board) return;
    const ids = new Set(board.tasks.map((x) => x.id));
    setSelected((prev) => (prev.size === 0 || [...prev].every((id) => ids.has(id)) ? prev : new Set([...prev].filter((id) => ids.has(id)))));
    setOpenId((id) => (id && !ids.has(id) ? null : id));
  }, [board]);

  // D3: the open card's id becomes the breadcrumb's detail segment.
  const setPageCrumb = useAppStore((s) => s.setPageCrumb);
  useEffect(() => {
    setPageCrumb(openId ? shortId(openId) : null);
    return () => setPageCrumb(null);
  }, [openId, setPageCrumb]);

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
    const sorted = sortForColumn(visibleTasks);
    return Object.fromEntries(
      KANBAN_COLUMNS.map((col) => [col, sorted.filter((x) => x.status === col)]),
    ) as Record<KanbanStatus, KanbanTask[]>;
  }, [visibleTasks]);
  const visibleOrder = useMemo(() => KANBAN_COLUMNS.flatMap((c) => tasksByColumn[c].map((x) => x.id)), [tasksByColumn]);
  const projects = useMemo(() => (board ? boardProjects(board.tasks) : []), [board]);
  const summary = useMemo(() => boardSummary(board?.tasks ?? []), [board]);

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
        <div className="d-panel kanban-panel">
          <div className="kanban-error">{error}</div>
        </div>
      </main>
    );
  }

  if (!board) {
    return (
      <main className="wb-page kanban-page" aria-label={t("kanban.title")}>
        <div className="d-panel kanban-panel">
          <div className="kanban-loading" aria-busy />
        </div>
      </main>
    );
  }

  const openTask = openId ? board.tasks.find((x) => x.id === openId) : undefined;
  // Footer scope: the filtered project, else the active bench, else the workspace.
  const footProject = filters.project
    ? projectName(filters.project)
    : bench.kind !== "empty" ? bench.benchName : projectName(workspacePath);

  return (
    <main className="wb-page kanban-page" aria-label={t("kanban.title")}>
      <div className={cx("d-panel kanban-panel", openTask && "is-drawer-open")}>
        <header className="d-page-head">
          <span className="d-page-title">{t("kanban.title")}</span>
          {paused ? (
            <span className="d-pill amber"><span className="d-pill-dot" />{t("kanban.pausedPill")}</span>
          ) : (
            <span className="d-pill green">
              <span className="d-pill-dot" />
              {t("kanban.runningCount", { count: summary.running })}
            </span>
          )}
          <div className="d-page-head-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void togglePause()}
              aria-pressed={paused}
            >
              {paused ? <IconPlay size={11} aria-hidden /> : <IconPause size={11} aria-hidden />}
              {paused ? t("kanban.dispatcher.resume") : t("kanban.dispatcher.pause")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void act(() => api.kanbanNudge())}
              title={t("kanban.toolbar.nudgeHint")}
            >
              {t("kanban.toolbar.nudge")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              <IconRefresh size={12} aria-hidden />
              {t("kanban.toolbar.refresh")}
            </Button>
            <Button size="sm" variant="primary" onClick={() => setNewCard({ status: null })}>
              <IconPlus size={12} aria-hidden />
              {t("kanban.addCard")}
            </Button>
          </div>
        </header>

        <div className="kanban-filters">
          <label className="kanban-search">
            <IconSearch size={12} aria-hidden />
            <input
              type="search"
              value={filters.search}
              placeholder={t("kanban.filter.searchPlaceholder")}
              aria-label={t("kanban.filter.search")}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </label>
          <Select
            className="kanban-project"
            value={filters.project}
            aria-label={t("kanban.filter.project")}
            onChange={(e) => setFilters({ ...filters, project: e.target.value })}
          >
            <option value="">{t("kanban.filter.allProjects")}</option>
            {projects.map((p) => (
              <option key={p} value={p}>{projectName(p)}</option>
            ))}
          </Select>
          <Checkbox
            label={t("kanban.filter.showArchived")}
            checked={filters.showArchived}
            onChange={(e) => setFilters({ ...filters, showArchived: e.target.checked })}
          />
          {filtersActive(filters) && (
            <Button variant="ghost" size="sm" onClick={() => setFilters(NO_FILTERS)}>
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

        <KanbanRoster board={board} />

        <div className="kanban-board">
          {KANBAN_COLUMNS.map((col) => (
            <KanbanColumn
              key={col}
              status={col}
              tasks={tasksByColumn[col]}
              board={board}
              selected={selected}
              openId={openTask?.id ?? null}
              needsApprovalSet={needsApproval}
              showArchived={filters.showArchived}
              onOpen={setOpenId}
              onSelect={onSelect}
              onAdd={(status) => setNewCard({ status })}
              onDropTo={onDropTo}
              onShowArchived={() => setFilters({ ...filters, showArchived: true })}
            />
          ))}
        </div>

        <footer className="kanban-foot">
          <span className="kanban-foot-dot" data-paused={paused || undefined} aria-hidden />
          <span>
            {paused
              ? t("kanban.dispatcher.footerPaused")
              : t("kanban.dispatcher.footerRunning", { count: summary.running })}
          </span>
          <span className="kanban-foot-sep" aria-hidden />
          <span>
            {t("kanban.dispatcher.summary", {
              open: summary.open,
              blocked: summary.blocked,
              done: summary.done,
            })}
          </span>
          {footProject && (
            <>
              <span className="kanban-foot-sep" aria-hidden />
              <span className="kanban-foot-end">{footProject}</span>
            </>
          )}
        </footer>
      </div>

      {newCard && (
        <NewCardSheet
          board={board}
          workspacePath={workspacePath}
          status={newCard.status}
          onDone={() => { setNewCard(null); void refresh(); }}
        />
      )}

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
