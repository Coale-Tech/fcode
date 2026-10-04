import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useBlockingOverlayActive } from "../lib/blocking-overlay";
import { Panel } from "../components/ui";
import { IconFileBird } from "../components/icons";

/**
 * FileBird (apps/filebird) in a main-owned `persist:filebird` WebContentsView,
 * the RavenPage pattern: this page renders only the hole, reports its rect and
 * drives visibility; unmounting hides the view so it never covers chat.
 */
export function FileBirdPage({ blocked }: { blocked: boolean }) {
  const { t } = useTranslation();
  const overlayActive = useBlockingOverlayActive();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

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

  if (!failed) return <div ref={surfaceRef} className="min-h-0 flex-1" data-filebird-surface />;
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
