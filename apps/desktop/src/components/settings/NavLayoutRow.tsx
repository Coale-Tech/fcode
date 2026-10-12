import { useTranslation } from "react-i18next";
import type { AppSettings } from "@pi-desktop/shared";
import { NAV_LAYOUTS, type NavLayout } from "@pi-desktop/shared";
import { resolveNavLayout, nextNavLayout } from "../../lib/nav-layout";
import { cx } from "../ui";

// Exception: picker cards use raw <button role="radio"> rather than the Button
// primitive because the card structure (88px thumbnail + footer + check badge)
// is incompatible with Button's fixed 28px height model, and the ARIA role is
// "radio" not "button". Button primitive enforces --ds-btn-* metrics that would
// break the 178×88px card layout. Recorded as required by implementer-rules.

const LABEL: Record<NavLayout, string> = {
  tabs:   "settings.navLayoutTabs",
  rail:   "settings.navLayoutRail",
  island: "settings.navLayoutIsland",
};

/** HTML wireframe thumbnail matching fragment-d2.html:156-233 */
function Thumb({ layout }: { layout: NavLayout }) {
  const dots = (
    <>
      <div className="wf-dot" />
      <div className="wf-dot" />
      <div className="wf-dot" />
    </>
  );

  if (layout === "tabs") {
    return (
      <div className="nl-thumb" aria-hidden="true">
        <div className="wf-nb">
          {dots}
          <div className="wf-pill on" style={{ width: "22px", marginLeft: "5px" }} />
          <div className="wf-pill" style={{ width: "18px" }} />
          <div className="wf-pill" style={{ width: "16px" }} />
        </div>
        <div className="wf-body-row">
          <div className="wf-canvas-area">
            <div className="wf-panel-area">
              <div className="wf-row" style={{ width: "55%" }} />
              <div className="wf-row" style={{ width: "80%" }} />
              <div className="wf-row" style={{ width: "40%" }} />
              <div className="wf-row" style={{ width: "70%" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (layout === "island") {
    return (
      <div className="nl-thumb" aria-hidden="true">
        <div className="wf-nb">{dots}</div>
        <div className="wf-body-row">
          <div className="wf-rail-lg">
            <div className="wf-ri on" />
            <div className="wf-ri" />
            <div className="wf-ri" />
            <div className="wf-ri" />
          </div>
          <div className="wf-sidebar">
            <div className="wf-sb-bar on" style={{ height: "5px", borderRadius: "2px" }} />
            <div className="wf-sb-bar" />
            <div className="wf-sb-bar" />
            <div className="wf-sb-bar" />
          </div>
          <div className="wf-canvas-area" style={{ padding: "2px" }}>
            <div className="wf-island-wrap">
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
                <div className="wf-row" style={{ width: "70%" }} />
                <div className="wf-row" style={{ width: "50%" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // rail (default / D2)
  return (
    <div className="nl-thumb" aria-hidden="true">
      <div className="wf-nb">{dots}</div>
      <div className="wf-body-row">
        <div className="wf-rail-sm">
          <div className="wf-ri on" />
          <div className="wf-ri" />
          <div className="wf-ri" />
          <div className="wf-ri" />
        </div>
        <div className="wf-canvas-area">
          <div className="wf-panel-area">
            <div className="wf-row" style={{ width: "60%" }} />
            <div className="wf-row" style={{ width: "80%" }} />
            <div className="wf-row" style={{ width: "45%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Navigation layout picker — full-width section inside the Appearance card.
 * Rendered as nl-section (not SettingsRow) because the 3-card grid at 178px
 * each exceeds the 240px SettingsRow control column cap; the design (fragment-d2.html:150-239)
 * uses a standalone full-width section, not a label-left / control-right row.
 */
export function NavLayoutRow({
  settings,
  saveSettings,
}: {
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const current = resolveNavLayout(settings.navLayout);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const next = nextNavLayout(current, e.key);
    if (next === null) return;
    e.preventDefault();
    void saveSettings({ navLayout: next });
    const btn = e.currentTarget.querySelector<HTMLButtonElement>(
      `[data-nav-layout-option="${next}"]`,
    );
    btn?.focus();
  }

  return (
    <div className="nl-section">
      <div className="nl-section-label">{t("settings.navLayout")}</div>
      <div
        className="nl-grid"
        role="radiogroup"
        aria-label={t("settings.navLayout")}
        onKeyDown={onKeyDown}
      >
        {NAV_LAYOUTS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={current === id}
            data-nav-layout-option={id}
            className={cx("nl-card", current === id && "is-selected")}
            tabIndex={current === id ? 0 : -1}
            onClick={() => void saveSettings({ navLayout: id })}
          >
            <Thumb layout={id} />
            <div className="nl-foot">
              <span className="nl-card-label" title={t(LABEL[id])}>{t(LABEL[id])}</span>
              {current === id && (
                <div className="nl-check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
      <div className="nl-caption">{t("settings.navLayoutCaption")}</div>
    </div>
  );
}
