import { Fragment, memo, useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type {
  ReviewChangeStatus,
  ReviewRollbackStatus,
  UiMessage,
} from "@pi-desktop/shared";
import { reviewChangeFromMessage } from "../lib/workspace-review";
import { extendNoteRange, isNoteOutdated, type ReviewNote } from "../lib/review-notes-prompt";
import { useAppStore } from "../stores/app-store";
import { cx, Button } from "./ui";
import { IconCheck, IconChevronRight, IconSnapshot } from "./icons";

/* Git-status letters carry the status without relying on color alone; the
   localized word stays in the row's accessible name. */
const STATUS_MARKS: Record<ReviewChangeStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
};

/** Parse a unified diff hunk header to extract the starting line numbers.
 *  Example: "@@ -85,7 +85,15 @@ def validate(self):" → { oldStart: 85, newStart: 85 } */
function parseHunkHeader(header: string): { oldStart: number; newStart: number } {
  const m = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(header);
  return { oldStart: m ? parseInt(m[1], 10) : 1, newStart: m ? parseInt(m[2], 10) : 1 };
}

type ComposingState = {
  line: number | null;
  lineIsOld: boolean | null;
  /** null for whole-file notes */
  hunkIndex: number | null;
  endLine: number | null;
  anchorText: string | null;
  body: string;
  /** Set when editing an existing note (vs adding). */
  editingId?: string;
};

/** Stable empty list: a fresh `[]` from a store selector re-renders forever (React #185). */
const NO_NOTES: ReviewNote[] = [];

