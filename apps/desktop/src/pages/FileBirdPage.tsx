import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useBlockingOverlayActive } from "../lib/blocking-overlay";
import { IconFileBird, IconMore } from "../components/icons";
import { Panel } from "../components/ui";


/**
 * FileBird (apps/filebird) in a main-owned `persist:filebird` WebContentsView,
 * the RavenPage pattern: this page renders only the hole, reports its rect and
 * drives visibility; unmounting hides the view so it never covers chat.
 *
 * D design: thin 48px Fcode frame (d-page-head) with title + connection pill +
 * kebab-only (R11j). No reload/external buttons. fragment.html:54-68.
 */
export function FileBirdPage({ blocked }: { blocked: boolean }) {
  const { t } = useTranslation();
  const overlayActive = useBlockingOverlayActive();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);

  useEffect(() => {
    void api.fileBirdSetVisible(!blocked && !overlayActive).then((r) => setFailed(!r.ok));
    return () => {
      void api.fileBirdSetVisible(false);
    };
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
          <span className="d-pill green">
            <span className="d-pill-dot" />
            {t("fileBird.connected")}
          </span>
          <div className="d-page-head-actions">
            <div className="fb-kebab" style={{ position: "relative" }}>
              <button
                type="button"
                className="d-btn ghost sm icon-btn"
                title={t("fileBird.moreOptions")}
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
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="fb-menu-item"
                    onClick={() => {
                      void api.fileBirdSetVisible(false).then(() =>
                        api.fileBirdSetVisible(true).then((r) => setFailed(!r.ok))
                      );
                      setKebabOpen(false);
                    }}
                  >
                    {t("fileBird.reload")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="fb-menu-item"
                    onClick={() => setKebabOpen(false)}
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
    <div className="thread-scroll">
      <div className="page-frame">
        <div className="page-header">
          <h1 className="page-title">{t("fileBird.title")}</h1>
        </div>
        <Panel className="page-card page-empty">
          <div className="page-empty-icon">
            <IconFileBird size={20} />
          </div>
          <div className="text-base-plus font-medium">{t("fileBird.unavailable")}</div>
        </Panel>
      </div>
    </div>
  );
}
