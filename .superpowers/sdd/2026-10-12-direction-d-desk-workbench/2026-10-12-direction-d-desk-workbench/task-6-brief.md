### Task 6: Shell frame — `ShellNavbar`, awesomebar, drag/traffic-light/window-controls, status bar

**Files:**
- Create: `apps/desktop/src/components/ShellNavbar.tsx`, `apps/desktop/src/styles/d-shell.css` (add `@import "./d-shell.css";` after `./chrome.css` in `globals.css`)
- Modify: `apps/desktop/src/features/app/AppShell.tsx:143-149` (render navbar above `.app-chat-shell`; shell root becomes a column), `:360-368` (WindowControls placement)
- Modify: `apps/desktop/src/styles/chrome.css:706-736` (delete the traffic-light lead-inset reserve that the navbar now owns), `:1237-1273` (`.main-titlebar` height → `--d-ph-h`)
- Modify: `packages/shared/src/window-chrome.ts:18` only if Step 5 shows the lights are off-centre (y 16→18)
- Modify: `apps/desktop/src/styles/workbench.css` or `chat-shell.css` (`WorkspaceBar` height → `--d-status-h`)
- Test: `test/topbar-consistency.test.mjs`, `test/app-store-sidebar.test.mjs`, capture + e2e

**Interfaces:**
- Consumes: `useAppStore` `page`/`settings`, `setSearchOpen` (AppShell prop), `resolveNavLayout`, `WindowControls`.
- Produces: `<ShellNavbar onOpenSearch />`; `.shell-navbar[data-nav-layout]`; `<NavTabs/>` slot (Task 8) and a breadcrumb for rail/island.

Structure after this task:

```
.app-shell                         (flex column)
  <ShellNavbar/>                   48px, drag region
  .app-chat-shell                  (flex row, flex:1, min-height:0)   ← existing body
```

- [ ] **Step 1: Pre-read** `AppShell.tsx:360-401` (WindowControls/Toasts) and `chrome.css:700-760,1230-1280` to list every rule that reads `--ds-window-lead-inset`, `--ds-pane-lead-inset`, `--ct-lead-inset`, `.window-chrome-row`. Output of `grep -rn "lead-inset\|window-chrome-row" apps/desktop/src` goes in the commit body.
- [ ] **Step 2: Component** (breadcrumb/tab slot filled in Task 8):

```tsx
// apps/desktop/src/components/ShellNavbar.tsx
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { resolveNavLayout } from "../lib/nav-layout";
import { IconSearch } from "./icons";
import { NavTabs } from "./NavTabs";

export function ShellNavbar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { t } = useTranslation();
  const layout = resolveNavLayout(useAppStore((s) => s.settings?.navLayout));
  const isMac = (window.piDesktop?.platform ?? "darwin") === "darwin";
  return (
    <header className="shell-navbar drag" data-nav-layout={layout}>
      <div className="shell-navbar-lead" aria-hidden />
      <div className="shell-navbar-start no-drag">
        {layout === "tabs" ? <NavTabs /> : <span className="shell-navbar-brand">{t("app.shellName")}</span>}
      </div>
      <button
        type="button"
        className="shell-awesomebar no-drag"
        data-nav="awesomebar"
        aria-label={t("nav.search")}
        onClick={onOpenSearch}
      >
        <IconSearch size={14} aria-hidden />
        <span className="shell-awesomebar-label">{t("nav.search")}</span>
        <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <div className="shell-navbar-end" aria-hidden />
    </header>
  );
}
```
(A stub `NavTabs` that returns `null` is created in this task so it compiles; Task 8 gives it content. It is not shipped half-done: the `tabs` layout is only selectable via the picker, and Task 8 lands before the release branch merge — the Task 6 commit message says so.)

- [ ] **Step 3: CSS** `d-shell.css`:

```css
.app-shell { display: flex; flex-direction: column; }
.shell-navbar {
  display: grid; grid-template-columns: 1fr minmax(240px, 480px) 1fr; align-items: center;
  height: var(--d-navbar-h); flex: 0 0 var(--d-navbar-h);
  padding: 0 var(--d-gap); gap: 8px;
  background: var(--surface-elevation-1);
  border-bottom: 1px solid var(--d-border, var(--ds-border-default));
  position: relative; z-index: 30;
}
:root[data-platform="darwin"] .shell-navbar { padding-left: 78px; }           /* traffic lights */
:root[data-platform="darwin"][data-fullscreen="true"] .shell-navbar { padding-left: var(--d-gap); }
:root:not([data-platform="darwin"]) .shell-navbar { padding-right: 124px; }    /* WindowControls */
.shell-navbar-start { display: flex; align-items: center; gap: 6px; min-width: 0; }
.shell-navbar-brand { font-weight: 600; font-size: var(--d-text); }
.shell-awesomebar {
  display: flex; align-items: center; gap: 8px;
  height: var(--d-ctrl-lg); padding: 0 10px;
  color: var(--ds-text-tertiary); background: var(--ds-bg-hover);
  border: 1px solid var(--ds-border-default); border-radius: var(--d-r-ctrl);
  font-size: var(--d-text); text-align: left; min-width: 0;
}
.shell-awesomebar:hover { border-color: var(--ds-text-tertiary); }
.shell-awesomebar:focus-visible { outline: var(--focus-outline-default); outline-offset: 2px; }
.shell-awesomebar-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shell-awesomebar kbd { font: inherit; font-size: var(--d-text-xs); color: var(--ds-text-tertiary); }
```
(`--surface-elevation-1`, `--ds-bg-hover` etc. are looked up with `grep` first; substitute the nearest existing token.)

- [ ] **Step 4: AppShell.** Render `<ShellNavbar onOpenSearch={() => setSearchOpen(true)} />` as the first child of `.app-shell` content, outside `PortalVisibilityProvider`'s `hidden`/`inert` wrapper (Review Focus 4: the navbar stays usable in settings so the user can leave it by Cmd-K and can see the window controls). Verify `.app-chat-shell` gets `flex: 1; min-height: 0`.
- [ ] **Step 5: Delete the lead-inset logic** found in Step 1 (clean cutover). `.conversation-topbar` and `.main-titlebar` keep their 48px (`--ds-toolbar-height` already 48 via Task 1) but no longer reserve traffic-light space.
- [ ] **Step 6: Verify (macOS, real window).** Launch non-capture: traffic lights centred in the 48px band, drag works on empty navbar, awesomebar click opens `SearchDialog`, Cmd-K still works. Capture-rig all pages: no page content under the navbar. If lights are off-centre, set `MAC_TRAFFIC_LIGHT_POSITION.y` to 18 and re-check. Windows/Linux: not runnable here — **report as unverified**; CSS reserves 124px.
- [ ] **Step 7:** `node --test test/*.test.mjs` (baseline) + `pnpm test:e2e` (28/28).
- [ ] **Step 8: Commit** `feat(shell): direction D navbar + awesomebar`

---

