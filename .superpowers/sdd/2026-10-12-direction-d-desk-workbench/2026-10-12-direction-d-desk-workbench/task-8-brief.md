### Task 8: `tabs` layout (D1)

**Files:**
- Create: `apps/desktop/src/components/NavTabs.tsx` (replaces the Task 6 stub)
- Modify: `apps/desktop/src/features/app/AppShell.tsx:149` (render `<NavRail/>` only when layout ≠ `tabs`)
- Modify: `apps/desktop/src/styles/d-shell.css` (tab pills, hide rail under `data-nav-layout="tabs"`)
- Test: `test/nav-items.test.mjs` (extend), capture, e2e

**Interfaces:** Consumes `navItems`, `useAppStore` `page`/`setPage`/`navBack`, `NotificationCenter`, Settings button. Produces `<NavTabs/>` with `role="tablist"`.

- [ ] **Step 1: Extend the test** — add a settings-keeps-working assertion is UI-only, so instead assert the shared list has no duplicate `page`:

```js
test("each destination maps to a distinct page", () => {
  const pages = navItems({ kanban: true, raven: true }).map((i) => i.page);
  assert.equal(new Set(pages).size, pages.length);
});
```
Run (PASS already; it pins the list the tabs depend on).
- [ ] **Step 2: Implement**

```tsx
// apps/desktop/src/components/NavTabs.tsx
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import { navItems } from "./nav-items";
import { NAV_ICONS } from "./NavRail";
import { cx } from "./ui";

export function NavTabs() {
  const { t } = useTranslation();
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const kanban = useAppStore((s) => s.kanbanEnabled);
  const raven = useAppStore((s) => s.ravenEnabled);
  return (
    <nav className="nav-tabs" role="tablist" aria-label="Primary">
      {navItems({ kanban, raven }).map((item) => {
        const Icon = NAV_ICONS[item.id];
        const label = t(item.labelKey);
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={page === item.page}
            data-nav={item.dataNav}
            title={label}
            className={cx("nav-tab", page === item.page && "active")}
            onClick={() => setPage(item.page)}
          >
            <Icon size={14} aria-hidden />
            <span className="nav-tab-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
```
Export `NAV_ICONS` from `NavRail.tsx` (Task 7 defined it local). Notifications and Settings are rendered at the right end of the navbar by `ShellNavbar` in `tabs` layout (`<NotificationCenter/>` + Settings `TooltipButton`, same props as in NavRail) — add them to `ShellNavbar`'s `.shell-navbar-end` when `layout === "tabs"` (in other layouts they live in the rail footer).
- [ ] **Step 3: CSS**

```css
.nav-tabs { display: flex; gap: 2px; min-width: 0; overflow: hidden; }
.nav-tab {
  display: inline-flex; align-items: center; gap: 6px; height: var(--d-ctrl);
  padding: 0 10px; border-radius: var(--d-r-ctrl);
  color: var(--ds-text-secondary); font-size: var(--d-text); white-space: nowrap;
}
.nav-tab:hover { background: var(--ds-bg-hover); }
.nav-tab.active { background: color-mix(in oklab, var(--ds-accent) 14%, transparent); color: var(--ds-accent); }
.nav-tab-label { overflow: hidden; text-overflow: ellipsis; max-width: 12ch; }
:root[data-nav-layout="tabs"] .app-chat-shell > .nav-rail { display: none; }
@media (max-width: 1100px) { .nav-tab-label { display: none; } }
```
- [ ] **Step 4: Verify** with `de`/`tr` locales (Review Focus 7): no wrap, awesomebar stays centred. Switch layouts live from Settings while a chat has draft text and a streaming turn: draft and scroll preserved (Review Focus 8). e2e 28/28.
- [ ] **Step 5: Commit** `feat(shell): tabs layout`

---

