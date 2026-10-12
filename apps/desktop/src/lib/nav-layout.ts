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

/** Keep in sync with `--d-rail-w`, `--d-rail-island`, `--d-gap` in styles/d-tokens.css. */
const RAIL_WIDTH: Record<NavLayout, number> = { tabs: 0, rail: 50, island: 60 };
const CANVAS_GAP = 12;

/** Horizontal space the shell chrome takes before the sidebar/main/work-panel columns. */
export function shellChromeWidth(layout: NavLayout): number {
  return RAIL_WIDTH[layout] + CANVAS_GAP * 2;
}
