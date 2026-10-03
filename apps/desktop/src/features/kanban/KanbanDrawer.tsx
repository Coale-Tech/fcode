/**
 * KanbanDrawer — right-side card detail (Hermes layout): properties, status
 * actions, description, dependencies, result, comments, events, worker
 * session, run history, and a pinned comment box. Reads everything from the
 * live board, so it refreshes with `kanbanChanged` without its own polling.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { KanbanBoard, KanbanStatus, KanbanTask } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { formatUpdated } from "../../lib/project-archive";
import { useAppStore } from "../../stores/app-store";
import { Markdown } from "../../components/Markdown";
import { IconClose } from "../../components/icons";
import { Button, Input, Select, Textarea, portalOverlay } from "../../components/ui";
import {
  canMoveTo,
  formatDuration,
  projectName,
  shortId,
  workerSessionId,
} from "./kanban-model";

const EVENT_LIMIT = 20;
const RUN_COLLAPSED = 3;

type Editing = "title" | "body" | "priority" | null;

export function KanbanDrawer({
  board,
  task,
  act,
  onClose,
  onOpen,
}: {
  board: KanbanBoard;
  task: KanbanTask;
  /** Runs an IPC call, toasts failures, refreshes the board. */
  act: (fn: () => Promise<unknown>) => Promise<void>;
  onClose: () => void;
  onOpen: (taskId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const selectSession = useAppStore((s) => s.selectSession);
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState("");
  const [parentPick, setParentPick] = useState("");
  const [childPick, setChildPick] = useState("");
  const [comment, setComment] = useState("");
  const [allRuns, setAllRuns] = useState(false);

  // Esc cancels an open edit first, then closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editing) setEditing(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing, onClose]);

  const ago = (ts?: number) => formatUpdated(ts, i18n.language);
  const byId = new Map(board.tasks.map((x) => [x.id, x]));
  const parents = board.links.filter((l) => l.childId === task.id).map((l) => byId.get(l.parentId));
  const children = board.links.filter((l) => l.parentId === task.id).map((l) => byId.get(l.childId));
  const linked = new Set([task.id, ...parents.map((p) => p?.id), ...children.map((c) => c?.id)]);
  const candidates = board.tasks.filter((x) => !x.archived && !linked.has(x.id));
  const comments = board.comments.filter((c) => c.taskId === task.id);
  const events = board.events.filter((e) => e.taskId === task.id).slice(-EVENT_LIMIT).reverse();
  const runs = board.runs.filter((r) => r.taskId === task.id).sort((a, b) => b.startedAt - a.startedAt);
  const shownRuns = allRuns ? runs : runs.slice(0, RUN_COLLAPSED);
  const sessionId = workerSessionId(task, runs);

  const startEdit = (field: Exclude<Editing, null>) => {
    setDraft(field === "title" ? task.title : field === "body" ? task.body : String(task.priority));
    setEditing(field);
  };
  const saveEdit = async () => {
    const field = editing;
    setEditing(null);
    if (field === "title") await act(() => api.kanbanUpdate(task.id, { title: draft }));
    else if (field === "body") await act(() => api.kanbanUpdate(task.id, { body: draft }));
    else if (field === "priority") await act(() => api.kanbanUpdate(task.id, { priority: Number(draft) || 0 }));
  };
  const editKeys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && editing !== "body") {
      e.preventDefault();
      void saveEdit();
    }
  };
  const move = (status: KanbanStatus) => act(() => api.kanbanMove(task.id, status));
  const submitComment = async () => {
    const body = comment.trim();
    if (!body) return;
    setComment("");
    await act(() => api.kanbanComment(task.id, body));
  };

  const actions: Array<{ key: string; label: string; enabled: boolean; run: () => void }> = [
    { key: "triage", label: t("kanban.action.toTriage"), enabled: canMoveTo(task, "triage"), run: () => void move("triage") },
    { key: "todo", label: t("kanban.action.toTodo"), enabled: canMoveTo(task, "todo"), run: () => void move("todo") },
    { key: "ready", label: t("kanban.action.toReady"), enabled: canMoveTo(task, "ready"), run: () => void move("ready") },
    { key: "block", label: t("kanban.action.block"), enabled: canMoveTo(task, "blocked"), run: () => void move("blocked") },
    { key: "unblock", label: t("kanban.action.unblock"), enabled: task.status === "blocked", run: () => void move("ready") },
    { key: "complete", label: t("kanban.action.complete"), enabled: canMoveTo(task, "done"), run: () => void move("done") },
    {
      key: "archive",
      label: task.archived ? t("kanban.card.unarchive") : t("kanban.card.archive"),
      enabled: true,
      run: () => void act(() => api.kanbanArchive(task.id, !task.archived)),
    },
  ];

  const chip = (other: KanbanTask | undefined, onRemove: () => void) =>
    other && (
      <span key={other.id} className="kanban-dep-chip">
        <button type="button" className="kanban-dep-open" title={other.title} onClick={() => onOpen(other.id)}>
          {shortId(other.id)}
        </button>
        <button
          type="button"
          className="kanban-dep-remove"
          aria-label={t("kanban.drawer.removeLink")}
          onClick={onRemove}
        >
          ×
        </button>
      </span>
    );

  const picker = (
    value: string,
    setValue: (v: string) => void,
    placeholder: string,
    buttonLabel: string,
    link: (id: string) => Promise<unknown>,
  ) => (
    <div className="kanban-dep-add">
      <Select value={value} onChange={(e) => setValue(e.target.value)} aria-label={placeholder}>
        <option value="">{placeholder}</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>{`${shortId(c.id)} · ${c.title}`}</option>
        ))}
      </Select>
      <Button
        size="sm"
        disabled={!value}
        onClick={() => {
          const id = value;
          setValue("");
          void act(() => link(id));
        }}
      >
        {buttonLabel}
      </Button>
    </div>
  );

  const prop = (label: string, value: React.ReactNode) => (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );

  return portalOverlay(
    <div className="overlay kanban-drawer-shade" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="kanban-drawer" role="dialog" aria-label={task.title}>
        <header className="kanban-drawer-head">
          <span className="kanban-card-id">{shortId(task.id)}</span>
          <button type="button" className="kanban-drawer-close" aria-label={t("kanban.drawer.close")} onClick={onClose}>
            <IconClose size={14} aria-hidden />
          </button>
        </header>

        <div className="kanban-drawer-body">
          <div className="kanban-drawer-title">
            <span className="kanban-dot" data-status={task.status} aria-hidden />
            {editing === "title" ? (
              <Input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={editKeys}
              />
            ) : (
              <h2 className="kanban-drawer-title-text" onClick={() => startEdit("title")}>
                {task.title}
              </h2>
            )}
          </div>

          <dl className="kanban-props">
            {prop(t("kanban.drawer.status"), t(`kanban.columns.${task.status}`))}
            {prop(t("kanban.drawer.project"), <span title={task.projectPath}>{projectName(task.projectPath)}</span>)}
            {prop(
              t("kanban.drawer.priority"),
              editing === "priority" ? (
                <Input
                  autoFocus
                  type="number"
                  min={0}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={editKeys}
                />
              ) : (
                <button type="button" className="kanban-inline-edit" onClick={() => startEdit("priority")}>
                  {task.priority}
                </button>
              ),
            )}
            {task.modelOverride && prop(t("kanban.drawer.model"), task.modelOverride)}
            {prop(t("kanban.drawer.createdBy"), t(task.createdBy === "agent" ? "kanban.card.byAgent" : "kanban.card.byUser"))}
            {prop(t("kanban.drawer.created"), ago(task.createdAt))}
            {task.startedAt && prop(t("kanban.drawer.started"), ago(task.startedAt))}
            {task.completedAt && prop(t("kanban.drawer.completed"), ago(task.completedAt))}
            {task.status === "blocked" && task.blockReason && prop(t("kanban.drawer.blockReason"), task.blockReason)}
          </dl>

          <div className="kanban-actions">
            {actions.map((a) => (
              <Button key={a.key} size="sm" disabled={!a.enabled} onClick={a.run}>
                {a.label}
              </Button>
            ))}
          </div>

          <section className="kanban-section">
            <div className="kanban-section-head">
              <h3>{t("kanban.drawer.description")}</h3>
              {editing !== "body" && (
                <button type="button" className="kanban-link-btn" onClick={() => startEdit("body")}>
                  {t("kanban.drawer.edit")}
                </button>
              )}
            </div>
            {editing === "body" ? (
              <div className="kanban-body-edit">
                <Textarea autoFocus rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} />
                <div className="kanban-body-edit-actions">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{t("kanban.drawer.cancel")}</Button>
                  <Button size="sm" variant="primary" onClick={() => void saveEdit()}>{t("kanban.drawer.save")}</Button>
                </div>
              </div>
            ) : task.body.trim() ? (
              <div className="kanban-md"><Markdown source={task.body} renderDiagrams={false} /></div>
            ) : (
              <p className="kanban-muted">{t("kanban.drawer.noDescription")}</p>
            )}
          </section>

          <section className="kanban-section">
            <h3>{t("kanban.drawer.dependencies")}</h3>
            <div className="kanban-dep-row">
              <span className="kanban-dep-label">{t("kanban.drawer.parents")}</span>
              {parents.length === 0 && <em className="kanban-muted">{t("kanban.drawer.none")}</em>}
              {parents.map((p) => chip(p, () => void act(() => api.kanbanUnlink(p!.id, task.id))))}
            </div>
            {picker(parentPick, setParentPick, t("kanban.drawer.addParent"), t("kanban.drawer.addParentBtn"), (id) =>
              api.kanbanLink(id, task.id),
            )}
            <div className="kanban-dep-row">
              <span className="kanban-dep-label">{t("kanban.drawer.children")}</span>
              {children.length === 0 && <em className="kanban-muted">{t("kanban.drawer.none")}</em>}
              {children.map((c) => chip(c, () => void act(() => api.kanbanUnlink(task.id, c!.id))))}
            </div>
            {picker(childPick, setChildPick, t("kanban.drawer.addChild"), t("kanban.drawer.addChildBtn"), (id) =>
              api.kanbanLink(task.id, id),
            )}
          </section>

          {task.result?.trim() && (
            <section className="kanban-section">
              <h3>{t("kanban.drawer.result")}</h3>
              <div className="kanban-md"><Markdown source={task.result} renderDiagrams={false} /></div>
            </section>
          )}

          <section className="kanban-section">
            <h3>{t("kanban.drawer.comments", { count: comments.length })}</h3>
            {comments.length === 0 && <p className="kanban-muted">{t("kanban.drawer.noComments")}</p>}
            {comments.map((c) => (
              <div key={c.id} className="kanban-comment">
                <div className="kanban-comment-meta">
                  <strong>{c.author}</strong>
                  <span>{ago(c.createdAt)}</span>
                </div>
                <div className="kanban-md"><Markdown source={c.body} renderDiagrams={false} /></div>
              </div>
            ))}
          </section>

          <section className="kanban-section">
            <h3>{t("kanban.drawer.events", { count: events.length })}</h3>
            {events.map((e) => (
              <div key={e.id} className="kanban-event">
                <span className="kanban-event-kind">{e.kind.replace(/_/g, " ")}</span>
                <span className="kanban-event-ago">{ago(e.ts)}</span>
                {e.payload != null && <code className="kanban-event-payload">{JSON.stringify(e.payload)}</code>}
              </div>
            ))}
          </section>

          <section className="kanban-section">
            <div className="kanban-section-head">
              <h3>{t("kanban.drawer.worker")}</h3>
              {sessionId && (
                <button type="button" className="kanban-link-btn" onClick={() => void selectSession(sessionId)}>
                  {t("kanban.drawer.openWorker")}
                </button>
              )}
            </div>
            {!sessionId && <p className="kanban-muted">{t("kanban.drawer.noWorker")}</p>}
          </section>

          <section className="kanban-section">
            <div className="kanban-section-head">
              <h3>{t("kanban.drawer.runs", { count: runs.length })}</h3>
              {runs.length > RUN_COLLAPSED && (
                <button type="button" className="kanban-link-btn" onClick={() => setAllRuns((v) => !v)}>
                  {allRuns ? t("kanban.drawer.fewer") : t("kanban.drawer.earlier", { count: runs.length - RUN_COLLAPSED })}
                </button>
              )}
            </div>
            {shownRuns.map((r) => (
              <div key={r.id} className="kanban-run" data-run-status={r.status}>
                <div className="kanban-run-head">
                  <span className="kanban-run-status">{t(`kanban.run.${r.status}`)}</span>
                  <span>{formatDuration((r.endedAt ?? Date.now()) - r.startedAt)}</span>
                  <span className="kanban-event-ago">{ago(r.startedAt)}</span>
                </div>
                {r.summary && <div className="kanban-md"><Markdown source={r.summary} renderDiagrams={false} /></div>}
                {r.error && <p className="kanban-run-error">{r.error}</p>}
              </div>
            ))}
          </section>
        </div>

        <footer className="kanban-drawer-foot">
          <Input
            value={comment}
            placeholder={t("kanban.drawer.commentPlaceholder")}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitComment();
              }
            }}
          />
          <Button variant="primary" disabled={!comment.trim()} onClick={() => void submitComment()}>
            {t("kanban.drawer.commentSubmit")}
          </Button>
        </footer>
      </aside>
    </div>,
  );
}
