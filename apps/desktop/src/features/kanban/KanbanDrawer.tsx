/**
 * KanbanDrawer — Direction D card detail (pages-d/kanban/fragment-drawer.html):
 * a 420px right drawer over the dimmed board. Head carries id, status dot and
 * the (click-to-edit) title; the body runs properties, actions, description,
 * dependencies, result, runs, events, comments and the worker session; a
 * pinned comment box closes it. Reads everything from the live board, so it
 * refreshes with `kanbanChanged` without its own polling.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { KanbanBoard, KanbanStatus, KanbanTask } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { Markdown } from "../../components/Markdown";
import { IconClose, IconPlus } from "../../components/icons";
import { Button, Input, Select, Textarea, portalOverlay } from "../../components/ui";
import {
  agoParts,
  canMoveTo,
  eventTarget,
  eventTone,
  formatDuration,
  projectName,
  shortId,
  workerSessionId,
} from "./kanban-model";

const EVENT_LIMIT = 20;
const RUN_COLLAPSED = 2;

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
  const [linking, setLinking] = useState<"parent" | "child" | null>(null);
  const [linkPick, setLinkPick] = useState("");
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

  const now = Date.now();
  const ago = (ts: number) => {
    const parts = agoParts(ts, now);
    return (
      <span title={new Date(ts).toLocaleString(i18n.language)}>
        {t(`kanban.card.${parts.key}`, { count: parts.count })}
      </span>
    );
  };
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
    task.status === "blocked"
      ? { key: "unblock", label: t("kanban.action.unblock"), enabled: true, run: () => void move("ready") }
      : { key: "block", label: t("kanban.action.block"), enabled: task.status !== "done" && canMoveTo(task, "blocked"), run: () => void move("blocked") },
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

  const depRow = (kind: "parent" | "child", list: Array<KanbanTask | undefined>) => {
    const label = kind === "parent" ? t("kanban.drawer.parents") : t("kanban.drawer.children");
    const addLabel = kind === "parent" ? t("kanban.drawer.addParentBtn") : t("kanban.drawer.addChildBtn");
    const placeholder = kind === "parent" ? t("kanban.drawer.addParent") : t("kanban.drawer.addChild");
    const link = (id: string) => (kind === "parent" ? api.kanbanLink(id, task.id) : api.kanbanLink(task.id, id));
    const unlink = (other: KanbanTask) =>
      kind === "parent" ? api.kanbanUnlink(other.id, task.id) : api.kanbanUnlink(task.id, other.id);
    return (
      <>
        <div className="kanban-dep-row">
          <span className="kanban-dep-label">{label}</span>
          {list.length === 0 && <em className="kanban-muted">{t("kanban.drawer.none")}</em>}
          {list.map((other) => other && chip(other, () => void act(() => unlink(other))))}
          {candidates.length > 0 && (
            <button
              type="button"
              className="kanban-dep-add-btn"
              aria-label={addLabel}
              title={addLabel}
              aria-expanded={linking === kind}
              onClick={() => { setLinkPick(""); setLinking(linking === kind ? null : kind); }}
            >
              <IconPlus size={11} aria-hidden />
            </button>
          )}
        </div>
        {linking === kind && (
          <div className="kanban-dep-add">
            <Select autoFocus value={linkPick} onChange={(e) => setLinkPick(e.target.value)} aria-label={placeholder}>
              <option value="">{placeholder}</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{`${shortId(c.id)} · ${c.title}`}</option>
              ))}
            </Select>
            <button
              type="button"
              className="d-btn sm secondary"
              disabled={!linkPick}
              onClick={() => {
                const id = linkPick;
                setLinking(null);
                void act(() => link(id));
              }}
            >
              {addLabel}
            </button>
          </div>
        )}
      </>
    );
  };

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
          <span className="kanban-drawer-id">{shortId(task.id)}</span>
          <span className="kanban-status-dot" data-status={task.status} aria-hidden />
          {editing === "title" ? (
            <Input
              autoFocus
              className="kanban-drawer-title-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={editKeys}
            />
          ) : (
            <h2 className="kanban-drawer-title" title={task.title} onClick={() => startEdit("title")}>
              {task.title}
            </h2>
          )}
          <button type="button" className="kanban-drawer-close" aria-label={t("kanban.drawer.close")} onClick={onClose}>
            <IconClose size={14} aria-hidden />
          </button>
        </header>

        <div className="kanban-drawer-body">
          <dl className="kanban-props">
            {prop(t("kanban.drawer.status"), <span className="kanban-chip kanban-status-chip">{t(`kanban.columns.${task.status}`)}</span>)}
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
            {task.startedAt && task.status === "running" && prop(t("kanban.drawer.started"), ago(task.startedAt))}
            {task.completedAt && prop(t("kanban.drawer.completed"), ago(task.completedAt))}
            {task.status === "blocked" && task.blockReason && prop(t("kanban.drawer.blockReason"), task.blockReason)}
          </dl>

          <section className="kanban-section">
            <div className="kanban-section-head"><h3>{t("kanban.drawer.actions")}</h3></div>
            <div className="kanban-actions">
              {actions.map((a) => (
                <button key={a.key} type="button" className="d-btn sm secondary" disabled={!a.enabled} onClick={a.run}>
                  {a.label}
                </button>
              ))}
            </div>
          </section>

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
            <div className="kanban-section-head"><h3>{t("kanban.drawer.dependencies")}</h3></div>
            {depRow("parent", parents)}
            {depRow("child", children)}
          </section>

          {task.result?.trim() && (
            <section className="kanban-section">
              <div className="kanban-section-head"><h3>{t("kanban.drawer.result")}</h3></div>
              <div className="kanban-md"><Markdown source={task.result} renderDiagrams={false} /></div>
            </section>
          )}

          {runs.length > 0 && (
            <section className="kanban-section">
              <div className="kanban-section-head">
                <h3>{t("kanban.drawer.runs", { count: shownRuns.length })}</h3>
                {runs.length > RUN_COLLAPSED && (
                  <button type="button" className="kanban-link-btn" onClick={() => setAllRuns((v) => !v)}>
                    {allRuns ? t("kanban.drawer.fewer") : t("kanban.drawer.earlier")}
                  </button>
                )}
              </div>
              {shownRuns.map((r) => (
                <div key={r.id} className="kanban-run" data-run-status={r.status}>
                  <div className="kanban-run-head">
                    <span className="kanban-run-status">{t(`kanban.run.${r.status}`)}</span>
                    <span>{formatDuration((r.endedAt ?? now) - r.startedAt)}</span>
                    <span className="kanban-run-ago">{ago(r.endedAt ?? r.startedAt)}</span>
                  </div>
                  {r.summary && <div className="kanban-run-sum"><Markdown source={r.summary} renderDiagrams={false} /></div>}
                  {r.error && <p className="kanban-run-error">{r.error}</p>}
                </div>
              ))}
            </section>
          )}

          {events.length > 0 && (
            <section className="kanban-section">
              <div className="kanban-section-head"><h3>{t("kanban.drawer.events")}</h3></div>
              {events.map((e) => {
                const target = eventTarget(e.payload);
                return (
                  <div key={e.id} className="kanban-event">
                    <span className="kanban-event-dot" data-tone={eventTone(e.kind, e.payload)} aria-hidden />
                    <span className="kanban-event-kind">
                      {t(`kanban.event.${e.kind}`, { defaultValue: e.kind.replace(/_/g, " ") })}
                      {target && ` → ${t(`kanban.columns.${target}`)}`}
                    </span>
                    <span className="kanban-event-ago">{ago(e.ts)}</span>
                  </div>
                );
              })}
            </section>
          )}

          {comments.length > 0 && (
            <section className="kanban-section">
              <div className="kanban-section-head"><h3>{t("kanban.drawer.comments", { count: comments.length })}</h3></div>
              {comments.map((c) => (
                <div key={c.id} className="kanban-comment">
                  <div className="kanban-comment-meta">
                    <strong>{c.author}</strong>
                    {ago(c.createdAt)}
                  </div>
                  <div className="kanban-md"><Markdown source={c.body} renderDiagrams={false} /></div>
                </div>
              ))}
            </section>
          )}

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
        </div>

        <footer className="kanban-drawer-foot">
          <input
            className="kanban-comment-input"
            value={comment}
            placeholder={t("kanban.drawer.commentPlaceholder")}
            aria-label={t("kanban.drawer.commentPlaceholder")}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitComment();
              }
            }}
          />
          <button
            type="button"
            className="d-btn sm secondary"
            disabled={!comment.trim()}
            onClick={() => void submitComment()}
          >
            {t("kanban.drawer.commentSubmit")}
          </button>
        </footer>
      </aside>
    </div>,
  );
}
