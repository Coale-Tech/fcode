/**
 * WorkspaceBar — persistent context strip at the foot of the main pane (T1).
 *
 * Self-sufficient: polls IPC.invoke.benchStatus every 3 s via useBenchContext.
 * Shows: <dot> bench · bench running|stopped · N sites | Open bench log
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
  const isRunning = useAppStore((s) => s.isRunning);
  const setPage = useAppStore((s) => s.setPage);
  const page = useAppStore((s) => s.page);
  const terminalOpen = useAppStore((s) => s.terminalOpen);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const viewedBenchPath = useAppStore((s) => s.viewedBenchPath);
  const viewedBenchSiteCount = useAppStore((s) => s.viewedBenchSiteCount);
  const bench = useBenchContext();

  // Resolve display values — prefer live supervisor context, fall back to viewed bench.
  const hasLiveBench = bench.kind !== "empty";
  const displayName = hasLiveBench
    ? bench.benchName
    : viewedBenchPath
      ? baseName(viewedBenchPath)
      : null;
  const isLiveRunning = bench.kind === "running";
  // Use supervisor site if running; otherwise viewed bench site count.
  const siteCount = hasLiveBench ? (bench.site ? 1 : 0) : viewedBenchSiteCount;

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

      {isRunning && (
        <>
          <span className="workspace-bar-sep" aria-hidden="true">·</span>
          <span className="workspace-bar-agent-state" aria-label="Agent working">
            ◐ agent working
          </span>
        </>
      )}

      {page === "chat" && (
        <button
          type="button"
          className="workspace-bar-choose-btn workspace-bar-terminal-btn no-drag"
          aria-pressed={terminalOpen}
          title={t("terminal.toggle")}
          onClick={toggleTerminal}
        >
          {t("terminal.title")}
        </button>
      )}
    </div>
  );
}
