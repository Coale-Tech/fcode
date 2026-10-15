### Task 11: WorkPanel, Build and Bench

**Files:** `features/work-panel/*`, `pages/BuildPage.tsx`, `pages/BenchPage.tsx`; styles `work-panel.css`, `workbench.css`.
**Test:** `bench-page-*.test.mjs`, `t10-build-precondition.test.mjs`, `canvas-ownership.test.mjs`, capture.

- [ ] **Step 1:** WorkPanel: panel surface = canvas island (`--d-r`, 1px border); tab strip 32px (`--d-mini-h`); width 300–340 (Task 10 default).
- [ ] **Step 2:** Bench: three columns 224px | flex | 252px inside one canvas; panels `--d-r`; list rows `--d-row-h`; mini-headers `--d-mini-h`; status strip `--d-status-h` / `--d-text-xs`. Build: left app list + status inside `.context-sidebar`, canvas gap `--d-gap`; **the Build canvas `WebContentsView` host `div` keeps its rect reporting untouched.** Spec: `pages-d/{bench,build}/notes.md`.
- [ ] **Step 3: Verify** bounds in all layouts: open Build, switch layout, resize window and toggle the work panel; the native view tracks its host div (log `view.getBounds()` vs host rect, tolerance 1px).
- [ ] **Step 4: Commit** `style(workbench): direction D work panel, build, bench`

---

