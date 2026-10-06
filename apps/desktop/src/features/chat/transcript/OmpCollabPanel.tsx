/**
 * Collab / Share panel for omp sessions (feat/collab-panel).
 *
 * Surfaces the /share snapshot command and links to collab settings.
 * Live collab (/collab start, guest join, participants) is TUI-only in the
 * current omp build — this panel documents that and links to CLI guidance.
 */
import { memo, useCallback, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../lib/api";
import { Button } from "../../../components/ui";
import {
  OMP_COLLAB_INITIAL,
  ompCollabReducer,
} from "../../../lib/omp-collab";
import { useAppStore } from "../../../stores/app-store";

// ── panel ─────────────────────────────────────────────────────────────────────

export const OmpCollabPanel = memo(function OmpCollabPanel({
  sessionId,
}: {
  sessionId: string | undefined;
}) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(ompCollabReducer, OMP_COLLAB_INITIAL);
  const [copied, setCopied] = useState(false);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);
  const setSettingsAnchor = useAppStore((s) => s.setSettingsAnchor);

  const isOmpSession = Boolean(sessionId);

  const handleShare = useCallback(async () => {
    if (state.phase === "loading") return;
    dispatch({ type: "share_requested" });
    try {
      const result = await api.ompShare();
      dispatch({ type: "share_success", url: result.url, text: result.text });
    } catch (e) {
      dispatch({
        type: "share_error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [state.phase]);

  const handleCopy = useCallback(() => {
    if (!state.url) return;
    void navigator.clipboard.writeText(state.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [state.url]);

  const openCollabSettings = useCallback(() => {
    setSettingsTab("ai");
    setSettingsAnchor("settings.ompCollabGroup");
  }, [setSettingsTab, setSettingsAnchor]);

  if (!isOmpSession) return null;

  return (
    <div className="omp-collab-panel" role="region" aria-label={t("settings.ompCollabGroup")}>
      {/* ── Share snapshot ──────────────────────────────────── */}
      <div className="omp-collab-section">
        <div className="omp-collab-row omp-collab-row--header">
          <span className="omp-collab-label">{t("settings.ompCollabPanelShare")}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={state.phase === "loading"}
            onClick={() => void handleShare()}
            aria-busy={state.phase === "loading"}
          >
            {state.phase === "loading"
              ? t("settings.ompCollabPanelShareLoading")
              : t("settings.ompCollabPanelShareBtn")}
          </Button>
        </div>

        {state.phase === "url" && state.url && (() => {
          // Defense-in-depth: only render an anchor for http(s) URLs.
          const safeUrl = /^https?:\/\//i.test(state.url) ? state.url : null;
          return (
            <div className="omp-collab-url-row">
              {safeUrl ? (
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="omp-collab-url"
                  title={safeUrl}
                >
                  {safeUrl}
                </a>
              ) : (
                <span className="omp-collab-url" title={state.url}>{state.url}</span>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCopy}
                aria-label={t("settings.ompCollabPanelShareCopy")}
              >
                {copied ? "✓" : t("settings.ompCollabPanelShareCopy")}
              </Button>
            </div>
          );
        })()}

        {state.phase === "error" && state.error && (
          <div className="omp-collab-error">
            {t("settings.ompCollabPanelShareError")}: {state.error}
          </div>
        )}
      </div>

      {/* ── Settings link + live collab note ────────────────── */}
      <div className="omp-collab-section omp-collab-section--footer">
        <button
          type="button"
          className="omp-collab-settings-link"
          onClick={openCollabSettings}
        >
          {t("settings.ompCollabPanelSettings")}
        </button>
        <span className="omp-collab-note">
          {t("settings.ompCollabPanelShareNote")}
        </span>
      </div>
    </div>
  );
});
