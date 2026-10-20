/**
 * GitReviewSource — renders unstaged / staged / branch git diffs in the
 * Review tab using the same ReviewChangeCard as agent-turn snapshots.
 *
 * Also exports DocReviewSource (markdown file review) and ReviewSourceSwitcher.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FsIndexEntry, ReviewChange, UiMessage } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { summarizeReviewChanges } from "../lib/workspace-review";
import { ReviewChangeCard } from "./ReviewChangeCard";
import { WorkTabEmpty } from "./workpanel/WorkTabEmpty";
import { Button } from "./ui";
import { IconDiff } from "./icons";
import { SendNotesControl } from "./SendNotesControl";

export type GitDiffScope = "unstaged" | "staged" | "branch";

/**
 * Wrap a ReviewChange in a minimal UiMessage so ReviewChangeCard can render it
 * unchanged (it calls reviewChangeFromMessage internally).  Since git changes
 * are never reversible, the rollback path in the card is never triggered, so
 * message.id is never used for any real operation.
 */
function changeToMessage(change: ReviewChange): UiMessage {
  return {
    id: change.snapshotId,
    role: "tool",
    toolStatus: "success",
    toolName: "write",
    toolResult: { details: { root: "workspace", review: change } },
    content: "",
    createdAt: new Date(0).toISOString(),
  };
}

type FetchState = {
  changes: ReviewChange[];
  base?: string;
  loading: boolean;
  error?: string;
};

const INITIAL: FetchState = { changes: [], loading: false };

