/**
 * ExtWidget — renders omp setWidget content above the composer.
 *
 * Each widget is keyed; setting undefined/empty lines clears it.
 * Content is text-only (each line is a text node; no dangerouslySetInnerHTML).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../lib/api";
import { IconChevronDown } from "../../../components/icons";
import { applyExtWidget, type ExtWidgetState } from "./ext-ui-state";

function WidgetBlock({ lines, label }: { lines: string[]; label: string }) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="ext-widget-block" role="note" aria-label={label}>
      <button
        type="button"
        className={`ext-widget-toggle${collapsed ? " is-collapsed" : ""}`}
        aria-expanded={!collapsed}
        aria-label={collapsed ? t("chat.extWidget.expand") : t("chat.extWidget.collapse")}
        onClick={() => setCollapsed((c) => !c)}
      >
        <IconChevronDown size={12} aria-hidden />
      </button>
      {!collapsed && (
        <div className="ext-widget-lines">
          {lines.map((line, i) => (
            // ponytail: key by index — widget lines have no stable id
            <div key={i} className="ext-widget-line">{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExtWidget({ sessionId }: { sessionId: string | undefined }) {
  const [widgets, setWidgets] = useState<ExtWidgetState>({});

  useEffect(() => {
    setWidgets({});
  }, [sessionId]);

  useEffect(() => {
    return api.onSidecarExtUi((event) => {
      if (event.kind !== "widget" || event.sessionId !== sessionId) return;
      setWidgets((prev) => applyExtWidget(prev, event.key, event.lines));
    });
  }, [sessionId]);

  const entries = Object.entries(widgets);
  if (!entries.length) return null;

  return (
    <div className="ext-widget-area">
      {entries.map(([key, lines]) => (
        <WidgetBlock key={key} lines={lines} label={key} />
      ))}
    </div>
  );
}
