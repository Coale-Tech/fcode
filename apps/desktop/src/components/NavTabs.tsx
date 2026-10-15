/**
 * NavTabs — pill-tab strip (D1 tabs layout navbar).
 *
 * Design authority R11b: three primary tabs (Chat/Build/Bench) + ··· overflow
 * menu (not every destination as a pill). Overflow button opens a dropdown
 * that lists all flag-aware non-primary destinations. Overflow button gets
 * .active when the current page is not one of the three primary destinations.
 *
 * Design source: kit-d/D.css:146-178, D1-shell.html:96-108
 * Active state: --da-sub background, --da-txt colour, weight 600 (D.css:175)
 * Tab shape:    border-radius:var(--radius-full) pill (D.css:162)
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { portalToBody } from "../lib/portal-visibility";
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

  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef   = useRef<HTMLButtonElement>(null);
  const menuRef   = useRef<HTMLDivElement>(null);

  const items     = navItems({ kanban, raven });
  const primary   = items.filter((i) => PRIMARY_PAGES.includes(i.page as (typeof PRIMARY_PAGES)[number]));
  const overflow  = items.filter((i) => !PRIMARY_PAGES.includes(i.page as (typeof PRIMARY_PAGES)[number]));
  const isOverflow = !PRIMARY_PAGES.includes(page as (typeof PRIMARY_PAGES)[number]);

  const closeMenu = useCallback((restoreFocus = true) => {
    setMenuOpen(false);
    if (restoreFocus) requestAnimationFrame(() => moreRef.current?.focus());
  }, []);

  /* Close on outside click and Escape */
  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (moreRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      closeMenu(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closeMenu(); }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, closeMenu]);

  /* Arrow-key roving focus inside the primary tabs */
  const onTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const nav  = e.currentTarget.closest(".nav-tabs") as HTMLElement | null;
    if (!nav) return;
    const all  = Array.from(nav.querySelectorAll<HTMLElement>(".nav-tab"));
    const next = e.key === "ArrowRight"
      ? all[(idx + 1) % all.length]
      : all[(idx - 1 + all.length) % all.length];
    next?.focus();
  };

  /* Position menu below the More button */
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!menuOpen) { setMenuPos(null); return; }
    const place = () => {
      const rect = moreRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [menuOpen]);

  return (
    <nav className="nav-tabs" role="tablist" aria-label={t("nav.tabsLabel")}>
      {primary.map((item, idx) => {
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
            onKeyDown={(e) => onTabKeyDown(e, idx)}
          >
            <Icon size={13} aria-hidden />
            <span className="nav-tab-label">{label}</span>
          </button>
        );
      })}

      {/* Overflow "···" — opens destination menu (D1-shell.html:107) */}
      <button
        ref={moreRef}
        type="button"
        role="tab"
        aria-selected={isOverflow}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        data-nav="more"
        title={t("nav.more")}
        className={cx("nav-tab nav-tab-more", (isOverflow || menuOpen) && "active")}
        onClick={() => setMenuOpen((o) => !o)}
        onKeyDown={(e) => onTabKeyDown(e, primary.length)}
      >
        ···
      </button>

      {/* Overflow dropdown menu */}
      {menuOpen && menuPos && typeof document !== "undefined"
        ? portalToBody(
            <div
              ref={menuRef}
              role="menu"
              className="nav-tabs-overflow-menu"
              style={{ top: menuPos.top, left: menuPos.left }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); closeMenu(); }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
                  const idx = items.indexOf(document.activeElement as HTMLElement);
                  items[(idx + 1) % items.length]?.focus();
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
                  const idx = items.indexOf(document.activeElement as HTMLElement);
                  items[(idx - 1 + items.length) % items.length]?.focus();
                }
              }}
            >
              {overflow.map((item) => {
                const Icon  = NAV_ICONS[item.id];
                const label = t(item.labelKey);
                const active = page === item.page;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    data-nav={item.dataNav}
                    className={cx("nav-tabs-overflow-item", active && "active")}
                    onClick={() => { setPage(item.page); closeMenu(false); }}
                  >
                    <Icon size={14} aria-hidden />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>,
          )
        : null}
    </nav>
  );
}
