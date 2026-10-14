/**
 * NavTabs — pill-tab strip (D1 tabs layout navbar).
 *
 * Design authority R11b: three primary tabs (Chat/Build/Bench) + ··· overflow
 * button (not every destination as a pill). Overflow button gets .active when
 * the current page is not one of the three primary destinations.
 *
 * Design source: kit-d/D.css:146-178, D1-shell.html:96-108
 * Active state: --da-sub background, --da-txt colour, weight 600 (D.css:175)
 * Tab shape:    border-radius:var(--radius-full) pill (D.css:162)
 */
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { navItems } from "./nav-items";
import { NAV_ICONS } from "./NavRail";
import { cx } from "./ui";

/** Primary tab destinations shown as explicit pills (D1-shell.html:98-107). */
const PRIMARY_PAGES = ["chat", "build", "bench"] as const;

export function NavTabs() {
  const { t } = useTranslation();
  const page    = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const kanban  = useAppStore((s) => s.kanbanEnabled);
  const raven   = useAppStore((s) => s.ravenEnabled);

  const items = navItems({ kanban, raven });
  const primary   = items.filter((i) => PRIMARY_PAGES.includes(i.page as (typeof PRIMARY_PAGES)[number]));
  const isOverflow = !PRIMARY_PAGES.includes(page as (typeof PRIMARY_PAGES)[number]);

  return (
    <nav className="nav-tabs" role="tablist" aria-label="Primary">
      {primary.map((item) => {
        const Icon  = NAV_ICONS[item.id];
        const label = t(item.labelKey);
        const active = page === item.page;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-nav={item.dataNav}
            title={label}
            className={cx("nav-tab", active && "active")}
            onClick={() => setPage(item.page)}
          >
            <Icon size={13} aria-hidden />
            <span className="nav-tab-label">{label}</span>
          </button>
        );
      })}
      {/* Overflow "···" — active when a non-primary page is active (D1-shell.html:107) */}
      <button
        type="button"
        role="tab"
        aria-selected={isOverflow}
        data-nav="more"
        title={t("nav.more")}
        className={cx("nav-tab nav-tab-more", isOverflow && "active")}
        onClick={() => {
          // Navigate to settings as the canonical overflow entry point (settings
          // is always accessible and not in the primary strip).
          if (!isOverflow) setPage("scheduled");
        }}
      >
        ···
      </button>
    </nav>
  );
}
