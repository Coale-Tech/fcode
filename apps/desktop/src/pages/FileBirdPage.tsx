import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IPC } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { useBlockingOverlayActive } from "../lib/blocking-overlay";
import { IconFileBird, IconMore } from "../components/icons";

/**
 * FileBird (apps/filebird) in a main-owned `persist:filebird` WebContentsView,
 * the RavenPage pattern: this page renders only the hole, reports its rect and
 * drives visibility; unmounting hides the view so it never covers chat.
 *
 * D design: thin 48px Fcode frame (d-page-head) with title + connection pill +
 * kebab-only (R11j). fragment.html:54-68.
 *
 * Status pill: gray "Not connected" while the service is running (FileBird's
 * internal SFTP state is not observable from this renderer; the design's
 * green/amber states require FileBird to push status IPC events).
 * `failed` = service unavailable → show unavailable state.
 */
export function FileBirdPage({ blocked }: { blocked: boolean }) {
  const { t } = useTranslation();
  const overlayActive = useBlockingOverlayActive();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  // T14: green pill when FileBird pushes fileBirdStatus=connected.
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (window.__PI_CAPTURE__ && window.__PI_CAPTURE_FILEBIRD_VISIBLE__) {
      setConnected(true);
      return;
    }
    const off = window.piDesktop?.on?.(IPC.event.fileBirdStatus, (data: unknown) => {
      if (data && typeof data === "object" && "status" in data && typeof data.status === "string") {
        setConnected(data.status === "connected");
      }
    });
    return () => off?.();
  }, []);
  useEffect(() => {
    // Capture mode: skip the IPC call that sets failed=true (fileBird service not running).
    if (window.__PI_CAPTURE__ && window.__PI_CAPTURE_FILEBIRD_VISIBLE__) return;
    void api.fileBirdSetVisible(!blocked && !overlayActive).then((r) => setFailed(!r.ok));
    return () => { void api.fileBirdSetVisible(false); };
  }, [blocked, overlayActive]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    let frame = 0;
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = surface.getBoundingClientRect();
        void api.fileBirdSetBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
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
  }, [failed]);

  if (!failed) {
    return (
      <div className="filebird-page-wrap">
        {/* Fcode-owned chrome bar: title + status pill + kebab (fragment.html:55-68) */}
        <div className="d-page-head">
          <span className="d-page-title">{t("fileBird.title")}</span>
          {/* Pill reflects real SFTP connection state (fileBirdStatus IPC event). */}
          <span className={`d-pill ${connected ? "green" : "gray"}`}>
            <span className="d-pill-dot" />
            {connected ? t("fileBird.connected", "Connected") : t("fileBird.idle")}
          </span>
          <div className="d-page-head-actions">
            <div className="fb-kebab" style={{ position: "relative" }}>
              <button
                type="button"
                className="icon-btn icon-btn-square"
                title={t("fileBird.moreOptions")}
                aria-haspopup="true"
                aria-expanded={kebabOpen}
                onClick={() => setKebabOpen((o) => !o)}
              >
                <IconMore size={14} />
              </button>
              {kebabOpen && (
                <div
                  className="fb-kebab-menu"
                  role="menu"
                  style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 100 }}
                  onKeyDown={(e) => { if (e.key === "Escape") setKebabOpen(false); }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="fb-menu-item"
                    onClick={() => {
                      void api.fileBirdReload().catch(() => {});
                      setKebabOpen(false);
                    }}
                  >
                    {t("fileBird.reload")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="fb-menu-item"
                    onClick={() => {
                      void api.fileBirdOpenWindow().catch(() => {});
                      setKebabOpen(false);
                    }}
                  >
                    {t("fileBird.openWindow")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* WebContentsView hole: fills remaining canvas minus page head */}
        <div ref={surfaceRef} className="min-h-0 flex-1" data-filebird-surface />
      </div>
    );
  }


  return (
    <div className="filebird-page-wrap">
      {/* Always show the Fcode chrome bar even in failed state */}
      <div className="d-page-head">
        <span className="d-page-title">{t("fileBird.title")}</span>
        <span className={`d-pill ${connected ? "green" : "gray"}`}>
          <span className="d-pill-dot" />
          {connected ? t("fileBird.connected", "Connected") : t("fileBird.idle")}
        </span>
      </div>
      <div className="rv-disconnected">
        <div className="rv-signin-card">
          <div className="rv-signin-icon gray">
            <IconFileBird size={24} />
          </div>
          <p className="rv-signin-title">{t("fileBird.title")}</p>
          <p className="rv-signin-desc">{t("fileBird.unavailable")}</p>
        </div>
      </div>
    </div>
  );
}