export function GitReviewSource({
  scope,
  workspacePath,
}: {
  scope: GitDiffScope;
  workspacePath: string | null | undefined;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<FetchState>(INITIAL);
  const seqRef = useRef(0);
  const [sendingNotes, setSendingNotes] = useState(false);
  const sendReviewNotes = useAppStore((s) => s.sendReviewNotes);
  const allNotes = useAppStore((s) => s.reviewNotes);

  const refresh = useCallback(() => {
    if (!workspacePath) {
      setState(INITIAL);
      return;
    }
    const seq = ++seqRef.current;
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    void api.gitReviewDiff(scope, workspacePath).then((result) => {
      if (seq !== seqRef.current) return;
      setState({ changes: result.changes, base: result.base, loading: false, error: result.error });
    }).catch(() => {
      if (seq !== seqRef.current) return;
      setState({ changes: [], loading: false, error: t("panel.review.gitError") });
    });
  }, [scope, workspacePath, t]);

  // Fetch on mount and whenever scope/workspace changes.
  useEffect(() => { refresh(); }, [refresh]);

  const snapshotIds = state.changes.map((c) => c.snapshotId);
  const unresolvedNoteCount = snapshotIds.reduce(
    (n, sid) => n + (allNotes[sid]?.filter((x) => !x.resolved && !x.sentAt).length ?? 0),
    0,
  );

  const handleSendNotes = async (target: "current" | "new") => {
    setSendingNotes(true);
    await sendReviewNotes(snapshotIds, target);
    setSendingNotes(false);
  };

  const summary = summarizeReviewChanges(state.changes);

  if (!workspacePath) {
    return <WorkTabEmpty icon={IconDiff} title={t("panel.review.gitNoProject")} />;
  }

  if (!state.loading && state.changes.length === 0) {
    return (
      <WorkTabEmpty icon={IconDiff} title={state.error ?? t("panel.review.gitEmpty")}>
        <Button variant="secondary" size="sm" onClick={refresh}>
          {t("panel.review.gitRefresh")}
        </Button>
      </WorkTabEmpty>
    );
  }

  return (
    <div className="review-tab">
      <div className="wp-diff-summary">
        <strong>
          {state.loading
            ? "…"
            : t("panel.review.changes", { count: summary.changeCount })}
        </strong>
        {summary.additions > 0 && <span className="diff-adds">+{summary.additions}</span>}
        {summary.deletions > 0 && <span className="diff-dels">−{summary.deletions}</span>}
        {scope === "branch" && state.base && (
          <span className="git-review-base" style={{ fontSize: 11, opacity: 0.6, marginLeft: 4 }}>
            {t("panel.review.gitBranchBase", { base: state.base })}
          </span>
        )}
        <span className="wp-diff-summary-spacer" />
        <SendNotesControl
          count={unresolvedNoteCount}
          sending={sendingNotes}
          onSend={(target) => void handleSendNotes(target)}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={refresh}
          disabled={state.loading}
          aria-label={t("panel.review.gitRefresh")}
          style={{ height: 24, fontSize: 11, padding: "0 8px" }}
        >
          {state.loading ? "…" : t("panel.review.gitRefresh")}
        </Button>
      </div>
      <div className="review-change-list">
        {state.changes.map((change) => (
          <ReviewChangeCard
            key={change.snapshotId}
            message={changeToMessage(change)}
            annotatable
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocReviewSource — single markdown file review
// ---------------------------------------------------------------------------

const MD_RE = /\.(?:md|mdx|markdown)$/i;


type DocFetchState = {
  change: ReviewChange | null;
  loading: boolean;
  error?: string;
};

export function DocReviewSource({
  workspacePath,
}: {
  workspacePath: string | null | undefined;
}) {
  const { t } = useTranslation();
  const [mdFiles, setMdFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [docState, setDocState] = useState<DocFetchState>({ change: null, loading: false });
  const seqRef = useRef(0);
  const [sendingNotes, setSendingNotes] = useState(false);
  const sendReviewNotes = useAppStore((s) => s.sendReviewNotes);
  const allNotes = useAppStore((s) => s.reviewNotes);

  // List markdown files from the workspace index.
  useEffect(() => {
    if (!workspacePath) { setMdFiles([]); return; }
    void api.fsIndex().then((res) => {
      setMdFiles(res.entries.filter((e) => e.kind === "file" && MD_RE.test(e.path)).map((e) => e.path).sort());
    }).catch(() => setMdFiles([]));
  }, [workspacePath]);

  // Load selected doc.
  useEffect(() => {
    if (!selected || !workspacePath) {
      setDocState({ change: null, loading: false });
      return;
    }
    const seq = ++seqRef.current;
    setDocState({ change: null, loading: true });
    void api.docReview(selected).then((result) => {
      if (seq !== seqRef.current) return;
      if (result.error || result.changes.length === 0) {
        setDocState({ change: null, loading: false, error: result.error ?? t("panel.review.docsError") });
      } else {
        setDocState({ change: result.changes[0]!, loading: false });
      }
    }).catch(() => {
      if (seq !== seqRef.current) return;
      setDocState({ change: null, loading: false, error: t("panel.review.docsError") });
    });
  }, [selected, workspacePath, t]);

  const snapshotIds = useMemo(
    () => (docState.change ? [docState.change.snapshotId] : []),
    [docState.change],
  );
  const unresolvedNoteCount = snapshotIds.reduce(
    (n, sid) => n + (allNotes[sid]?.filter((x) => !x.resolved && !x.sentAt).length ?? 0),
    0,
  );

  const handleSendNotes = async (target: "current" | "new") => {
    setSendingNotes(true);
    await sendReviewNotes(snapshotIds, target);
    setSendingNotes(false);
  };

  if (!workspacePath) {
    return <WorkTabEmpty icon={IconDiff} title={t("panel.review.gitNoProject")} />;
  }

  return (
    <div className="review-tab">
      <div className="wp-diff-summary">
        <select
          className="review-doc-select"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{ fontSize: 11, height: 24, flex: "1 1 0", minWidth: 0 }}
        >
          <option value="">{t("panel.review.docsSelect")}</option>
          {mdFiles.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        {mdFiles.length === 0 && (
          <span style={{ fontSize: 11, opacity: 0.6 }}>{t("panel.review.docsEmpty")}</span>
        )}
        <span className="wp-diff-summary-spacer" />
        <SendNotesControl
          count={unresolvedNoteCount}
          sending={sendingNotes}
          onSend={(target) => void handleSendNotes(target)}
        />
      </div>
      {docState.loading && (
        <div className="review-change-note" style={{ padding: 8, opacity: 0.6 }}>…</div>
      )}
      {docState.error && !docState.loading && (
        <WorkTabEmpty icon={IconDiff} title={docState.error} />
      )}
      {docState.change && !docState.loading && (
        <div className="review-change-list">
          <ReviewChangeCard
            key={docState.change.snapshotId}
            message={changeToMessage(docState.change)}
            annotatable
          />
        </div>
      )}
      {!selected && !docState.loading && (
        <WorkTabEmpty icon={IconDiff} title={t("panel.review.docsEmpty")} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source tab switcher
// ---------------------------------------------------------------------------

/**
 * Source tab switcher for the Review panel.
 */
export function ReviewSourceSwitcher({
  scope,
  onScope,
}: {
  scope: "agent" | GitDiffScope | "docs";
  onScope: (s: "agent" | GitDiffScope | "docs") => void;
}) {
  const { t } = useTranslation();
  const tabs: Array<{ key: "agent" | GitDiffScope | "docs"; label: string }> = [
    { key: "agent", label: t("panel.review.gitSource.agent") },
    { key: "unstaged", label: t("panel.review.gitSource.unstaged") },
    { key: "staged", label: t("panel.review.gitSource.staged") },
    { key: "branch", label: t("panel.review.gitSource.branch") },
    { key: "docs", label: t("panel.review.gitSource.docs") },
  ];
  return (
    <div className="review-source-switcher" role="tablist" aria-label="Review source">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={scope === key}
          className={`review-source-tab${scope === key ? " active" : ""}`}
          onClick={() => onScope(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
