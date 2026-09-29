/**
 * WorkspaceBar — persistent context strip at the foot of the main pane (T1).
 *
 * Shows: active bench name ▾ · active site ▾ · bench run state · agent state.
 *
 * Agent N owns the bench-state slice (activeBenchPath, activeSite, benchRunning).
 * Until that merges, those props are optional and fall back to placeholder text,
 * so WorkspaceBar renders safely without the bench domain being wired.
 *
 * Styled (28px, Espresso ink) by `.workspace-bar` in chat-shell.css.
 */
import { useAppStore } from "../stores/app-store";

export interface WorkspaceBarProps {
  /** Path of the currently selected bench. Optional until agent N merges. */
  activeBench?: string | null;
  /** Active site name. Optional until agent N merges. */
  activeSite?: string | null;
  /** Whether the bench process is currently running. */
  benchRunning?: boolean;
}

export function WorkspaceBar({
  activeBench = null,
  activeSite = null,
  benchRunning = false,
}: WorkspaceBarProps) {
  const isRunning = useAppStore((s) => s.isRunning);

  const benchName = activeBench
    ? activeBench.split("/").pop() ?? activeBench
    : null;

  return (
    <div className="workspace-bar" role="status" aria-label="Workspace context">
      {/* Bench indicator */}
      <span className="workspace-bar-bench">
        {benchName ?? <span className="workspace-bar-placeholder">No bench</span>}
      </span>

      <span className="workspace-bar-sep" aria-hidden="true">·</span>

      {/* Site indicator */}
      <span className="workspace-bar-site">
        {activeSite ?? <span className="workspace-bar-placeholder">No site</span>}
      </span>

      <span className="workspace-bar-sep" aria-hidden="true">·</span>

      {/* Bench run state */}
      <span
        className={`workspace-bar-run-state ${benchRunning ? "is-running" : "is-stopped"}`}
        aria-label={benchRunning ? "Bench running" : "Bench stopped"}
      >
        <span
          className="workspace-bar-dot"
          aria-hidden="true"
        />
        {benchRunning ? "running" : "stopped"}
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
