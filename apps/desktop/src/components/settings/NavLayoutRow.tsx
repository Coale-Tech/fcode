import { useTranslation } from "react-i18next";
import type { AppSettings } from "@pi-desktop/shared";
import { NAV_LAYOUTS, type NavLayout } from "@pi-desktop/shared";
import { SettingsRow } from "../../features/settings/primitives";
import { resolveNavLayout, nextNavLayout } from "../../lib/nav-layout";
import { cx } from "../ui";

const LABEL = {
  tabs: "settings.navLayoutTabs",
  rail: "settings.navLayoutRail",
  island: "settings.navLayoutIsland",
} as const satisfies Record<NavLayout, string>;

/** 64×44 wireframe: navbar band, then the layout's nav chrome, then the canvas. */
function Thumb({ layout }: { layout: NavLayout }) {
  return (
    <svg className="nav-layout-thumb" viewBox="0 0 64 44" aria-hidden>
      <rect x=".5" y=".5" width="63" height="43" rx="5" fill="none" stroke="currentColor" opacity=".35" />
      <rect x="1" y="1" width="62" height="7" fill="currentColor" opacity=".12" />
      {layout === "tabs" && (
        <>
          <rect x="6" y="3" width="9" height="3" rx="1.5" fill="currentColor" />
          <rect x="17" y="3" width="9" height="3" rx="1.5" fill="currentColor" opacity=".4" />
          <rect x="28" y="3" width="9" height="3" rx="1.5" fill="currentColor" opacity=".4" />
        </>
      )}
      {layout === "rail" && <rect x="1" y="8" width="7" height="35" fill="currentColor" opacity=".12" />}
      {layout === "island" && (
        <>
          <rect x="1" y="8" width="10" height="35" fill="currentColor" opacity=".12" />
          <rect x="12" y="8" width="14" height="35" fill="currentColor" opacity=".08" />
        </>
      )}
      <rect
        x={layout === "tabs" ? 4 : layout === "rail" ? 11 : 29}
        y="11"
        width={layout === "tabs" ? 56 : layout === "rail" ? 49 : 31}
        height="29"
        rx="3"
        fill="currentColor"
        opacity=".18"
      />
    </svg>
  );
}

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
    <SettingsRow title={t("settings.navLayout")} description={t("settings.navLayoutDesc")}>
      <div
        className="nav-layout-picker"
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
            className={cx("nav-layout-card", current === id && "is-selected")}
            tabIndex={current === id ? 0 : -1}
            onClick={() => void saveSettings({ navLayout: id })}
          >
            <Thumb layout={id} />
            <span className="nav-layout-card-label">{t(LABEL[id])}</span>
          </button>
        ))}
      </div>
    </SettingsRow>
  );
}
