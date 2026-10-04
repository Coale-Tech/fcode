/**
 * WorkspaceBar — persistent context strip at the foot of the main pane (T1).
 *
 * Self-sufficient: polls IPC.invoke.benchStatus every 3 s via useBenchContext.
 * Shows: bench name · active site · bench run state · agent working indicator.
 *
 * Styled (28px, Espresso ink) by `.workspace-bar` in chat-shell.css.
 */
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { useBenchContext } from "../hooks/use-bench-context";

export function WorkspaceBar() {
  const { t } = useTranslation();
  const isRunning = useAppStore((s) => s.isRunning);
  const setPage = useAppStore((s) => s.setPage);
  const page = useAppStore((s) => s.page);
  const terminalOpen = useAppStore((s) => s.terminalOpen);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const bench = useBenchContext();

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
          <span className="workspace-bar-bench">{bench.benchName}</span>

          {bench.site && (
            <>
              <span className="workspace-bar-sep" aria-hidden="true">·</span>
              <span className="workspace-bar-site">{bench.site}</span>
            </>
          )}

          <span className="workspace-bar-sep" aria-hidden="true">·</span>

          <span
            className={`workspace-bar-run-state ${bench.kind === "running" ? "is-running" : "is-stopped"}`}
            aria-label={bench.kind === "running"
              ? t("workspaceBar.running", { defaultValue: "running" })
              : t("workspaceBar.stopped", { defaultValue: "stopped" })}
          >
            <span className="workspace-bar-dot" aria-hidden="true" />
            {bench.kind === "running"
              ? t("workspaceBar.running", { defaultValue: "running" })
              : t("workspaceBar.stopped", { defaultValue: "stopped" })}
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
