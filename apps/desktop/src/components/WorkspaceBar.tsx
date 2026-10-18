/**
 * WorkspaceBar — the app-level 28px status bar spanning the window foot (T1, D.css
 * `.d-statusbar`), below the rail, sidebar and canvas in every nav layout.
 *
 * Left: <dot> bench · bench running|stopped · N sites | Open bench log
 * Right (D design): model name · Supervised chip
 *
 * When a bench detail tab is open but the bench is not running, we fall back to
 * viewedBenchPath (set by BenchPage) so the bar always names the bench in focus.
 *
 * Styled by `.workspace-bar` in chat-shell.css.
 */
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { useBenchContext } from "../hooks/use-bench-context";
import { baseName } from "../lib/bench-view";
import { resolveStatusAgent } from "../lib/workspace-bar-state";

export function WorkspaceBar() {
  const { t } = useTranslation();
  const setPage = useAppStore((s) => s.setPage);
  // page is not directly needed here (model cluster shows on all pages)
  const viewedBenchPath = useAppStore((s) => s.viewedBenchPath);
  const viewedBenchSiteCount = useAppStore((s) => s.viewedBenchSiteCount);
  const bench = useBenchContext();

  // Active session model + permission — use full fallback chain (session → draft → settings → providers).
  const activeSession = useAppStore((s) => s.sessions.find((session) => session.id === s.activeSessionId));
  const draftConfiguration = useAppStore((s) => s.draftConfiguration);
  const settings = useAppStore((s) => s.settings);
  const providers = useAppStore((s) => s.providers);
  const agent = resolveStatusAgent({ session: activeSession, draft: draftConfiguration ?? undefined, settings, providers });
  // D design: "Supervised" for ask, "Accept edits" for accept-edits, "Auto" for auto.
  const permLabel = agent.mode === "ask"
    ? t("workspaceBar.supervised", { defaultValue: "Supervised" })
    : agent.mode === "accept-edits"
      ? t("workspaceBar.acceptEdits", { defaultValue: "Accept edits" })
      : t("workspaceBar.autonomous", { defaultValue: "Auto" });

  // Resolve display values — prefer live supervisor context, fall back to viewed bench.
  const hasLiveBench = bench.kind !== "empty";
  const displayName = hasLiveBench
    ? bench.benchName
    : viewedBenchPath
      ? baseName(viewedBenchPath)
      : null;
  const isLiveRunning = bench.kind === "running";
  // siteCount precedence: bench state (already defaults site→1) > viewedBenchSiteCount.
  // formatWorkspaceBarState always computes bench.siteCount = opts.siteCount ?? (site ? 1 : 0).
  const siteCount = bench.kind !== "empty" ? bench.siteCount : viewedBenchSiteCount;

  return (
    <div className="workspace-bar" role="status" aria-label="Workspace context">
      {displayName ? (
        <>
          {/* Status dot */}
          <span
            className={`workspace-bar-dot ${isLiveRunning ? "is-running" : "is-stopped"}`}
            aria-hidden="true"
          />

          {/* bench name */}
          <span className="workspace-bar-bench">{displayName}</span>

          <span className="workspace-bar-sep" aria-hidden="true">·</span>

          {/* bench running|stopped */}
          <span
            className={`workspace-bar-run-state ${isLiveRunning ? "is-running" : "is-stopped"}`}
            aria-label={isLiveRunning
              ? t("workspaceBar.benchRunning", { defaultValue: "bench running" })
              : t("workspaceBar.benchStopped", { defaultValue: "bench stopped" })}
          >
            {isLiveRunning
              ? t("workspaceBar.benchRunning", { defaultValue: "bench running" })
              : t("workspaceBar.benchStopped", { defaultValue: "bench stopped" })}
          </span>

          {/* site count when known */}
          {siteCount > 0 && (
            <>
              <span className="workspace-bar-sep" aria-hidden="true">·</span>
              <span className="workspace-bar-site">
                {siteCount} {siteCount === 1
                  ? t("workspaceBar.site", { defaultValue: "site" })
                  : t("workspaceBar.sites", { defaultValue: "sites" })}
              </span>
            </>
          )}

          {/* separator + Open bench log link */}
          <span className="workspace-bar-vsep" aria-hidden="true" />
          <button
            type="button"
            className="workspace-bar-link no-drag"
            onClick={() => setPage("bench")}
          >
            {t("workspaceBar.openBenchLog", { defaultValue: "Open bench log" })}
          </button>
        </>
      ) : (
        <>
          <span className="workspace-bar-placeholder">
            {t("workspaceBar.noBench", { defaultValue: "No bench selected" })}
          </span>
          <button
            type="button"
            className="workspace-bar-choose-btn no-drag"
            onClick={() => setPage("bench")}
          >
            {t("workspaceBar.chooseBench", { defaultValue: "Choose bench" })}
          </button>
        </>
      )}

      {/* D design: right side — model name + permission chip (all pages). */}
      {agent.modelId && (
        <div className="workspace-bar-model-cluster" aria-label={t("workspaceBar.sessionConfig", { defaultValue: "Session config" })}>
          <span className="workspace-bar-model">{agent.modelId}</span>
          <span className="workspace-bar-sep" aria-hidden="true">·</span>
          <span className="workspace-bar-perm">
            {permLabel}
          </span>
        </div>
      )}
    </div>
  );
}
