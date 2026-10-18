export const NAV_LAYOUTS = ["tabs", "rail", "island"] as const;
export type NavLayout = (typeof NAV_LAYOUTS)[number];
export const DEFAULT_NAV_LAYOUT: NavLayout = "rail";

export function isNavLayout(value: unknown): value is NavLayout {
  return typeof value === "string" && (NAV_LAYOUTS as readonly string[]).includes(value);
}
