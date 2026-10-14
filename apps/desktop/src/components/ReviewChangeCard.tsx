import { memo, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ReviewChangeStatus,
  ReviewRollbackStatus,
  UiMessage,
} from "@pi-desktop/shared";
import { reviewChangeFromMessage } from "../lib/workspace-review";
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

function DiffBody({
  message,
  compact,
  kept,
  onKeep,
}: {
  message: UiMessage;
  compact: boolean;
  kept?: boolean;
  onKeep?: () => void;
}) {
  const { t } = useTranslation();
  const change = reviewChangeFromMessage(message);
  const rollback = useAppStore((state) => state.rollbackWorkspaceChange);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackStatus, setRollbackStatus] = useState<ReviewRollbackStatus | null>(
    null,
  );

  if (!change) return null;

  const runRollback = async () => {
    if (!change.reversible || change.state === "rolledBack" || rollingBack) return;
    setRollingBack(true);
    setRollbackStatus(null);
    const result = await rollback(message.id, change.snapshotId);
    setRollingBack(false);
    if (result) setRollbackStatus(result.status);
  };

  return (
    <div className="review-change-card-body-content">
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
                  return (
                    <div className={cx("wp-hunk-line", line.type)} key={lineIndex}>
                      <span className="ln" aria-hidden>{ln}</span>
                      <span className="sigil" aria-hidden>{sigil}</span>
                      <span className="code">{line.text}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="review-change-note">{t("panel.review.noLineDetails")}</div>
      )}

      <div className={cx("review-change-card-actions", compact && "is-compact")}>
        {rollbackStatus === "conflict" ? (
          <div className="review-change-rollback-note is-warning">
            {t("panel.review.rollbackConflict")}
          </div>
        ) : rollbackStatus === "unavailable" ? (
          <div className="review-change-rollback-note">
            {t("panel.review.rollbackUnavailable")}
          </div>
        ) : null}
        {change.state === "rolledBack" ? (
          <span className="review-change-state is-rolled-back">
            <IconCheck size={13} />
            {t("panel.review.rolledBack")}
          </span>
        ) : kept ? (
          <span className="review-change-state is-kept">
            <IconCheck size={13} />
            {t("panel.review.kept", "Kept")}
          </span>
        ) : (
          <div style={{ display: "flex", gap: 4 }}>
            {change.reversible && onKeep && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onKeep}
                style={{ height: 22, fontSize: 11, padding: "0 6px" }}
              >
                {t("panel.review.keep", "Keep")}
              </Button>
            )}
            {change.reversible ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void runRollback()}
                disabled={rollingBack}
                style={{ height: 22, fontSize: 11, padding: "0 6px", color: "var(--ink-red-7)" }}
              >
                <IconSnapshot size={13} />
                {rollingBack ? t("panel.review.rollingBack") : t("panel.review.rollback")}
              </Button>
            ) : (
              <span className="review-change-rollback-note">
                {t("panel.review.rollbackUnavailable")}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const ReviewChangeCard = memo(function ReviewChangeCard({
  message,
  compact = false,
  kept = false,
  onKeep,
}: {
  message: UiMessage;
  compact?: boolean;
  /** Visual "accepted" state set by the parent ReviewTab. */
  kept?: boolean;
  onKeep?: () => void;
}) {
  const { t } = useTranslation();
  const change = reviewChangeFromMessage(message);
  const detailsId = useId();
  const [open, setOpen] = useState(false);

  if (!change) return null;

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

  /* Direction D: bordered r8 file card — wrap each change in .wp-review-file */
  return (
    <div className={cx("wp-review-file", !open && "is-collapsed")} data-state={change.state} data-status={change.status}>
      {/* File card header: icon, path, +N/-N badges, Keep/Revert */}
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
        <div className="wp-review-file-acts">
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
      {/* Expandable diff body */}
      {open ? (
        <div className="review-change-card-body" id={detailsId}>
          <DiffBody message={message} compact={compact} kept={kept} onKeep={onKeep} />
        </div>
      ) : null}
    </div>
  );
});
