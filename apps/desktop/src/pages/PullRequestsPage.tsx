import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PullRequestSummary } from "@pi-desktop/shared";
import { useAppStore } from "../stores/app-store";
import { api } from "../lib/api";
import { Badge, Button, TooltipButton, Panel } from "../components/ui";
import { IconExternal, IconPullRequest } from "../components/icons";

type Filter = "open" | "draft" | "all";

export function PullRequestsPage() {
  const { t } = useTranslation();
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

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await api.listPullRequests();
      setPulls(res.pulls || []);
      setError(res.error || null);
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

  return (
    <div className="pr-page">
      <div className="pr-layout">

        {/* ── Main panel ── */}
        <div className="pr-main">
          {/* Page head with repo chip */}
          <div className="d-page-head">
            <span className="d-page-title">{t("pulls.title")}</span>
            {workspace?.path && (
              <span className="pr-repo-chip">
                {workspace.path.split("/").slice(-2).join("/")}
              </span>
            )}
            <div className="d-page-head-actions">
              <Button variant="ghost" size="sm" disabled={loading} onClick={() => void refresh()}>
                {loading ? "…" : t("pulls.refresh")}
              </Button>
              {workspace?.path && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    await newSession();
                    setPage("chat");
                    await sendPrompt("List open pull requests and current branch status for this repository. Summarize what needs review.");
                  }}
                >
                  {t("pulls.review")}
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
                    className={`dest-filter ${filter === id ? "active" : ""}`}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                    <span style={{ marginLeft: 4, color: "var(--ink-gray-4)", fontSize: "var(--d-text-xs)" }}>{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* List header (D.css .d-list-head) */}
          {filtered.length > 0 && (
            <div className="d-list-head">
              <div className="d-col icon" style={{ flex: "0 0 28px" }} />
              <div className="d-col" style={{ flex: 2 }}>{t("pulls.title")}</div>
              <div className="d-col md" style={{ flex: `0 0 var(--d-pr-col-branch)` }}>{t("git.branch")}</div>
              <div className="d-col sm" style={{ flex: `0 0 var(--d-pr-col-ci)` }}>CI</div>
              <div className="d-col sm" style={{ flex: `0 0 var(--d-pr-col-author)` }}>{t("pulls.author")}</div>
              <div className="d-col sm" style={{ flex: `0 0 var(--d-pr-col-actions)`, textAlign: "right" }}>{t("pulls.actions")}</div>
            </div>
          )}

          {/* PR list */}
          <div className="d-panel-body flush" style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
            {!workspace?.path ? (
              <Panel className="page-card page-empty">
                <div className="page-empty-icon"><IconPullRequest size={20} /></div>
                <div style={{ fontWeight: 500 }}>{t("pulls.emptyTitle")}</div>
                <Button className="mt-5" variant="primary" onClick={() => void openProject()}>{t("project.open")}</Button>
              </Panel>
            ) : filtered.length === 0 ? (
              <Panel className="page-card page-empty">
                <div className="page-empty-icon"><IconPullRequest size={20} /></div>
                <div style={{ fontWeight: 500 }}>{t("pulls.emptyTitle")}</div>
                {error && error !== "NO_WORKSPACE" && <div style={{ marginTop: 8, fontSize: "var(--d-text-sm)", color: "var(--ink-gray-5)" }}>{error}</div>}
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
                      <IconPullRequest size={14} />
                    </div>
                    <div className="pr-row-body">
                      <div className="pr-row-title">
                        <span className="pr-num">#{pr.number}</span>
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{pr.title}</span>
                        {pr.isDraft
                          ? <Badge tone="warning">{t("pulls.draft")}</Badge>
                          : <Badge tone="success">{t("pulls.open")}</Badge>}
                      </div>
                      <div className="pr-row-meta">
                        {pr.author && <span>{pr.author}</span>}
                        {pr.headRefName && pr.baseRefName && (
                          <span>{pr.headRefName} → {pr.baseRefName}</span>
                        )}
                      </div>
                    </div>
                    <div className="pr-row-actions" onClick={(e) => e.stopPropagation()}>
                      <TooltipButton
                        type="button"
                        className="icon-btn icon-btn-square"
                        tooltip={t("pulls.open")}
                        ariaLabel={t("pulls.open")}
                        onClick={() => void api.browserOpenExternal(pr.url)}
                      >
                        <IconExternal size={14} />
                      </TooltipButton>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          await newSession();
                          setPage("chat");
                          await sendPrompt(`Review pull request #${pr.number}${pr.title ? ` (${pr.title})` : ""}. Summarize changes, risks, and suggested next steps.`);
                        }}
                      >
                        {t("pulls.review")}
                      </Button>
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
              <span className="d-mini-title">#{selectedPr.number} {selectedPr.title}</span>
              <div className="d-mini-act">
                <TooltipButton type="button" tooltip={t("pulls.open")} ariaLabel={t("pulls.open")} className="icon-btn icon-btn-square" onClick={() => void api.browserOpenExternal(selectedPr.url)}>
                  <IconExternal size={13} />
                </TooltipButton>
                <Button size="sm" variant="ghost" onClick={() => setSelectedPr(null)}>✕</Button>
              </div>
            </div>
            <div className="d-panel-body" style={{ overflowY: "auto" }}>
              {/* Status */}
              <div style={{ marginBottom: 12 }}>
                <div className="pr-detail-label">{t("pulls.status")}</div>
                <Badge tone={selectedPr.isDraft ? "warning" : "success"}>
                  {t(selectedPr.isDraft ? "pulls.draft" : "pulls.open")}
                </Badge>
              </div>
              {/* Branch flow */}
              {selectedPr.headRefName && selectedPr.baseRefName && (
                <div style={{ marginBottom: 12 }}>
                  <div className="pr-detail-label">{t("git.branch")}</div>
                  <div className="pr-branch-flow">
                    <span className="pr-branch-chip">{selectedPr.headRefName}</span>
                    <span style={{ color: "var(--ink-gray-4)" }}>→</span>
                    <span className="pr-branch-chip">{selectedPr.baseRefName}</span>
                  </div>
                </div>
              )}
              {/* Author */}
              {selectedPr.author && (
                <div style={{ marginBottom: 12 }}>
                  <div className="pr-detail-label">{t("pulls.author")}</div>
                  <div className="pr-detail-value">{selectedPr.author}</div>
                </div>
              )}
              {/* Actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
                <Button
                  variant="primary"
                  size="sm"
                  style={{ width: "100%" }}
                  onClick={async () => {
                    await newSession();
                    setPage("chat");
                    await sendPrompt(`Review pull request #${selectedPr.number}${selectedPr.title ? ` (${selectedPr.title})` : ""}. Summarize changes, risks, and suggested next steps.`);
                  }}
                >
                  {t("pulls.review")}
                </Button>
                <Button variant="secondary" size="sm" style={{ width: "100%" }} onClick={() => void api.browserOpenExternal(selectedPr.url)}>
                  <IconExternal size={12} />
                  {t("pulls.open")}
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