export const ReviewChangeCard = memo(function ReviewChangeCard({
  message,
  compact = false,
  kept = false,
  onKeep,
  annotatable = false,
}: {
  message: UiMessage;
  compact?: boolean;
  /** Visual "accepted" state set by the parent ReviewTab. */
  kept?: boolean;
  onKeep?: () => void;
  /** When true, show gutter note affordance and render saved notes inline. */
  annotatable?: boolean;
}) {
  const { t } = useTranslation();
  const change = reviewChangeFromMessage(message);
  const detailsId = useId();
  // Cards start open — the approved mock shows expanded numbered diff by default
  const [open, setOpen] = useState(true);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackStatus, setRollbackStatus] = useState<ReviewRollbackStatus | null>(null);
  const [composing, setComposing] = useState<ComposingState | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const rollback = useAppStore((state) => state.rollbackWorkspaceChange);
  const notes = useAppStore((state) => state.reviewNotes[change?.snapshotId ?? ""] ?? NO_NOTES);
  const addReviewNote = useAppStore((state) => state.addReviewNote);
  const updateReviewNote = useAppStore((state) => state.updateReviewNote);
  const resolveReviewNote = useAppStore((state) => state.resolveReviewNote);
  const removeReviewNote = useAppStore((state) => state.removeReviewNote);

  if (!change) return null;

  const runRollback = async () => {
    if (!change.reversible || change.state === "rolledBack" || rollingBack) return;
    setRollingBack(true);
    setRollbackStatus(null);
    const result = await rollback(message.id, change.snapshotId);
    setRollingBack(false);
    // Preserve outcome — display conflict/error feedback to user
    if (result) setRollbackStatus(result.status);
  };

  const statusLabel = t(`panel.review.status.${change.status}`);
  const baseLabel = t(open ? "chat.reviewChangeHide" : "chat.reviewChangeShow", {
    status: statusLabel,
    path: change.path,
    additions: change.additions,
    deletions: change.deletions,
  });
  const accessibleLabel =
    change.state === "rolledBack"
      ? `${baseLabel} · ${t("panel.review.rolledBack")}`
      : baseLabel;

  const wholeFileNotes = annotatable ? notes.filter((n) => n.line === null) : [];

  const saveComposer = () => {
    if (!composing || !composing.body.trim()) {
      setComposing(null);
      return;
    }
    if (composing.editingId) {
      updateReviewNote(composing.editingId, composing.body.trim());
    } else {
      addReviewNote({
        snapshotId: change.snapshotId,
        path: change.path,
        line: composing.line,
        lineIsOld: composing.lineIsOld,
        endLine: composing.endLine,
        anchorText: composing.anchorText,
        body: composing.body.trim(),
      });
    }
    setComposing(null);
  };

  /* Direction D: bordered r8 file card — per-file header with inline actions */
  return (
    <div className={cx("wp-review-file", !open && "is-collapsed")} data-state={change.state} data-status={change.status}>
      {/* File card header: mark | path | +N/-N | actions | caret */}
      <div className="wp-review-file-head">
        <span
          className={cx("review-change-card-mark", `is-${change.status}`)}
          aria-hidden
        >
          {STATUS_MARKS[change.status]}
        </span>
        <span className="wp-review-file-path" title={change.path}>
          {change.path}
        </span>
        {change.additions > 0 && (
          <span className="badge badge-add">+{change.additions}</span>
        )}
        {change.deletions > 0 && (
          <span className="badge badge-del">−{change.deletions}</span>
        )}
        {/* Inline actions — visible on header regardless of expand state */}
        <div className={cx("wp-review-file-acts", compact && "is-compact")}>
          {annotatable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setComposing({
                  line: null,
                  lineIsOld: null,
                  hunkIndex: null,
                  endLine: null,
                  anchorText: null,
                  body: "",
                })
              }
              style={{ height: 20, fontSize: 11, padding: "0 5px" }}
            >
              {t("panel.review.noteFile")}
            </Button>
          )}
          {change.state === "rolledBack" ? (
            <span className="review-change-state is-rolled-back">
              <IconCheck size={12} />
              {t("panel.review.rolledBack")}
            </span>
          ) : kept ? (
            <span className="review-change-state is-kept">
              <IconCheck size={12} />
              {t("panel.review.kept", "Kept")}
            </span>
          ) : (
            <>
              {change.reversible && onKeep && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onKeep}
                  style={{ height: 20, fontSize: 11, padding: "0 5px" }}
                >
                  {t("panel.review.keep", "Keep")}
                </Button>
              )}
              {change.reversible && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void runRollback()}
                  disabled={rollingBack}
                  style={{ height: 20, fontSize: 11, padding: "0 5px", color: "var(--ink-red-7)" }}
                  title={rollingBack ? t("panel.review.rollingBack") : t("panel.review.rollback")}
                >
                  <IconSnapshot size={12} />
                  {rollingBack ? t("panel.review.rollingBack") : t("panel.review.rollback")}
                </Button>
              )}
            </>
          )}
          <button
            type="button"
            className="review-change-card-header"
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={accessibleLabel}
            title={accessibleLabel}
            onClick={() => setOpen((v) => !v)}
            style={{ minWidth: 0, padding: "0 4px" }}
          >
            <span className="review-change-card-caret" aria-hidden>
              <IconChevronRight size={11} />
            </span>
          </button>
        </div>
      </div>
      {/* Rollback outcome feedback — shown below header when present */}
      {rollbackStatus === "conflict" && (
        <div className="review-change-rollback-note is-warning" style={{ padding: "4px 8px", fontSize: 11 }}>
          {t("panel.review.rollbackConflict")}
        </div>
      )}
      {rollbackStatus === "unavailable" && (
        <div className="review-change-rollback-note" style={{ padding: "4px 8px", fontSize: 11 }}>
          {t("panel.review.rollbackUnavailable")}
        </div>
      )}
      {/* Expandable diff body */}
      {open && (
        <div className="review-change-card-body" id={detailsId}>
          {/* Whole-file note composer (shown above the diff) */}
          {annotatable && composing?.line === null && composing.hunkIndex === null && (
            <NoteComposer
              value={composing.body}
              textareaRef={textareaRef}
              onChange={(body) => setComposing({ ...composing, body })}
              onSave={saveComposer}
              onCancel={() => setComposing(null)}
            />
          )}
          {/* Whole-file notes */}
          {annotatable && wholeFileNotes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              outdated={false}
              onEdit={() =>
                setComposing({
                  line: null,
                  lineIsOld: null,
                  hunkIndex: null,
                  endLine: null,
                  anchorText: null,
                  body: note.body,
                  editingId: note.id,
                })
              }
              onResolve={(resolved) => resolveReviewNote(note.id, resolved)}
              onRemove={() => removeReviewNote(note.id)}
            />
          ))}
          {change.binary ? (
            <div className="review-change-note">{t("panel.review.binary")}</div>
          ) : change.truncated ? (
            <div className="review-change-note">{t("panel.review.tooLarge")}</div>
          ) : change.hunks.length > 0 ? (
            /* Direction D: numbered mono-11 diff with 30px line-number gutter */
            <div className="wp-diff-hunk">
              {change.hunks.map((hunk, hunkIndex) => {
                const { oldStart, newStart } = parseHunkHeader(hunk.header);
                let oldLine = oldStart;
                let newLine = newStart;
                return (
                  <div key={`${hunk.header}-${hunkIndex}`}>
                    <div className="wp-hunk-meta">{hunk.header}</div>
                    {hunk.lines.map((line, lineIndex) => {
                      const isOldSide = line.type === "del";
                      const lineNo = isOldSide ? oldLine : newLine;
                      let ln: string;
                      if (line.type === "del") {
                        ln = String(oldLine++);
                      } else if (line.type === "add") {
                        ln = String(newLine++);
                      } else {
                        // context line — advance both
                        ln = String(newLine++);
                        oldLine++;
                      }
                      const sigil = line.type === "add" ? "+" : line.type === "del" ? "−" : " ";
                      const lineNotes = annotatable
                        ? notes.filter((n) => n.line === lineNo && n.lineIsOld === isOldSide)
                        : [];
                      const isComposingHere =
                        composing !== null &&
                        composing.line === lineNo &&
                        composing.lineIsOld === isOldSide &&
                        composing.hunkIndex === hunkIndex;

                      return (
                        <Fragment key={lineIndex}>
                          <div className={cx("wp-hunk-line", line.type, annotatable && "is-annotatable")}>
                            <span className="ln" aria-hidden>
                              {annotatable && (
                                <button
                                  type="button"
                                  className="wp-hunk-note-add"
                                  tabIndex={-1}
                                  aria-label={t("panel.review.addNote")}
                                  onClick={(e) => {
                                    if (
                                      e.shiftKey &&
                                      composing !== null &&
                                      composing.hunkIndex === hunkIndex &&
                                      composing.line !== null &&
                                      composing.lineIsOld === isOldSide
                                    ) {
                                      // Extend range on the same side (never shrinks; re-anchors upward).
                                      setComposing({
                                        ...composing,
                                        ...extendNoteRange(
                                          { line: composing.line, endLine: composing.endLine, anchorText: composing.anchorText },
                                          lineNo,
                                          line.text,
                                        ),
                                      });
                                      requestAnimationFrame(() => textareaRef.current?.focus());
                                    } else {
                                      setComposing({
                                        line: lineNo,
                                        lineIsOld: isOldSide,
                                        hunkIndex,
                                        endLine: null,
                                        anchorText: line.text,
                                        body:
                                          isComposingHere && composing?.body
                                            ? composing.body
                                            : "",
                                      });
                                      // Focus textarea after React flushes
                                      requestAnimationFrame(() =>
                                        textareaRef.current?.focus(),
                                      );
                                    }
                                  }}
                                >
                                  +
                                </button>
                              )}
                              {ln}
                            </span>
                            <span className="sigil" aria-hidden>{sigil}</span>
                            <span className="code">{line.text}</span>
                          </div>
                          {/* Inline composer for this line */}
                          {isComposingHere && (
                            <NoteComposer
                              value={composing!.body}
                              textareaRef={textareaRef}
                              onChange={(body) => setComposing({ ...composing!, body })}
                              onSave={saveComposer}
                              onCancel={() => setComposing(null)}
                            />
                          )}
                          {/* Saved notes for this line */}
                          {lineNotes.map((note) => (
                            <NoteRow
                              key={note.id}
                              note={note}
                              outdated={isNoteOutdated(note, change.hunks)}
                              onEdit={() =>
                                setComposing({
                                  line: lineNo,
                                  lineIsOld: isOldSide,
                                  hunkIndex,
                                  endLine: note.endLine,
                                  anchorText: note.anchorText,
                                  body: note.body,
                                  editingId: note.id,
                                })
                              }
                              onResolve={(resolved) => resolveReviewNote(note.id, resolved)}
                              onRemove={() => removeReviewNote(note.id)}
                            />
                          ))}
                        </Fragment>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="review-change-note">{t("panel.review.noLineDetails")}</div>
          )}
        </div>
      )}
    </div>
  );
});

function NoteComposer({
  value,
  textareaRef,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (body: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => textareaRef.current?.focus(), [textareaRef]);
  return (
    <div className="wp-hunk-note-composer">
      <textarea
        ref={textareaRef}
        className="wp-hunk-note-textarea"
        value={value}
        rows={2}
        placeholder={t("panel.review.notePlaceholder")}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { onCancel(); return; }
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSave(); }
        }}
      />
      <div className="wp-hunk-note-composer-actions">
        <Button variant="primary" size="sm" onClick={onSave} style={{ height: 20, fontSize: 11 }}>
          {t("panel.review.noteSave")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} style={{ height: 20, fontSize: 11 }}>
          {t("panel.review.noteCancel")}
        </Button>
      </div>
    </div>
  );
}

function NoteRow({
  note,
  outdated,
  onEdit,
  onResolve,
  onRemove,
}: {
  note: ReviewNote;
  outdated: boolean;
  onEdit: () => void;
  onResolve: (resolved: boolean) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={cx("wp-hunk-note", note.resolved && "is-resolved", outdated && "is-outdated")}>
      {note.resolved ? (
        <span className="wp-hunk-note-resolved-label">
          <IconCheck size={10} />
          {t("panel.review.noteResolved")}
          <button
            type="button"
            className="wp-hunk-note-action"
            onClick={() => onResolve(false)}
          >
            {t("panel.review.noteReopen")}
          </button>
        </span>
      ) : (
        <>
          {outdated && <span className="wp-hunk-note-outdated-badge">{t("panel.review.noteOutdated")}</span>}
          <span className="wp-hunk-note-body">{note.body}</span>
          <span className="wp-hunk-note-actions">
            <button type="button" className="wp-hunk-note-action" onClick={onEdit}>
              {t("panel.review.noteEdit")}
            </button>
            <button type="button" className="wp-hunk-note-action" onClick={() => onResolve(true)}>
              {t("panel.review.noteResolve")}
            </button>
            <button
              type="button"
              className="wp-hunk-note-action is-danger"
              onClick={onRemove}
              aria-label={t("panel.review.noteRemove")}
              title={t("panel.review.noteRemove")}
            >
              ×
            </button>
          </span>
        </>
      )}
    </div>
  );
}
