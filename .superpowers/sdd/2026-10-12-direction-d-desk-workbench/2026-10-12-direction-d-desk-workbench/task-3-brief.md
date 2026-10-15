### Task 3: Apply `data-nav-layout`, nav-aware column budget, capture hook

**Files:**
- Modify: `apps/desktop/src/features/app/useAppShellRuntime.tsx:45` (delete `SHELL_CHROME_WIDTH`), `:102-116` (budget + observer deps), add effect near `:525`
- Modify: `apps/desktop/src/main.tsx:14-15` (initial attribute)
- Modify: `apps/desktop/src/capture/renderer-api.ts:29` and `:100-102` (`setNavLayout`)
- Test: none new (pure logic covered in Task 2). Smoke by capture.

**Interfaces:**
- Consumes: `resolveNavLayout`, `shellChromeWidth` (Task 2); `settings` store selector at `useAppShellRuntime.tsx:61`.
- Produces: `document.documentElement.dataset.navLayout` ∈ `tabs|rail|island`; capture API `setNavLayout(layout)`.

- [ ] **Step 1:** In `useAppShellRuntime.tsx` replace the const at line 44-45 with an import and compute:

```ts
import { resolveNavLayout, shellChromeWidth } from "../../lib/nav-layout";
```
```ts
  const navLayout = resolveNavLayout(settings?.navLayout);
  const navLayoutRef = useRef(navLayout);
  navLayoutRef.current = navLayout;
```
and in `columnsWidth`:

```ts
  const columnsWidth = (shell: HTMLElement) =>
    Math.max(0, Math.round(shell.clientWidth) - shellChromeWidth(navLayoutRef.current));
```
Change the `useLayoutEffect(..., [])` at 104-116 to depend on `[navLayout]` so a live switch re-measures.

- [ ] **Step 2:** Add the attribute effect (separate from the theme effect so a plugin-theme change cannot skip it):

```ts
  useEffect(() => {
    document.documentElement.dataset.navLayout = navLayout;
  }, [navLayout]);
```

- [ ] **Step 3:** `main.tsx` beside `dataset.theme = 'dark'` add `document.documentElement.dataset.navLayout = DEFAULT_NAV_LAYOUT;` (import from `./lib/nav-layout`) so first paint has a valid layout.

- [ ] **Step 4:** `renderer-api.ts`: add `setNavLayout: (layout: NavLayout) => void;` to the type next to `setThemeAttr` and

```ts
    setNavLayout: (layout) => {
      document.documentElement.dataset.navLayout = layout;
    },
```
If `CaptureRigStubs` requires an entry, mirror `setThemeAttr` there.

- [ ] **Step 5:** `tsc` (3 baseline errors only). Run capture rig, then in DevTools console `document.documentElement.dataset.navLayout` is `rail`; set `navLayout:"island"` via Settings IPC later in Task 4 and confirm the shell width budget changes (the work-panel auto-collapse threshold moves by 10px: 74→84).
- [ ] **Step 6: Commit** `feat(renderer): apply navLayout attribute and layout-aware column budget`

---

