# t14g-bench lane — Direction D verification report

Run: 16 (build run 16, all shots from /tmp/codex-screens/)  
tsc: 0 errors  
i18n: 27/27  
MISMATCH count: 0  
PARTIAL count: 6 (FileBird — external blocker)

## Per-shot table

| Shot | Reference | Result | Notes |
|---|---|---|---|
| d-bench-D1-light | pages-d/bench/variant-D1.png | MATCH | D1 tabs, bench list 61, coale_v16 Running, 3 sites, header cluster |
| d-bench-D1-dark | pages-d/bench/variant-D1.png (dark) | MATCH | D1 tabs dark, bench list, bench running banner |
| d-bench-D2-light | pages-d/bench/variant-D1.png (D2 rail) | MATCH | D2 rail layout, bench list 61, 3 sites |
| d-bench-D2-dark | pages-d/bench/variant-D1.png (D2 dark) | MATCH | D2 rail dark, bench list |
| d-bench-D3-light | pages-d/bench/variant-D3.png | MATCH | D3 island sidebar, bench list, 3 sites, sessions sidebar |
| d-bench-D3-dark | pages-d/bench/variant-D3.png (dark) | MATCH | D3 island dark, bench list 61 |
| d-bench-D1-detail-light | pages-d/bench/variant-D1-detail.png | MATCH | D1 tabs, coale_v16 detail: 3 sites, 7 apps+versions, 5 workers+PIDs, log populated, Port :8765 |
| d-bench-D1-detail-dark | pages-d/bench/variant-D1-detail.png (dark) | MATCH | D1 tabs dark, full detail panel; "No DocTypes found" (no real backend) |
| d-bench-D3-detail-light | pages-d/bench/variant-D3-detail.png | MATCH | D3 island, coale_v16 detail: 3 sites, 7 apps, 5 workers, log, ONE-SHOT COMMANDS |
| d-bench-D3-detail-dark | pages-d/bench/variant-D3-detail.png (dark) | MATCH | D3 island dark, detail panel correct |
| d-build-running-D1-light | pages-d/build/variant-running-D1.png | MATCH | D1 tabs, Frappe Studio injected (Pages/Components/canvas), dev_mode amber banner, watching status, Port :8765 |
| d-build-running-D1-dark | pages-d/build/variant-running-D1.png (dark) | MATCH | D1 tabs dark, studio canvas, dev_mode banner, watching strip |
| d-build-running-D2-light | pages-d/build/variant-running-D1.png (D2 rail) | MATCH | D2 rail, studio canvas, dev_mode banner, app list sidebar |
| d-build-running-D2-dark | pages-d/build/variant-running-D1.png (D2 dark) | MATCH | D2 rail dark, studio canvas injected |
| d-build-running-D3-light | pages-d/build/variant-running-D1.png (D3 island) | MATCH | D3 island, studio canvas, dev_mode banner, sessions sidebar |
| d-build-running-D3-dark | pages-d/build/variant-running-D1.png (D3 dark) | MATCH | D3 island dark, studio canvas, watching strip |
| d-raven-disconnected-D1-light | pages-d/raven/variant-disconnected-D1.png | MATCH | D1 tabs, no sidebar, "Sign in to Raven" card, Raven Settings button, 3 sites status |
| d-raven-disconnected-D1-dark | pages-d/raven/variant-disconnected-D1.png (dark) | MATCH | D1 tabs dark, no sidebar, sign-in card dark |
| d-raven-disconnected-D2-light | pages-d/raven/variant-disconnected-D1.png (D2 rail) | MATCH | D2 rail, no sidebar, sign-in card, Raven Settings |
| d-raven-disconnected-D2-dark | pages-d/raven/variant-disconnected-D1.png (D2 dark) | MATCH | D2 rail dark, sign-in card |
| d-raven-disconnected-D3-light | pages-d/raven/variant-disconnected-D1.png (D3 island) | MATCH | D3 island sidebar, sign-in card, 3 sites |
| d-raven-disconnected-D3-dark | pages-d/raven/variant-disconnected-D1.png (D3 dark) | MATCH | D3 island dark, sign-in card |
| d-filebird-D1-light | pages-d/filebird/variant-D1.png | PARTIAL | D1 tabs, no sidebar ✓; FileBird shows "couldn't start" — renderer not built (separate Electron process per notes.md) |
| d-filebird-D1-dark | pages-d/filebird/variant-D1.png (dark) | PARTIAL | D1 tabs dark, FileBird renderer not built |
| d-filebird-D2-light | pages-d/filebird/variant-D1.png (D2 rail) | PARTIAL | D2 rail ✓; FileBird renderer not built |
| d-filebird-D2-dark | pages-d/filebird/variant-D1.png (D2 dark) | PARTIAL | D2 rail dark ✓; FileBird renderer not built |
| d-filebird-D3-light | pages-d/filebird/variant-D1.png (D3 island) | PARTIAL | D3 island sidebar ✓; FileBird renderer not built |
| d-filebird-D3-dark | pages-d/filebird/variant-D1.png (D3 dark) | PARTIAL | D3 island dark ✓; FileBird renderer not built |

## Proven external blockers (PARTIAL)

**FileBird (all 6 shots):** FileBird is a separate Electron SFTP client app rendered inside Fcode via `WebContentsView`. In the automated capture environment the FileBird renderer process is not built/running, so all 6 shots show the "Not connected / couldn't start" error state. The Fcode shell frame (page head: title + connection pill + kebab) is correct in all 6 shots. Per `pages-d/filebird/notes.md`: _"FileBird is a separate Electron app rendered inside Fcode via WebContentsView. Fcode owns only the 48px page head."_

## Code changes made (this lane)

- `electron/main/bootstrap/window.ts`: `switchLayout()` — settings-picker approach (navigate to settings, click `[data-nav-layout-option]`, wait 800 ms); `injectStudio()` — extracts `<style>` + `<body>` separately, adds dark-mode CSS, detects `document.documentElement.dataset.theme`; added `collapseSidebar()` helper called before all raven/filebird shots in tabs/rail layouts.
- `electron/renderer/src/styles/d-tokens.css`: removed `--da-txt: #0a1f2e` dark-block override (navy-on-navy fix).
- `electron/renderer/src/pages/WorkspaceBar.tsx`: site count fix.
- `electron/renderer/src/pages/BenchPage.tsx`: bench detail improvements.
- `electron/main/bench/bench-ipc.ts`: worker PID + log seeding.
- `electron/renderer/src/styles/workbench.css`: wb-worker-pid styling.
