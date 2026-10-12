/**
 * TUI launch panel for omp sessions (Slice I).
 *
 * Spawns a shell script that sets provider env and execs the omp TUI,
 * then opens it as a new tab in the integrated terminal.
 */
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../lib/api";
import { Button } from "../../../components/ui";
import { useAppStore } from "../../../stores/app-store";

export const OmpTuiPanel = memo(function OmpTuiPanel({
  sessionId,
  projectPath,
}: {
  sessionId: string | undefined;
  projectPath?: string;
}) {
  const { t } = useTranslation();
  const openTuiTerminal = useAppStore((s) => s.openTuiTerminal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!sessionId) return null;

  const handleOpen = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.ompTuiOpen({ sessionId, projectPath });
      openTuiTerminal(`exec bash ${JSON.stringify(result.scriptPath)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="omp-collab-panel" role="region" aria-label={t("nonRpcModes.tuiTitle")}>
      <div className="omp-collab-section">
        <div className="omp-collab-row omp-collab-row--header">
          <span className="omp-collab-label">{t("nonRpcModes.tuiTitle")}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={() => void handleOpen()}
            aria-busy={loading}
          >
            {loading ? "…" : t("nonRpcModes.tuiRunButton")}
          </Button>
        </div>
        {error && <div className="omp-collab-error">{error}</div>}
        <div className="omp-collab-section omp-collab-section--footer">
          <span className="omp-collab-note">{t("nonRpcModes.tuiSessionNote")}</span>
        </div>
      </div>
    </div>
  );
});
