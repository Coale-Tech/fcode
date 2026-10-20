import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { reviewChangesFromMessages, summarizeReviewChanges } from "../../lib/workspace-review";
import { useAppStore } from "../../stores/app-store";
import { IconDiff } from "../icons";
import { Button } from "../ui";
import { ReviewChangeCard } from "../ReviewChangeCard";
import { WorkTabEmpty } from "./WorkTabEmpty";
import { DocReviewSource, GitReviewSource, ReviewSourceSwitcher, type GitDiffScope } from "../GitReviewSource";
import { SendNotesControl } from "../SendNotesControl";

export function ReviewTab() {
  const { t } = useTranslation();
  const [reviewSource, setReviewSource] = useState<"agent" | GitDiffScope | "docs">("agent");
  const workspace = useAppStore((state) => state.workspace);
  const workspacePath = workspace?.path ?? null;
  const messages = useAppStore((state) => state.messages);
  const entries = useMemo(() => reviewChangesFromMessages(messages), [messages]);
  const summary = useMemo(() => summarizeReviewChanges(entries), [entries]);
  // Local "kept" state: snapshotIds the user has clicked Keep on (visual accept)
  const [keptIds, setKeptIds] = useState<Set<string>>(new Set());
  const [sendingNotes, setSendingNotes] = useState(false);

  const rollback = useAppStore((state) => state.rollbackWorkspaceChange);
  const sendReviewNotes = useAppStore((state) => state.sendReviewNotes);
  const allNotes = useAppStore((state) => state.reviewNotes);

  const snapshotIds = useMemo(() => entries.map((e) => e.change.snapshotId), [entries]);
  const unresolvedNoteCount = useMemo(
    () => snapshotIds.reduce(
      (n, sid) => n + (allNotes[sid]?.filter((x) => !x.resolved && !x.sentAt).length ?? 0),
      0,
    ),
    [snapshotIds, allNotes],
  );

  const handleKeep = (snapshotId: string) => {
    setKeptIds((prev) => new Set([...prev, snapshotId]));
  };
  const handleKeepAll = () => {
    setKeptIds(new Set(entries.map((e) => e.change.snapshotId)));
  };
  const handleRevertAll = () => {
    for (const entry of entries) {
      if (entry.change.reversible && entry.change.state !== "rolledBack") {
        void rollback(entry.message.id, entry.change.snapshotId);
      }
    }
  };
  const handleSendNotes = async (target: "current" | "new" = "current") => {
    setSendingNotes(true);
    await sendReviewNotes(snapshotIds, target);
    setSendingNotes(false);
  };


  return (
    <div className="review-tab">
      {/* Source switcher: Agent changes | Unstaged | Staged | Branch */}
      <ReviewSourceSwitcher scope={reviewSource} onScope={setReviewSource} />

      {reviewSource === "agent" ? (
        entries.length === 0 ? (
          <WorkTabEmpty
            icon={IconDiff}
            title={t("panel.review.noChanges")}
          />
        ) : (
          <>
            {/* Direction D summary bar: N files changed +adds −dels / Keep all / Revert all / Send notes */}
            <div className="wp-diff-summary">
              <strong>{t("panel.review.changes", { count: summary.changeCount })}</strong>
              {summary.additions > 0 && <span className="diff-adds">+{summary.additions}</span>}
              {summary.deletions > 0 && <span className="diff-dels">−{summary.deletions}</span>}
              <span className="wp-diff-summary-spacer" />
              <SendNotesControl
                count={unresolvedNoteCount}
                sending={sendingNotes}
                onSend={(target) => void handleSendNotes(target)}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleKeepAll}
                style={{ height: 24, fontSize: 11, padding: "0 8px" }}
              >
                {t("panel.review.keepAll", "Keep all")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRevertAll}
                style={{ height: 24, fontSize: 11, padding: "0 8px" }}
              >
                {t("panel.review.revertAll", "Revert all")}
              </Button>
            </div>
            <div className="review-scroll">
              {entries.map((entry) => (
                <ReviewChangeCard
                  key={entry.change.snapshotId}
                  message={entry.message}
                  compact
                  kept={keptIds.has(entry.change.snapshotId)}
                  onKeep={() => handleKeep(entry.change.snapshotId)}
                  annotatable
                />
              ))}
            </div>
          </>
        )
      ) : reviewSource === "docs" ? (
        <DocReviewSource workspacePath={workspacePath} />
      ) : (
        <GitReviewSource scope={reviewSource} workspacePath={workspacePath} />
      )}
    </div>
  );
}
