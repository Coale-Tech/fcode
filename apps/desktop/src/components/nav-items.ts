import type { AppState } from "../stores/app-store";

export type NavItemId =
  | "chat" | "build" | "bench"
  | "scheduled" | "kanban" | "raven" | "filebird"
  | "plugins" | "pulls";

export type NavItem = {
  id: NavItemId;
  page: AppState["page"];
  dataNav: string;      // existing e2e selectors: "chat", "build-canvas", "bench", …
  labelKey: string;
  /** Rail scroll-group membership.
   *  primary   = top of scroll (chat/build/bench)
   *  utility   = middle group (scheduled/kanban/raven/filebird)
   *  developer = bottom group (plugins/pulls)
   *  D2-shell.html:116-163 — all three groups go in the upper scroll area with dividers.
   *  Footer (non-page-destination) items are hand-rendered in NavRail footer. */
  group: "primary" | "utility" | "developer";
};

/**
 * Ordered nav item list.  Flag-gated destinations (kanban, raven) are only
 * included when the corresponding feature flag is enabled.
 *
 * Order per D2-shell.html:116-163:
 *   primary:   chat / build / bench
 *   utility:   scheduled / [kanban] / [raven] / filebird
 *   developer: plugins / pulls
 */
export function navItems(flags: { kanban: boolean; raven: boolean }): NavItem[] {
  const items: NavItem[] = [
    { id: "chat",      page: "chat",      dataNav: "chat",         labelKey: "nav.chat",        group: "primary"   },
    { id: "build",     page: "build",     dataNav: "build-canvas", labelKey: "nav.build",       group: "primary"   },
    { id: "bench",     page: "bench",     dataNav: "bench",        labelKey: "nav.bench",       group: "primary"   },
    { id: "scheduled", page: "scheduled", dataNav: "scheduled",    labelKey: "scheduled.title", group: "utility"   },
  ];
  if (flags.kanban) items.push({ id: "kanban",   page: "kanban",   dataNav: "kanban",   labelKey: "kanban.title",   group: "utility"   });
  if (flags.raven)  items.push({ id: "raven",    page: "raven",    dataNav: "raven",    labelKey: "raven.title",    group: "utility"   });
  items.push(       { id: "filebird",  page: "filebird",  dataNav: "filebird", labelKey: "fileBird.title", group: "utility"   });
  items.push(       { id: "plugins",   page: "plugins",   dataNav: "plugins",  labelKey: "nav.plugins",    group: "developer" });
  items.push(       { id: "pulls",     page: "pulls",     dataNav: "pulls",    labelKey: "pulls.title",    group: "developer" });
  return items;
}
