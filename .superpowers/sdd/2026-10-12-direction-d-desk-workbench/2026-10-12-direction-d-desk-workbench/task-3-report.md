# Task 3 Report: Apply `data-nav-layout`, nav-aware column budget, capture hook

## Status
DONE

## Commit
`f6eddb8c6` — feat(renderer): apply navLayout attribute and layout-aware column budget

## Files Changed
- `apps/desktop/src/features/app/useAppShellRuntime.tsx` — import `resolveNavLayout`/`shellChromeWidth`; add `navLayout`+`navLayoutRef`; replace `SHELL_CHROME_WIDTH` usage; `useLayoutEffect` deps → `[navLayout]`; new attribute effect after fontScale effect
- `apps/desktop/src/main.tsx` — import `DEFAULT_NAV_LAYOUT`, set `dataset.navLayout = DEFAULT_NAV_LAYOUT` at line 17 (beside `dataset.theme = 'dark'`)
- `apps/desktop/src/capture/renderer-api.ts` — add `NavLayout` import, `setNavLayout` to `RendererApi` type, and implementation in `surface` object

## Steps completed

### Step 1 — navLayout vars + columnsWidth
- Replaced `const SHELL_CHROME_WIDTH = 60 + 16` (deleted)
- Added `import { resolveNavLayout, shellChromeWidth } from "../../lib/nav-layout"` at import block
- Added after `settings` selector (line 61-63):
  ```ts
  const navLayout = resolveNavLayout(settings?.navLayout);
  const navLayoutRef = useRef(navLayout);
  navLayoutRef.current = navLayout;
  ```
- `columnsWidth` now uses `shellChromeWidth(navLayoutRef.current)`

### Step 2 — useLayoutEffect deps + attribute effect
- `useLayoutEffect` at line 106 now depends on `[navLayout]` (was `[]`)
- New `useEffect` inserted after the fontScale effect:
  ```ts
  useEffect(() => {
    document.documentElement.dataset.navLayout = navLayout;
  }, [navLayout]);
  ```
  Placed separately from the theme effect so plugin-theme changes cannot skip it.

### Step 3 — main.tsx boot attribute
- `document.documentElement.dataset.navLayout = DEFAULT_NAV_LAYOUT` added at line 17, beside `dataset.theme = 'dark'`, so first paint has `data-nav-layout="rail"` before React mounts.

### Step 4 — renderer-api.ts setNavLayout
- `setNavLayout: (layout: NavLayout) => void` added to `RendererApi` type next to `setThemeAttr`
- Implementation added to `surface` object:
  ```ts
  setNavLayout: (layout) => {
    document.documentElement.dataset.navLayout = layout;
  },
  ```
- No `CaptureRigStubs` entry needed (it is not in `CAPTURE_RIG_METHODS`; that array only lists rig fixture methods, not direct DOM setters)

### Step 5 — Smoke verification
**Build:** `pnpm build` completed successfully (32.78s, no errors).

**Capture rig:** Attempted `PI_DESKTOP_CAPTURE=1 PI_DESKTOP_DATA_DIR=$(mktemp -d) ELECTRON_RENDERER_URL= ./node_modules/.bin/electron .` — app exited early with `HOST_UNAVAILABLE` (host-core binary not compiled). PNGs were not written.

**Fallback verification (bundle grep, no jsdom):**  
Grepped the minified renderer bundle `out/renderer/assets/index-*.js`:

```
navLayout=hO      ← main.tsx boot-time assignment
hO="rail"         ← DEFAULT_NAV_LAYOUT minified constant
navLayout=y},[y]) ← useEffect setting dataset.navLayout, dep [navLayout]
navLayout=s       ← renderer-api setNavLayout(layout) setting dataset
```

`hO` is the minified identifier for `DEFAULT_NAV_LAYOUT`; its value is the literal string `"rail"`. The first JS evaluated on boot sets `document.documentElement.dataset.navLayout = "rail"` before React renders — confirming the Step 5 requirement.

### tsc
`tsc --noEmit -p .` output: 1 error (pre-existing `baseUrl` deprecation TS5101). 0 new errors introduced.

### Tests
**Suite:** `node --test test/*.test.mjs` — 3578 pass, 12 fail.  
All 12 failures are pre-existing and unrelated to Task 3:
- codesign shim timeout tests (20s)
- npm/node version tool tests (timeout)
- ssh password/credential tests (timeout, npm unavailable)
- renderer preload channel tests (pre-existing from earlier tasks)
- `text on an accent fill is light and legible` (Task 1 accent test)

No new test failures introduced.

## Self-review / concerns
- **`navLayout` not in return value:** Confirmed absent — Task 9 switched to CSS-only; the value is only used internally to drive `document.documentElement.dataset.navLayout` and `shellChromeWidth`.
- **useLayoutEffect deps:** Changing `[]` → `[navLayout]` means ResizeObserver is re-registered on every layout switch. This is correct and intentional — a layout switch changes `shellChromeWidth`, so `columnsWidth` must be recomputed against the new budget. The observer reconnects to the same shell element; no leak risk.
- **navLayoutRef pattern:** The ref is initialized on first render and kept current (`navLayoutRef.current = navLayout`) on every render, so `columnsWidth` callbacks always see the latest layout without stale closure.
- **Capture rig could not produce PNGs** due to missing host-core binary. Bundle analysis confirms `"rail"` is the boot value. Report marked accordingly.

## Deviations
None. All file locations matched reality.
