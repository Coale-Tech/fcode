/**
 * WorkspaceBar — the app-level 28px status bar spanning the window foot (T1, D.css
 * `.d-statusbar`), below the rail, sidebar and canvas in every nav layout.
 *
 * Self-sufficient: polls IPC.invoke.benchStatus every 3 s via useBenchContext.
 * Shows: <dot> bench · bench running|stopped · N sites | Open bench log
 *        …and on the right the effective model plus permission-mode badge.
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
import { resolveStatusAgent, type StatusPermissionMode } from "../lib/workspace-bar-state";
import { IconShield } from "./icons";

const MODE_LABEL_KEY: Record<StatusPermissionMode, string> = {
  ask: "workspaceBar.modeAsk",
  "accept-edits": "workspaceBar.modeAcceptEdits",
  auto: "workspaceBar.modeAuto",
};

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
  const activeSession = useAppStore((s) => s.sessions.find((session) => session.id === s.activeSessionId));
  const draftConfiguration = useAppStore((s) => s.draftConfiguration);
  const settings = useAppStore((s) => s.settings);
  const providers = useAppStore((s) => s.providers);
  const agent = resolveStatusAgent({
    session: activeSession,
    draft: draftConfiguration ?? undefined,
    settings,
    providers,
  });

  // Resolve display values — prefer live supervisor context, fall back to viewed bench.
  const hasLiveBench = bench.kind !== "empty";
  const displayName = hasLiveBench
    ? bench.benchName
    : viewedBenchPath
      ? baseName(viewedBenchPath)
      : null;
  const isLiveRunning = bench.kind === "running";
  // viewedBenchSiteCount is set from discovery when the user navigates to a bench and is more
  // accurate (all sites) than the supervisor's single activeSite; a bench-state siteCount
  // (capture override) wins when provided.
  const siteCount = hasLiveBench && bench.siteCount != null
    ? bench.siteCount
    : viewedBenchSiteCount > 0
      ? viewedBenchSiteCount
      : (hasLiveBench ? (bench.site ? 1 : 0) : 0);

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

      {isRunning && (
        <>
          <span className="workspace-bar-sep" aria-hidden="true">·</span>
          <span className="workspace-bar-agent-state" aria-label="Agent working">
            ◐ agent working
          </span>
        </>
      )}

      <div className="workspace-bar-end">
        {agent.modelId && <span className="workspace-bar-model">{agent.modelId}</span>}
        <span className="workspace-bar-mode">
          <IconShield size={10} aria-hidden />
          {t(MODE_LABEL_KEY[agent.mode])}
        </span>
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
    </div>
  );
}
