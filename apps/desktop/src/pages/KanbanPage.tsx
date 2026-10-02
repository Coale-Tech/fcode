/**
 * KanbanPage — six-column board (Triage → Done) backed by kanban-core state.
 *
 * HD4: [kanban] sessions are filtered out of the sidebar by default.
 * HD2: "Needs approval" badge shown on running cards that emit tool_permission_request.
 *
 * Ponytail: native HTML5 drag-and-drop; no external DnD library.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { KanbanBoard, KanbanStatus, KanbanTask } from "@pi-desktop/shared";
import { IPC } from "@pi-desktop/shared";
import { useAppStore } from "../stores/app-store";
import { api } from "../lib/api";
import { IconPlus, IconKanban } from "../components/icons";
import { Button } from "../components/ui";

const COLUMNS: KanbanStatus[] = ["triage", "todo", "ready", "running", "blocked", "done"];

const STATUS_MOVE_TARGETS: Record<KanbanStatus, KanbanStatus[]> = {
  triage:  ["todo", "ready", "blocked", "done"],
  todo:    ["triage", "ready", "blocked", "done"],
  ready:   ["triage", "todo", "blocked", "done"],
  running: ["blocked", "done"],
  blocked: ["todo", "ready", "done"],
  done:    ["triage", "todo", "ready"],
};

function useKanbanBoard() {
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [error, setError] = useState("");
  const revision = useRef(0);

  const refresh = useCallback(async () => {
    const req = ++revision.current;
    try {
      const { value } = await api.kanbanList();
      if (revision.current === req && value) setBoard(value.board);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Listen for board changes from the main process
  useEffect(() => {
    const win = window as { electron?: { on?: (ch: string, cb: () => void) => () => void } };
    return win.electron?.on?.(IPC.event.kanbanChanged, refresh);
  }, [refresh]);

  return { board, error, refresh };
}

// ── Drag state ────────────────────────────────────────────────────────────────
let dragTaskId: string | null = null;

// ── Card ──────────────────────────────────────────────────────────────────────

function KanbanCard({
  task,
  needsApproval,
  onMove,
  onArchive,
}: {
  task: KanbanTask;
  needsApproval: boolean;
  onMove: (taskId: string, status: KanbanStatus) => void;
  onArchive: (taskId: string, archived: boolean) => void;
}) {
  const { t } = useTranslation();
  const [showMenu, setShowMenu] = useState(false);
  const targets = STATUS_MOVE_TARGETS[task.status] ?? [];

  return (
    <div
      className="kanban-card"
      draggable
      onDragStart={() => { dragTaskId = task.id; }}
      onDragEnd={() => { dragTaskId = null; }}
      data-status={task.status}
      data-blocked={task.blockKind ?? undefined}
    >
      <div className="kanban-card-title">
        <span className="kanban-card-title-text">{task.title}</span>
        {needsApproval && (
          <span className="kanban-badge kanban-badge-approval">
            {t("kanban.card.needsApproval")}
          </span>
        )}
        {task.blockKind === "gave_up" && (
          <span className="kanban-badge kanban-badge-gave-up">{t("kanban.card.gaveUp")}</span>
        )}
      </div>

      <div className="kanban-card-actions">
        <button
          type="button"
          className="kanban-card-action-btn"
          aria-label={t("kanban.card.moveTo")}
          onClick={() => setShowMenu((v) => !v)}
        >
          {t("kanban.card.moveTo")}
        </button>
        <button
          type="button"
          className="kanban-card-action-btn"
          onClick={() => onArchive(task.id, !task.archived)}
          aria-label={task.archived ? t("kanban.card.unarchive") : t("kanban.card.archive")}
        >
          {task.archived ? t("kanban.card.unarchive") : t("kanban.card.archive")}
        </button>
      </div>

      {showMenu && (
        <div className="kanban-move-menu" role="menu">
          {targets.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              className="kanban-move-item"
              onClick={() => { setShowMenu(false); onMove(task.id, s); }}
            >
              {t(`kanban.columns.${s}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  tasks,
  needsApprovalSet,
  onMove,
  onArchive,
}: {
  status: KanbanStatus;
  tasks: KanbanTask[];
  needsApprovalSet: Set<string>;
  onMove: (taskId: string, status: KanbanStatus) => void;
  onArchive: (taskId: string, archived: boolean) => void;
}) {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);

  return (
    <div
      className={`kanban-column${over ? " kanban-column-over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (dragTaskId) onMove(dragTaskId, status);
      }}
      aria-label={t(`kanban.columns.${status}`)}
    >
      <div className="kanban-column-header">
        <span className="kanban-column-title">{t(`kanban.columns.${status}`)}</span>
        <span className="kanban-column-count">{tasks.length}</span>
      </div>
      <div className="kanban-column-cards">
        {tasks.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            needsApproval={needsApprovalSet.has(task.id)}
            onMove={onMove}
            onArchive={onArchive}
          />
        ))}
        {tasks.length === 0 && (
          <div className="kanban-column-empty" aria-hidden />
        )}
      </div>
    </div>
  );
}

// ── New card sheet ────────────────────────────────────────────────────────────

function NewCardSheet({
  workspacePath,
  onDone,
}: {
  workspacePath: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const showToast = useAppStore((s) => s.showToast);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.kanbanCreate({ title: title.trim(), body, projectPath: workspacePath });
      onDone();
    } catch (e) {
      showToast({ message: String(e), variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="kanban-new-card-sheet" role="dialog" aria-label={t("kanban.newCard")}>
      <h2 className="kanban-new-card-title">{t("kanban.newCard")}</h2>
      <input
        className="kanban-new-card-input"
        placeholder={t("kanban.newCard")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
      />
      <textarea
        className="kanban-new-card-body"
        placeholder={t("kanban.card.comment")}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
      />
      <div className="kanban-new-card-actions">
        <Button variant="ghost" onClick={onDone} disabled={busy}>{t("errors.action.dismiss")}</Button>
        <Button onClick={() => void submit()} disabled={busy || !title.trim()}>{t("kanban.addCard")}</Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function KanbanPage() {
  const { t } = useTranslation();
  const showToast = useAppStore((s) => s.showToast);
  const workspacePath = useAppStore((s) => s.workspace?.path ?? "");
  const { board, error, refresh } = useKanbanBoard();
  const [showNewCard, setShowNewCard] = useState(false);
  const [paused, setPaused] = useState(false);
  // taskId → true for tasks whose running session needs approval
  const [needsApproval, setNeedsApproval] = useState<Set<string>>(new Set());

  // HD2: listen for permission_request events and map sessionId → taskId
  useEffect(() => {
    if (!board) return;
    const sessionToTask = new Map(
      board.tasks.filter((t) => t.sessionId).map((t) => [t.sessionId!, t.id]),
    );
    const win = window as { electron?: { on?: (ch: string, cb: (payload: unknown) => void) => () => void } };
    const off = win.electron?.on?.(IPC.event.agentEvent, (payload) => {
      if (
        payload &&
        typeof payload === "object" &&
        "event" in payload &&
        "sessionId" in payload
      ) {
        const ev = payload as { event: { type?: string }; sessionId: string };
        if (ev.event?.type === "tool_permission_request") {
          const taskId = sessionToTask.get(ev.sessionId);
          if (taskId) setNeedsApproval((prev) => new Set([...prev, taskId]));
        }
        // Clear when session ends (agent_end / error)
        if (ev.event?.type === "agent_end" || ev.event?.type === "error") {
          const taskId = sessionToTask.get(ev.sessionId);
          if (taskId) setNeedsApproval((prev) => { const n = new Set(prev); n.delete(taskId); return n; });
        }
      }
    });
    return off;
  }, [board]);

  const handleMove = useCallback(async (taskId: string, status: KanbanStatus) => {
    try {
      await api.kanbanMove(taskId, status);
      await refresh();
    } catch (e) {
      showToast({ message: String(e), variant: "error" });
    }
  }, [refresh, showToast]);

  const handleArchive = useCallback(async (taskId: string, archived: boolean) => {
    try {
      await api.kanbanArchive(taskId, archived);
      await refresh();
    } catch (e) {
      showToast({ message: String(e), variant: "error" });
    }
  }, [refresh, showToast]);

  const togglePause = async () => {
    const next = !paused;
    try {
      await api.kanbanSetPaused(next);
      setPaused(next);
    } catch (e) {
      showToast({ message: String(e), variant: "error" });
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

  const visibleTasks = board.tasks.filter((t) => !t.archived);
  const tasksByColumn = Object.fromEntries(
    COLUMNS.map((col) => [col, visibleTasks.filter((t) => t.status === col)]),
  ) as Record<KanbanStatus, KanbanTask[]>;

  const empty = visibleTasks.length === 0;

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
          <Button onClick={() => setShowNewCard(true)}>
            <IconPlus size={14} aria-hidden />
            {t("kanban.addCard")}
          </Button>
        </div>
      </header>

      {showNewCard && (
        <div className="kanban-sheet-overlay">
          <NewCardSheet
            workspacePath={workspacePath}
            onDone={() => { setShowNewCard(false); void refresh(); }}
          />
        </div>
      )}

      {empty ? (
        <div className="kanban-empty-state">
          <IconKanban size={32} aria-hidden className="kanban-empty-icon" />
          <p>{t("kanban.empty")}</p>
          <Button onClick={() => setShowNewCard(true)}>
            <IconPlus size={14} aria-hidden />
            {t("kanban.newCard")}
          </Button>
        </div>
      ) : (
        <div className="kanban-board">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col}
              status={col}
              tasks={tasksByColumn[col]}
              needsApprovalSet={needsApproval}
              onMove={handleMove}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}
    </main>
  );
}
