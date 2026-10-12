import {
  isNavLayout,
  DEFAULT_NAV_LAYOUT,
  type NavLayout,
} from "@pi-desktop/shared";

export function resolveNavLayout(value: unknown): NavLayout {
  return isNavLayout(value) ? value : DEFAULT_NAV_LAYOUT;
}

/** Keep in sync with `--d-rail-w`, `--d-rail-island`, `--d-gap` in styles/d-tokens.css. */
const RAIL_WIDTH: Record<NavLayout, number> = { tabs: 0, rail: 50, island: 60 };
const CANVAS_GAP = 12;

/** Horizontal space the shell chrome takes before the sidebar/main/work-panel columns. */
export function shellChromeWidth(layout: NavLayout): number {
  return RAIL_WIDTH[layout] + CANVAS_GAP * 2;
}
