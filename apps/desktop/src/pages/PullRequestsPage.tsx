import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PullRequestCheck, PullRequestSummary } from "@pi-desktop/shared";
import { useAppStore } from "../stores/app-store";
import { api } from "../lib/api";
import { formatUpdated } from "../lib/project-archive";
import { Button, TooltipButton, Panel } from "../components/ui";
import { ContextMenu, useContextMenu } from "../components/ContextMenu";
import {
  IconChat,
  IconCopy,
  IconExternal,
  IconMore,
  IconPullRequest,
  IconRefresh,
  IconFileText,
} from "../components/icons";

type Filter = "open" | "draft" | "all";

function fmtAgo(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}


/** Render text with backtick-delimited spans as <code> inline elements. */
function InlineBody({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code key={i} className="pr-inline-code">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Single-letter avatar for the author chip. */
function AuthorAvatar({ email }: { email: string }) {
  const letter = email.charAt(0).toUpperCase();
  return <span className="pr-author-avatar" aria-hidden>{letter}</span>;
}

export function PullRequestsPage() {
  const { t, i18n } = useTranslation();
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();
  const workspace = useAppStore((s) => s.workspace);
  const openProject = useAppStore((s) => s.openProject);
  const newSession = useAppStore((s) => s.newSession);
  const setPage = useAppStore((s) => s.setPage);
  const sendPrompt = useAppStore((s) => s.sendPrompt);
  const [pulls, setPulls] = useState<PullRequestSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPr, setSelectedPr] = useState<PullRequestSummary | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await api.listPullRequests();
      const loaded = res.pulls || [];
      setPulls(loaded);
      setError(res.error || null);
      setLastUpdated(new Date());
      // Capture mode: pre-select the designated PR for the detail-panel screenshot.
      const preSelect = window.__PI_CAPTURE_PR_SELECTED__;
      if (preSelect) {
        const match = loaded.find((p) => p.number === preSelect);
        if (match) setSelectedPr(match);
      }
    } catch (e) {
      setPulls([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [workspace?.path]);

  // Capture mode: once pulls load, pre-select the designated PR number.
  useEffect(() => {
    const preSelect = window.__PI_CAPTURE_PR_SELECTED__;
    if (!preSelect || !pulls.length) return;
    const match = pulls.find((p) => p.number === preSelect);
    if (match) setSelectedPr(match);
  }, [pulls]);

  const filtered = useMemo(() => {
    if (filter === "all") return pulls;
    if (filter === "draft") return pulls.filter((p) => p.isDraft);
    return pulls.filter((p) => !p.isDraft);
  }, [pulls, filter]);

  const counts = useMemo(() => {
    const draft = pulls.filter((p) => p.isDraft).length;
    return {
      open: pulls.length - draft,
      draft,
      all: pulls.length,
    };
  }, [pulls]);


  /** Derive branch from the first open PR if workspace.branch unavailable. */
  const defaultBranch = pulls[0]?.baseRefName ?? "main";

  const startAiReviewAll = async () => {
    await newSession();
    setPage("chat");
    await sendPrompt("List open pull requests and current branch status for this repository. Summarize what needs review.");
  };

  const startReview = async (pr: PullRequestSummary) => {
    await newSession();
    setPage("chat");
    await sendPrompt(`Review pull request #${pr.number}${pr.title ? ` (${pr.title})` : ""}. Summarize changes, risks, and suggested next steps.`);
  };

  return (
    <div className="pr-page">
      <div className="pr-layout">

        {/* ── Main panel ── */}
        <div className="pr-main">
          {/* Page head */}
          <div className="d-page-head">
            <span className="d-page-title">{t("pulls.title")}</span>
            {workspace?.path && (
              <>
                <span className="pr-repo-chip">
                  {workspace.path.split("/").slice(-2).join("/")}
                </span>
                <span className="pr-branch-pill">
                  <span className="pr-branch-dot" aria-hidden />
                  {workspace.branch ?? defaultBranch}
                </span>
              </>
            )}
            <div className="d-page-head-actions">
              <TooltipButton
                type="button"
                className="icon-btn icon-btn-square"
                tooltip={t("pulls.refresh")}
                ariaLabel={t("pulls.refresh")}
                disabled={loading}
                onClick={() => void refresh()}
              >
                <IconRefresh size={14} />
              </TooltipButton>
              {workspace?.path && (
                <Button
                  variant="primary"
                  size="sm"
                  className="pr-ai-review-all-btn"
                  onClick={() => void startAiReviewAll()}
                >
                  <IconChat size={12} aria-hidden />
                  {t("pulls.aiReviewAll")}
                </Button>
              )}
            </div>
          </div>

          {/* Filter bar */}
          {workspace?.path && (
            <div className="dest-toolbar">
              <div className="dest-filters" role="tablist" aria-label={t("pulls.filters")}>
                {(
                  [
                    ["open", t("pulls.filterOpen"), counts.open],
                    ["draft", t("pulls.filterDraft"), counts.draft],
                    ["all", t("pulls.filterAll"), counts.all],
                  ] as const
                ).map(([id, label, count]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={filter === id}
                    className={`dest-filter${filter === id ? " active" : ""}`}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                    <span className="dest-filter-count">{count}</span>
                  </button>
                ))}
              </div>
              {lastUpdated && (
                <span className="pr-updated-meta">
                  {t("pulls.updatedAgo", { ago: fmtAgo(lastUpdated) })}
                </span>
              )}
            </div>
          )}

          {/* List header */}
          {filtered.length > 0 && (
            <div className="d-list-head">
              <div className="d-col" style={{ flex: "0 0 28px" }} />
              <div className="d-col" style={{ flex: 2 }}>
                # {t("pulls.colTitle")}
              </div>
              <div className="d-col" style={{ flex: "0 0 var(--d-pr-col-branch)" }}>
                {t("git.branch")}
              </div>
              <div className="d-col" style={{ flex: "0 0 var(--d-pr-col-ci)" }}>CI</div>
              <div className="d-col" style={{ flex: "0 0 var(--d-pr-col-author)" }}>
                {t("pulls.author")}
              </div>
              <div className="d-col" style={{ flex: "0 0 var(--d-pr-col-actions)", textAlign: "right" }}>
                {t("pulls.actions")}
              </div>
            </div>
          )}

          {/* PR list */}
          <div className="d-panel-body flush" style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
            {!workspace?.path ? (
              <Panel className="page-card page-empty">
                <div className="page-empty-icon"><IconPullRequest size={20} /></div>
                <div style={{ fontWeight: 500 }}>{t("pulls.emptyTitle")}</div>
                <Button className="mt-5" variant="primary" onClick={() => void openProject()}>
                  {t("project.open")}
                </Button>
              </Panel>
            ) : filtered.length === 0 ? (
              <Panel className="page-card page-empty">
                <div className="page-empty-icon"><IconPullRequest size={20} /></div>
                <div style={{ fontWeight: 500 }}>{t("pulls.emptyTitle")}</div>
                {error && error !== "NO_WORKSPACE" && (
                  <div style={{ marginTop: 8, fontSize: "var(--d-text-sm)", color: "var(--ink-gray-5)" }}>
                    {error}
                  </div>
                )}
              </Panel>
            ) : (
              <div className="dest-list">
                {filtered.map((pr) => (
                  <div
                    key={pr.number}
                    className={`pr-row${selectedPr?.number === pr.number ? " selected" : ""}`}
                    onClick={() => setSelectedPr(selectedPr?.number === pr.number ? null : pr)}
                  >
                    <div className={`pr-row-icon${pr.isDraft ? " draft" : ""}`}>
                      <IconPullRequest size={12} />
                    </div>
                    <div className="pr-row-body">
                      <div className="pr-row-title">
                        <span className="pr-num">#{pr.number}</span>
                        <span className="pr-row-title-text">{pr.title}</span>
                        <span className={`d-pill pr-row-pill ${pr.isDraft ? "amber" : "green"}`}>
                          {t(pr.isDraft ? "pulls.draft" : "pulls.open")}
                        </span>
                      </div>
                      {(pr.headRefName || pr.author) && (
                        <div className="pr-row-sub">
                          {[
                            pr.headRefName && pr.baseRefName
                              ? `${pr.headRefName} → ${pr.baseRefName}`
                              : null,
                            pr.author ?? null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </div>
                    {/* Branch column */}
                    <div className="pr-row-branch">
                      {pr.headRefName && pr.baseRefName
                        ? `${pr.headRefName} → ${pr.baseRefName}`
                        : "—"}
                    </div>
                    {/* CI column */}
                    <div className="pr-row-ci" aria-label="CI status">
                      {pr.checks && pr.checks.length > 0 ? (
                        (() => {
                          const total = pr.checks.length;
                          const passed = pr.checks.filter((c) => c.state === "success").length;
                          const pending = pr.checks.some((c) => c.state === "pending");
                          const failed = pr.checks.some((c) => c.state === "failure");
                          const tone = failed ? "danger" : pending ? "warning" : "success";
                          const icon = failed ? "✗" : pending ? "●" : "✓";
                          return (
                            <span className={`pr-ci-badge pr-ci-${tone}`}>
                              {icon} {passed}/{total}
                            </span>
                          );
                        })()
                      ) : "—"}
                    </div>
                    {/* Author column */}
                    <div className="pr-row-author">
                      {pr.author ? (pr.author.includes("@") ? pr.author.split("@")[0] : pr.author) : "—"}
                    </div>
                    {/* Actions column */}
                    <div className="pr-row-actions" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void startReview(pr)}
                      >
                        <IconChat size={11} aria-hidden />
                        {t("pulls.review")}
                      </Button>
                      <TooltipButton
                        type="button"
                        className="icon-btn icon-btn-square"
                        tooltip={t("pulls.openGitHub")}
                        ariaLabel={t("pulls.openGitHub")}
                        onClick={() => void api.browserOpenExternal(pr.url)}
                      >
                        <IconExternal size={13} />
                      </TooltipButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Detail panel (320px, shown when PR selected) ── */}
        {selectedPr && (
          <div className="pr-detail">
            <div className="d-mini-head">
              <span className="d-mini-title" title={`#${selectedPr.number} ${selectedPr.shortTitle ?? selectedPr.title}`}>
                #{selectedPr.number} {selectedPr.shortTitle ?? selectedPr.title}
              </span>
              <div className="d-mini-act">
                <TooltipButton
                  type="button"
                  tooltip={t("pulls.openGitHub")}
                  ariaLabel={t("pulls.openGitHub")}
                  className="icon-btn icon-btn-square"
                  onClick={() => void api.browserOpenExternal(selectedPr.url)}
                >
                  <IconExternal size={13} />
                </TooltipButton>
                <TooltipButton
                  type="button"
                  tooltip={t("pulls.moreActions")}
                  ariaLabel={t("pulls.moreActions")}
                  className="icon-btn icon-btn-square"
                  onClick={(event) =>
                    openContextMenu(event, {
                      label: t("pulls.moreActions"),
                      items: [
                        {
                          id: "copy-link",
                          label: t("pulls.copyLink"),
                          icon: <IconCopy size={13} />,
                          onSelect: () => void navigator.clipboard.writeText(selectedPr.url),
                        },
                        {
                          id: "refresh",
                          label: t("pulls.refresh"),
                          icon: <IconRefresh size={13} />,
                          onSelect: () => void refresh(),
                        },
                      ],
                    })
                  }
                >
                  <IconMore size={13} />
                </TooltipButton>
              </div>
            </div>
            <div className="d-panel-body pr-detail-body-scroll" style={{ overflowY: "auto" }}>
              {/* Status */}
              <div className="pr-detail-section">
                <div className="pr-detail-label">{t("pulls.status")}</div>
                <div className="pr-detail-status-row">
                  <span className={`d-pill ${selectedPr.isDraft ? "amber" : "green"}`}>
                    <span className="d-pill-dot" aria-hidden />
                    {t(selectedPr.isDraft ? "pulls.draft" : "pulls.open")}
                  </span>
                  {(selectedPr.openedAt ?? selectedPr.updatedAt) && (
                    <span className="pr-detail-meta">
                      {t("pulls.openedAgo", {
                        ago: formatUpdated(
                          Date.parse(selectedPr.openedAt ?? selectedPr.updatedAt!),
                          i18n.language,
                        ),
                      })}
                    </span>
                  )}
                </div>
              </div>

              {/* Branch flow */}
              {selectedPr.headRefName && selectedPr.baseRefName && (
                <div className="pr-detail-section">
                  <div className="pr-detail-label">{t("git.branch")}</div>
                  <div className="pr-branch-flow">
                    <span className="pr-branch-chip">{selectedPr.headRefName}</span>
                    <span className="pr-branch-arrow" aria-hidden>→</span>
                    <span className="pr-branch-chip">{selectedPr.baseRefName}</span>
                  </div>
                </div>
              )}

              {/* Author */}
              {selectedPr.author && (
                <div className="pr-detail-section">
                  <div className="pr-detail-label">{t("pulls.author")}</div>
                  <div className="pr-author-row">
                    <AuthorAvatar email={selectedPr.author} />
                    <span className="pr-detail-value">{selectedPr.author}</span>
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedPr.body && (
                <div className="pr-detail-section">
                  <div className="pr-detail-label">{t("pulls.description")}</div>
                  <div className="pr-detail-body">
                    <InlineBody text={selectedPr.body} />
                  </div>
                </div>
              )}

              {/* Changes */}
              {(selectedPr.changedFiles != null || selectedPr.additions != null) && (
                <div className="pr-detail-section">
                  <div className="pr-detail-label">{t("pulls.changes")}</div>
                  <div className="pr-changes-row">
                    {selectedPr.changedFiles != null && (
                      <span className="pr-changes-files">
                        <IconFileText size={12} aria-hidden />
                        {selectedPr.changedFiles} file{selectedPr.changedFiles !== 1 ? "s" : ""}
                      </span>
                    )}
                    {selectedPr.additions != null && (
                      <span className="pr-changes-add">+{selectedPr.additions}</span>
                    )}
                    {selectedPr.deletions != null && (
                      <span className="pr-changes-del">−{selectedPr.deletions}</span>
                    )}
                  </div>
                </div>
              )}

              {/* CI Checks */}
              {selectedPr.checks && selectedPr.checks.length > 0 && (
                <div className="pr-detail-section">
                  <div className="pr-detail-label">{t("pulls.ciChecks")}</div>
                  <div className="pr-checks-list">
                    {selectedPr.checks.map((c: PullRequestCheck, i: number) => (
                      <div key={i} className={`pr-check-row pr-check-${c.state}`}>
                        <span className="pr-check-icon">
                          {c.state === "success" ? "✓" : c.state === "failure" ? "✗" : c.state === "pending" ? "●" : "—"}
                        </span>
                        <span className="pr-check-name">
                          {c.name}{c.details ? ` · ${c.details}` : ""}
                        </span>
                        {c.durationSeconds != null && (
                          <span className="pr-check-dur">{`${Math.floor(c.durationSeconds / 60)}m ${c.durationSeconds % 60}s`}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="pr-detail-actions">
                <Button
                  variant="primary"
                  size="sm"
                  style={{ width: "100%" }}
                  onClick={() => void startReview(selectedPr)}
                >
                  <IconChat size={12} aria-hidden />
                  {t("pulls.aiReview")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  style={{ width: "100%" }}
                  onClick={() => void api.browserOpenExternal(selectedPr.url)}
                >
                  <IconExternal size={12} aria-hidden />
                  {t("pulls.openGitHub")}
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>
      <ContextMenu state={contextMenu} onClose={closeContextMenu} />
    </div>
  );
}
