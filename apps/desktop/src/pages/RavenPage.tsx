import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RavenSettings } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { useBlockingOverlayActive } from "../lib/blocking-overlay";
import { useAppStore } from "../stores/app-store";
import { Button, Panel } from "../components/ui";
import { IconRaven } from "../components/icons";

/**
 * Raven team chat (`<site>/raven`) in a main-owned `persist:raven`
 * WebContentsView. This page renders only the hole: it reports the rect and
 * drives visibility. The view composites above renderer content, so overlays
 * hide it, and the unmount cleanup is what stops it covering chat.
 */
export function RavenPage({ blocked }: { blocked: boolean }) {
  const { t } = useTranslation();
  const setPage = useAppStore((s) => s.setPage);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);
  const overlayActive = useBlockingOverlayActive();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [settings, setSettings] = useState<RavenSettings | null>(null);
  const ready = settings?.enabled === true;

  useEffect(() => {
    void api.ravenSettingsGet().then((r) => setSettings(r.settings)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!ready) return;
    void api.ravenSetVisible(!blocked && !overlayActive);
    return () => {
      void api.ravenSetVisible(false);
    };
  }, [ready, blocked, overlayActive]);

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
  }, [ready]);

  if (!settings) return null;
  if (ready) return <div ref={surfaceRef} className="min-h-0 flex-1" data-raven-surface />;
  return (
    <div className="thread-scroll">
      <div className="page-frame">
        <div className="page-header">
          <h1 className="page-title">{t("raven.title")}</h1>
        </div>
        <Panel className="page-card page-empty">
          <div className="page-empty-icon">
            <IconRaven size={20} />
          </div>
          <div className="text-base-plus font-medium">{t("raven.empty")}</div>
          <Button
            className="mt-5"
            variant="primary"
            onClick={() => {
              setSettingsTab("raven");
              setPage("settings");
            }}
          >
            {t("raven.openSettings")}
          </Button>
        </Panel>
      </div>
    </div>
  );
}
