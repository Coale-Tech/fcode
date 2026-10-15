### Task 9: `island` layout (D3) — labelled rail + global sessions island

**Files:**
- Modify: none in `AppShell.tsx` (see Step 1)
- Modify: `apps/desktop/src/styles/d-shell.css`, `sidebar-threads.css` (island sidebar surface)
- Test: capture, e2e (rule-level behaviour is covered by `shellChromeWidth` in `test/nav-layout.test.mjs`)

**Interfaces:** Consumes `Sidebar` props unchanged and `shellChromeWidth("island") = 84` (Task 3).

- [ ] **Step 1:** No `AppShell.tsx` sidebar change: the existing `!workbench && (!sidebarCollapsed || sidebarExiting)` condition already matches decision 2 (global sessions sidebar everywhere except Bench/Build). The island layout only re-skins it.
- [ ] **Step 2: CSS (island only)**

```css
:root[data-nav-layout="island"] .nav-rail { width: var(--d-rail-island); }
:root[data-nav-layout="island"] .nav-rail-label { display: block; font-size: var(--d-text-xs); }
:root[data-nav-layout="island"] .sidebar {
  margin: 0 0 var(--d-gap) 0; border-radius: var(--d-r);
  background: var(--ds-bg-primary); border: 1px solid var(--ds-border-default);
}
```
(Selector `.sidebar` is the real root of `Sidebar.tsx` — confirm with `grep -n "className=" apps/desktop/src/components/Sidebar.tsx | head`; use the actual root class.)
- [ ] **Step 3: Verify** `sidebarCollapsed` toggle + auto-collapse when the work panel would breach the 450px floor (open WorkPanel at 1280px window in `island`; sidebar collapses, main ≥ 450). Kanban board scrolls horizontally at the narrower canvas width (design note). Build/Bench show no global sidebar (decision 2).
- [ ] **Step 4:** Commit `feat(shell): island layout`

---

