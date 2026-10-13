import type { AppState } from "../stores/app-store";

export type NavItemId =
  | "chat" | "build" | "bench" | "scheduled" | "kanban" | "raven" | "filebird" | "plugins";

export type NavItem = {
  id: NavItemId;
  page: AppState["page"];
  dataNav: string;      // existing e2e selectors: "chat", "build-canvas", "bench", …
  labelKey: string;
  group: "primary" | "footer";
};

/**
 * Ordered nav item list.  Flag-gated destinations (kanban, raven) are only
 * included when the corresponding feature flag is enabled.
 *
 * Order: primary chat/build/bench, then footer scheduled/(kanban)/(raven)/filebird/plugins.
 */
export function navItems(flags: { kanban: boolean; raven: boolean }): NavItem[] {
  const items: NavItem[] = [
    { id: "chat",      page: "chat",      dataNav: "chat",         labelKey: "nav.chat",        group: "primary" },
    { id: "build",     page: "build",     dataNav: "build-canvas", labelKey: "nav.build",       group: "primary" },
    { id: "bench",     page: "bench",     dataNav: "bench",        labelKey: "nav.bench",       group: "primary" },
    { id: "scheduled", page: "scheduled", dataNav: "scheduled",    labelKey: "scheduled.title", group: "footer"  },
  ];
  if (flags.kanban) items.push({ id: "kanban",   page: "kanban",   dataNav: "kanban",   labelKey: "kanban.title",   group: "footer" });
  if (flags.raven)  items.push({ id: "raven",    page: "raven",    dataNav: "raven",    labelKey: "raven.title",    group: "footer" });
  items.push(       { id: "filebird",  page: "filebird",  dataNav: "filebird", labelKey: "fileBird.title", group: "footer" });
  items.push(       { id: "plugins",   page: "plugins",   dataNav: "plugins",  labelKey: "nav.plugins",    group: "footer" });
  return items;
}
