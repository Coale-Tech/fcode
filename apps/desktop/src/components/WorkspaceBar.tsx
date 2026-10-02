/**
 * WorkspaceBar — persistent context strip at the foot of the main pane (T1).
 *
 * Polls bench state via useBenchStatus (use-bench-status.ts, B8 fix).
 * Shows: bench name · active site · bench run state · agent working indicator.
 *
 * Styled (28px, Espresso ink) by `.workspace-bar` in chat-shell.css.
 */
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { useBenchStatus, benchStatusDisplay } from "../lib/use-bench-status";

export function WorkspaceBar() {
  const { t } = useTranslation();
  const isRunning = useAppStore((s) => s.isRunning);
  const setPage = useAppStore((s) => s.setPage);
  const bench = useBenchStatus();

  // Map WorkspaceBarState.kind to benchStatusDisplay label+cls.
  const benchName = bench.kind !== "empty" ? bench.benchName : null;
  const { label: runLabel, cls: runCls } = benchStatusDisplay(
    bench.kind === "running" ? "running" : "stopped",
  );

  return (
    <div className="workspace-bar" role="status" aria-label="Workspace context">
      {bench.kind === "empty" ? (
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
      ) : (
        <>
          <span className="workspace-bar-bench">{benchName}</span>

          {bench.site && (
            <>
              <span className="workspace-bar-sep" aria-hidden="true">·</span>
              <span className="workspace-bar-site">{bench.site}</span>
            </>
          )}

          <span className="workspace-bar-sep" aria-hidden="true">·</span>

          <span
            className={`workspace-bar-run-state ${runCls}`}
            aria-label={`Bench ${runLabel}`}
          >
            <span className="workspace-bar-dot" aria-hidden="true" />
            {runLabel}
          </span>
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
    </div>
  );
}
