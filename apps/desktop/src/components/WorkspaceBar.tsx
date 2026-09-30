/**
 * WorkspaceBar — persistent context strip at the foot of the main pane (T1).
 *
 * Shows: active bench name · active site · bench run state · agent state.
 * Bench state is sourced by polling IPC bench/status every 2s via useBenchStatus (B8 fix).
 *
 * Styled (28px) by `.workspace-bar` in chat-shell.css.
 */
import { useAppStore } from "../stores/app-store";
import { benchStatusDisplay, useBenchStatus } from "../lib/use-bench-status";

export function WorkspaceBar() {
  const { status, benchPath, site } = useBenchStatus();
  const isRunning = useAppStore((s) => s.isRunning);

  const benchName = benchPath ? benchPath.split("/").pop() ?? benchPath : null;
  const { label, cls } = benchStatusDisplay(status);

  return (
    <div className="workspace-bar" role="status" aria-label="Workspace context">
      {/* Bench indicator */}
      <span className="workspace-bar-bench">
        {benchName ?? <span className="workspace-bar-placeholder">No bench</span>}
      </span>

      <span className="workspace-bar-sep" aria-hidden="true">·</span>

      {/* Site indicator */}
      <span className="workspace-bar-site">
        {site ?? <span className="workspace-bar-placeholder">No site</span>}
      </span>

      <span className="workspace-bar-sep" aria-hidden="true">·</span>

      {/* Bench run state */}
      <span
        className={`workspace-bar-run-state ${cls}`}
        aria-label={`Bench ${label}`}
      >
        <span className="workspace-bar-dot" aria-hidden="true" />
        {label}
      </span>

      {/* Agent state */}
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
