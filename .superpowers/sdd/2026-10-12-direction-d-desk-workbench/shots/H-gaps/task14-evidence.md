# Task 14 — H-Gaps Runtime Evidence

Branch: `feat/direction-d-t14h-gaps`  
Worktree: `direction-d-t14h-gaps`  
Measured: 2026-10-17 (CDP against built `apps/desktop/out/renderer/index.html`)

---

## Evidence Table

| # | Measurement | Method | Result |
|---|-------------|--------|--------|
| 1 | Sidebar drag → max | PointerEvent drag from handle x=302 to x=600 (550px target from aside left) | `aside.offsetWidth = 520px` — clamped by `clampSidebarWidth` (JS) + `max-width: 520px` (CSS) |
| 2 | Sidebar drag → below min | PointerEvent drag from x=566 to x=100 (50px from aside left, far below 240 min) | `aside.offsetWidth = 0px` — sidebar **collapsed** (collapse threshold triggered, not clamped) |
| 3 | WorkPanel usable-width delta (rail → island) | `shellChromeWidth` read from DOM after `setNavLayout()` in 1200px window | Rail: `1200 − 74 = 1126px`; Island: `1200 − 84 = 1116px`; **Δ = 10px** |
| 4 | navLayout persists across `location.reload()` | CDP `Page.reload` after `pi-desktop/settings/set { navLayout: "island" }` | Before: `data-nav-layout="rail"` → After: `data-nav-layout="island"` ✅ |
| 5 | navLayout persists across cold restart | Kill Electron PID, relaunch with same `PI_DESKTOP_DATA_DIR`, CDP connect | `data-nav-layout="island"` on first render ✅ |

---

## Raw CDP Measurements

### M1 — Sidebar max-width clamp
```
Pointer drag: startX=302 → targetX=600 (asideLeft=50, so 550px from edge)
CSS max-width:  520px (getComputedStyle(aside).maxWidth)
JS clamp max:   520px (SIDEBAR_WIDTH_MAX constant)
Result:         aside.offsetWidth = 520px  ← exactly at JS+CSS cap
flexBasis set:  520px (reflects JS resize store update)
```

### M2 — Sidebar collapse (below threshold)
```
Pointer drag: startX=566 → targetX=100 (50px from asideLeft=50)
CSS min-width:  none (0px — no CSS floor)
JS clamp min:   240px (SIDEBAR_WIDTH_MIN)
Collapse:       aside.offsetWidth = 0px (sidebar hidden — drag crossed collapse threshold)
Note: JS collapse fires before the 240px clamp when drag drops ~160px below sidebar start
```

### M3 — Rail vs Island usable width
```
Window innerWidth:  1200px
Rail   chrome:  74px  (NavRail 50px + 2×canvas-gap 24px)
Island chrome:  84px  (NavRail 60px + 2×canvas-gap 24px)
Rail   usable:  1200 − 74  = 1126px
Island usable:  1200 − 84  = 1116px
Delta:          10px fewer usable pixels in island vs rail  ← matches R11h spec
```

### M4 — Reload persistence
```
t=0  pi-desktop/settings/set { navLayout: "island" }  → { ok: true }
t=0  data-nav-layout = "rail"  (store not yet updated in running renderer)
     CDP Page.reload()
t=4s data-nav-layout = "island"  ← renderer read navLayout from persisted settings on init
t=7s data-nav-layout = "island"  ← stable after additional wait
```

### M5 — Cold restart persistence
```
App: PID 54818, data dir /tmp/pi-persist-K6ff7s, navLayout=island in settings
kill 54818
Relaunch: same data dir, port 57920, new PID 56361
Wait 40s for main renderer to appear
CDP connect: data-nav-layout = "island"  ✅
IPC verify:  pi-desktop/settings/get → navLayout: "island"  ✅
```

---

## Sidebar Width localStorage Persistence
```
Key: pi.desktop.sidebarWidth
Value after drag-to-max: 520  (integer, not px string)
Confirms: sidebar width is persisted to localStorage after each resize
```

---

## Test Results (post-fix)

All 16 test files: **173 pass, 0 fail** (10.86s)  
i18n: **27/27 pass**  
tsc: 0 errors
