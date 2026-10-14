import {
  isNavLayout,
  DEFAULT_NAV_LAYOUT,
  NAV_LAYOUTS,
  type NavLayout,
} from "@pi-desktop/shared";

export function resolveNavLayout(value: unknown): NavLayout {
  return isNavLayout(value) ? value : DEFAULT_NAV_LAYOUT;
}

/** Returns the layout reached by pressing `key` from `current`; null for non-arrow keys. */
export function nextNavLayout(current: NavLayout, key: string): NavLayout | null {
  const idx = NAV_LAYOUTS.indexOf(current);
  if (key === "ArrowRight" || key === "ArrowDown") return NAV_LAYOUTS[(idx + 1) % NAV_LAYOUTS.length];
  if (key === "ArrowLeft" || key === "ArrowUp") return NAV_LAYOUTS[(idx + NAV_LAYOUTS.length - 1) % NAV_LAYOUTS.length];
  return null;
}

/** Keep in sync with --d-rail-w, --d-rail-island, --d-rail-exp, --d-gap in styles/d-tokens.css. */
const RAIL_WIDTH: Record<NavLayout, number> = { tabs: 0, rail: 50, island: 60 };
const RAIL_EXPANDED_WIDTH = 220; // D2 expanded rail — matches --d-rail-exp
const CANVAS_GAP = 12;

/** Horizontal space the shell chrome takes before the sidebar/main/work-panel columns.
 *  Pass railExpanded=true when the D2 rail is in its 220px expanded state. */
export function shellChromeWidth(layout: NavLayout, railExpanded?: boolean): number {
  const railW = layout === "rail" && railExpanded ? RAIL_EXPANDED_WIDTH : RAIL_WIDTH[layout];
  return railW + CANVAS_GAP * 2;
}

/** Fixed sidebar width for the island (D3) layout — matches --d-island-sb. */
export const ISLAND_SIDEBAR_W = 256;

/** In island layout the sidebar is permanent and fixed at ISLAND_SIDEBAR_W.
 *  Returns the effective sidebar props to pass to WorkPanel so the budget
 *  always accounts for 256px regardless of the user collapse/width state. */
export function islandSidebarProps(
  navLayout: NavLayout,
  sidebarCollapsed: boolean,
  sidebarWidth: number,
): { sidebarCollapsed: boolean; sidebarWidth: number } {
  if (navLayout === "island") return { sidebarCollapsed: false, sidebarWidth: ISLAND_SIDEBAR_W };
  return { sidebarCollapsed, sidebarWidth };
}
