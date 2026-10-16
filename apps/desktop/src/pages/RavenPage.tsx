import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IPC, type RavenSettings } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { useBlockingOverlayActive } from "../lib/blocking-overlay";
import { useAppStore } from "../stores/app-store";
import { Button } from "../components/ui";
import { IconRaven, IconRefresh, IconExternal, IconTriangleAlert } from "../components/icons";

/**
 * Raven team chat (`<site>/raven`) in a main-owned `persist:raven`
 * WebContentsView. This page renders only the hole: it reports the rect and
 * drives visibility. The view composites above renderer content, so overlays
 * hide it, and the unmount cleanup is what stops it covering chat.
 *
 * D design: always show the 48px d-page-head frame (fragment.html; notes.md).
 * Connected state: green once the WebContentsView fires did-finish-load
 * (ravenConnected event). Disconnected state: amber "Sign-in needed" pill
 * with a centred sign-in card. (fragment-disconnected.html)
 */
export function RavenPage({ blocked }: { blocked: boolean }) {
  const { t } = useTranslation();
  const setPage = useAppStore((s) => s.setPage);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);
  const overlayActive = useBlockingOverlayActive();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [settings, setSettings] = useState<RavenSettings | null>(null);
  /** True once the Raven WebContentsView fires did-finish-load. */
  const [connected, setConnected] = useState(false);
  const ready = settings?.enabled === true;

  const fetchSettings = useCallback(() => {
    void api.ravenSettingsGet().then((r) => setSettings(r.settings)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchSettings();
    const offChanged = window.piDesktop?.on?.(IPC.event.ravenChanged, () => {
      fetchSettings();
      // A settings change (e.g. new URL) drops the existing pane; reset connected.
      setConnected(false);
    });
    const offConnected = window.piDesktop?.on?.(IPC.event.ravenConnected, () => {
      setConnected(true);
    });
    return () => {
      offChanged?.();
      offConnected?.();
    };
  }, [fetchSettings]);

  useEffect(() => {
    if (!ready) return;
    void api.ravenSetVisible(!blocked && !overlayActive && connected);
    return () => {
      void api.ravenSetVisible(false);
    };
  }, [ready, blocked, overlayActive, connected]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !ready) return;
    let frame = 0;
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = surface.getBoundingClientRect();
        void api.ravenSetBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      });
    };
    const observer = new ResizeObserver(report);
    observer.observe(surface);
    window.addEventListener("resize", report);
    report();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", report);
      cancelAnimationFrame(frame);
    };
  }, [ready, connected]);

  if (!settings) return null;

  // D design: thin Fcode chrome (48px page head) is always present.
  // fragment.html (connected), fragment-disconnected.html (sign-in needed).
  const url = (() => {
    try { return settings.url ? new URL(settings.url).hostname + "/raven" : ""; }
    catch { return settings.url ?? ""; }
  })();

  return (
    <div className="raven-page-wrap">
      {/* Fcode-owned chrome bar — always rendered */}
      <div className="d-page-head">
        <span className="d-page-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <IconRaven size={15} />
          {t("raven.title")}
        </span>
        {url && <span className="raven-url-chip">{url}</span>}
        {ready && connected ? (
          <span className="d-pill green">
            <span className="d-pill-dot" />
            {t("raven.connected")}
          </span>
        ) : (
          <span className="d-pill amber">
            <span className="d-pill-dot" />
            {t("raven.signInNeeded")}
          </span>
        )}
        <div className="d-page-head-actions">
          {ready && (
            <>
              <button
                type="button"
                className="d-btn ghost sm icon-btn"
                title={t("raven.reload")}
                onClick={() => void api.ravenReload().catch(() => {})}
              >
                <IconRefresh size={13} />
              </button>
              <button
                type="button"
                className="d-btn ghost sm icon-btn"
                title={t("raven.openExternal")}
                onClick={() => settings.url && void api.browserOpenExternal(new URL("/raven", settings.url).toString())}
              >
                <IconExternal size={13} />
              </button>
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSettingsTab("raven");
              setPage("settings");
            }}
          >
            {t("raven.openSettings")}
          </Button>
        </div>
      </div>

      {ready && connected ? (
        /* WebContentsView hole: fills the remaining space below the chrome bar */
        <div ref={surfaceRef} className="min-h-0 flex-1" data-raven-surface />
      ) : ready ? (
        /* Ready but not connected: sign-in card with Retry (fragment-disconnected.html) */
        <div className="rv-disconnected">
          <div className="rv-signin-card">
            <div className="rv-signin-icon amber">
              <IconTriangleAlert size={22} />
            </div>
            <p className="rv-signin-title">{t("raven.signInTitle")}</p>
            <p className="rv-signin-desc">{t("raven.signInDesc", { site: url || settings.url || "" })}</p>
            {url && <p className="rv-signin-url">{url}</p>}
            <div className="rv-signin-actions">
              <Button
                variant="primary"
                onClick={() => settings.url && void api.browserOpenExternal(new URL("/raven", settings.url).toString())}
              >
                <IconExternal size={13} style={{ marginRight: 6 }} />
                {t("raven.openInBrowser")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void api.ravenReload().catch(() => {})}
              >
                <IconRefresh size={13} style={{ marginRight: 6 }} />
                {t("raven.retry")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Not configured: sign-in card with Settings (not-enabled state) */
        <div className="rv-disconnected">
          <div className="rv-signin-card">
            <div className="rv-signin-icon gray">
              <IconRaven size={24} />
            </div>
            <p className="rv-signin-title">{t("raven.signInTitle")}</p>
            {url && <p className="rv-signin-url">{url}</p>}
            <div className="rv-signin-actions">
              <Button
                variant="primary"
                onClick={() => settings.url && void api.browserOpenExternal(new URL("/raven", settings.url).toString())}
              >
                {t("raven.openInBrowser")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setSettingsTab("raven");
                  setPage("settings");
                }}
              >
                {t("raven.openSettings")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
