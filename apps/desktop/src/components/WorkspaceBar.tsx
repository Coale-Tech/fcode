/**
 * WorkspaceBar — persistent context strip at the foot of the main pane (T1).
 *
 * Left: <dot> bench · bench running|stopped · N sites | Open bench log
 * Right (D design): model name · Supervised chip
 *
 * When a bench detail tab is open but the bench is not running, we fall back to
 * viewedBenchPath (set by BenchPage) so the bar always names the bench in focus.
 *
 * Styled (28px, Espresso ink) by `.workspace-bar` in chat-shell.css.
 */
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { useBenchContext } from "../hooks/use-bench-context";
import { baseName } from "../lib/bench-view";

export function WorkspaceBar() {
  const { t } = useTranslation();
  const setPage = useAppStore((s) => s.setPage);
  const page = useAppStore((s) => s.page);
  const viewedBenchPath = useAppStore((s) => s.viewedBenchPath);
  const viewedBenchSiteCount = useAppStore((s) => s.viewedBenchSiteCount);
  const bench = useBenchContext();
  // Active session model + permission for the right chip cluster.
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const modelId = activeSession?.modelId ?? null;
  const permMode = activeSession?.permissionMode ?? null;
  // "ask" / "inherit" / null = supervised (default Pi Desktop behavior).
  // "auto" = fully autonomous. "accept-edits" = mid-tier.
  const isSupervisedMode =
    permMode === "ask" || permMode === "inherit" || permMode == null;
  // D design: show "Supervised" for ask/inherit, "Auto" otherwise.
  const permLabel = isSupervisedMode
    ? t("workspaceBar.supervised", { defaultValue: "Supervised" })
    : permMode === "accept-edits"
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
  // siteCount: both "running" and "stopped" states carry siteCount (workspace-bar-state.ts).
  const siteCount = bench.kind === "running" || bench.kind === "stopped"
    ? bench.siteCount
    : viewedBenchSiteCount;

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
            className="workspace-bar-choose-btn no-drag"
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

      {/* D design: right side — model name + permission chip */}
      {(modelId || permMode != null) && page === "chat" && (
        <div className="workspace-bar-model-cluster" aria-label={t("workspaceBar.sessionConfig", { defaultValue: "Session config" })}>
          {modelId && (
            <span className="workspace-bar-model">{modelId}</span>
          )}
          {(modelId && permMode != null) && (
            <span className="workspace-bar-sep" aria-hidden="true">·</span>
          )}
          {permMode != null && (
            <span className="workspace-bar-perm">
              {permLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
