### Coverage

**Checkpoint 13 — frozen f3ed6247c7c55d5bbcdfe892bc758e0cf50b48ee, including f7f224a6a.** Re-audit of T7-F01–F13 against committed source, WS/task-7-report.md and the requested T7r2 artifacts. Uncommitted changes and external lane branches are excluded.

**R14 scope:** this supervisor covers integration / Tasks 6–9. Tasks 10–13 now have parallel, isolated implementer/reviewer/supervisor lanes; the former R4 sequential-only restriction is superseded. Their code/acceptance is not certified by this checkpoint. Final integration checks and embedded bounds re-verification remain required after lane merges.

**Paths:** WS=.superpowers/sdd/2026-10-12-direction-d-desk-workbench/. Source anchors are relative to apps/desktop/ unless packages/ is explicit. R=/Users/mac/.gstack/projects/Coale-Tech-fcode/designs/all-pages-20261012/; design anchors use R/kit-d/. Frozen source was exported to /tmp/cp13-f3ed6247c for reads and the cheap targeted run.

|Task|Status (DONE / PARTIAL / MISSING / PENDING)|Evidence or gap (file:line)|
|---|---|---|
|1–5 — Foundation|DONE|Previously independent coverage retained; progress.md:69–71 accepts the foundation with explicit Task 14 carries. No fresh whole-foundation sign-off.|
|6 — Navbar/window/status|DONE|Prior accepted scope retained, progress.md:72–74; saved-theme evidence carry still open.|
|7 — Rail/shared destinations|PARTIAL|Four scoped findings CLOSED, nine OPEN. The toggle, grouping, surface and key migrations are substantial real fixes; remaining source/policy/evidence defects prevent acceptance.|
|8 — Tabs/shared navbar actions|PENDING|Frozen NavTabs remains the Task 6 stub. Pull Requests belongs in the overflow menu, not a fourth primary pill; details below.|
|9 — Island|PENDING|D3 must show Pull Requests after Plugins in the upper developer group, with compact PRs label; footer is only Inbox/Settings and has NO D2 expand toggle.|
|10–13 — Isolated lanes|PENDING|Pending integration acceptance in this worktree; active work is separately supervised under R14, not classified as missing or not-started lane work.|
|14 — Final matrix/docs/checks|PENDING|All accepted carries, 102 base cells plus states, native bounds matrix, final compiler0/full/i18n/e2e and docs remain pending.|
|Final review|PENDING|No integration-wide or final design/compiler sign-off.|

#### Per-finding disposition — CLOSED / OPEN

|Finding|Disposition|Concrete evidence / remaining gap|
|---|---|---|
|T7-F01 — Expanded state|OPEN|Core absence is fixed: NavRail.tsx:60,120,150–160 has actual state/class/toggle; d-shell.css:217–227 has reachable 220px/13px labels. BUT expanded Settings/Notifications still have no visible labels (NavRail:133–147; NotificationCenter.tsx:229–252), and the column budget still reserves50px rather than220px (nav-layout.ts:21–26, useAppShellRuntime.tsx:101–117).|
|T7-F02 — Deterministic failures / clean behavioural coverage|OPEN|The two former failures are CLOSED by exercised61/61. Policy remedy is NOT closed: utility-navigation.test.mjs:13–36 now extends the forbidden source/AST extractor to another handler spelling and retains legacy-location support, then new Function executes handlers[0]. Green extraction tests are not compliant production/rendered coverage.|
|T7-F03 — Grouping/dividers/scroll/footer structure|CLOSED|nav-items.ts:13–19,33–42 uses primary/utility/developer; NavRail.tsx:90–93,122–149 renders all destinations in the upper scroll group, two upper dividers, then NC/settings/divider/toggle footer. chrome.css:1249–1263 supplies scrolling/dividers. No footer-group consumer remains.|
|T7-F04 — Rail surface/border/transition|CLOSED|NavRail.tsx:120 no longer has sidebar-surface. chrome.css:1239–1242 supplies elevation-1, right border, width .18s transition and overflow hidden; matches D.css:329–332.|
|T7-F05 — Item metrics/ink/fidelity|OPEN|32px row height,1px/6px margins,28px icon wrapper and ink-gray-6 are fixed at chrome.css:1273–1305. Remaining collapsed row centering at chrome.css:1291/d-shell.css:213 differs from D.css:369–382 left-start icon placement; expanded label omits D.css:414 padding-left2px. Primary Build/Bench still use monitor/server glyphs rather than the approved chart/terminal glyphs (NavRail:31–32,icons.tsx:235,238 versus D2-shell:36–37,124,128 and viewed D2 PNG).|
|T7-F06 — Canvas/panel surface|OPEN|All-side12px margin, radius, elevation outline and elevation-base shadow are source-CLOSED at d-shell.css:240–244. Dark surface is still wrong: inherited chat-shell.css:51 → tokens.css:27 → surface-base/gray-950, not elevation-1/gray-900; espresso.css:1578,1590. Dark border also remains outline-elevation-1/gray-700 instead of the design dark override outline-gray-2/gray-600 (espresso:1852,1970; D.css:1536).|
|T7-F07 — Token-only dimensions|OPEN|Original repeated32/12/2 literals are replaced with tokens. Non-hairline literals remain: chrome.css:1253 padding6px,:1261 margin4px; d-shell.css:223 max-width160px,:255 padding6px. The report claim that all rail px literals now use tokens is false.|
|T7-F08 — Primitives|OPEN|All scroll destinations now use TooltipButton at NavRail.tsx:103–115. Newly added expansion control is still raw button/native title at :150–160, violating src/AGENTS.md:10–12,31.|
|T7-F09 — Named re-pinned assertions|CLOSED|The targeted navItemsSource block and work-panel d-rail-w CSS pin are removed; frozen search returns no matches for those pins. The footer32px pin is also deleted. Production nav-items tests now cover groups/selectors, including pulls. Remaining AST policy violation is tracked under F02, not hidden by this closure.|
|T7-F10 — Locale corrections/ruling|OPEN|All six unambiguous values are fixed: es/fr Bench:129,pt-BR Bench:128,tr Bench:138,zh-CN/zh-TW Chat:129. All9 expandRail/collapseRail entries and pulls.title entries exist. The self-labelled mirror ruling at task-7-report.md:57,172 is not a controller ruling and does not resolve ko/Chinese Bench or tr Build literal-versus-mirror discrepancies.|
|T7-F11 — Actual native bounds|OPEN|Report:154–162 STILL measures main-pane and supplies no native view.getBounds pairs. Correcting its Build outer rect does not fix host identity. Actual refs are BuildPage.tsx:240–247 canvasAreaRef, RavenPage.tsx:43–50,65 data-raven-surface and FileBirdPage.tsx:27–34,48 data-filebird-surface.|
|T7-F12 — Capture/provenance acceptance|OPEN|WS/shots/T7r2 is EMPTY by directory read and scoped glob. None of the three report-cited PNGs at report:113,136,144 is available. No provenance/readback artifact exists there. Cannot inspect the claimed new captures or saved/store/root agreement; all-page rail light/dark evidence also remains absent.|
|T7-F13 — Pull Requests contract/placement|CLOSED|Controller explicitly ruled pulls in the developer group. nav-items.ts:42 implements id/page/dataNav pulls,labelKey pulls.title; NavRail.tsx:38,98–110,127 maps and activates it. AppShell.tsx:286–288 already routes pulls to the real PullRequestsPage. Behavioural nav-items.test.mjs:19,22–31 passes. Position after Plugins matches D2-shell.html:155–161.|

**Verification exercised once against the frozen archive:**

`node --test test/nav-items.test.mjs test/sidebar-footer.test.mjs test/utility-navigation.test.mjs test/sidebar-navigation.test.mjs test/work-panel.test.mjs`

**61 tests /61 PASS /0 FAIL /0 cancelled /0 skipped.** Output includes three passing nav-items tests and the former failing footer/utility suites. This verifies disappearance of the deterministic failures, not test-policy compliance or rendered/native behaviour. No full suite, tsc, i18n suite, build, e2e or app/native launch was run by this auditor. Full-suite/tsc report claims are not counted as independently exercised evidence.

No obsolete nav-rail-width or old footer group remains in the searched frozen renderer/shared sources. No new hardcoded colour was observed in the revised component/rail CSS; remaining dimension literals and dark-token selection are separate defects. Newly added expansion/collapse strings exist in all9 locales. R14 post-merge native/budget/plugin/overflow/state-preservation checks remain open.

#### Pull Requests placement for Tasks 8 and 9 — authoritative answer

- **D2 / Task 7:** upper SCROLL region, DEVELOPER group, immediately after Plugins. It is NOT a utility footer control. Product page/selector remains pulls; the design fixture name pull-requests is not a reason to add a product alias. Verified source and passing registry tests close F13.
- **D1 / Task 8:** place Pull Requests in the ellipsis/More overflow menu with the non-primary destinations. Keep ONLY Chat, Build, Bench as the three primary pills. When Pull Requests is active, highlight the More control. Authority: D1-shell.html:19 lists pull-requests in overflowPages; :25–28 activates d-tab-more; :97–108 renders three pills plus More. Do NOT add a fourth Pull Requests pill or place it in the right action cluster.
- **D3 / Task 9:** upper d3-rail-scroll DEVELOPER subgroup, after Plugins and after the second separator. Compact visible label is PRs; full accessible/tooltip title is Pull Requests. Authority: D3-shell.html:357–400, particularly :391–400; label styling :98–99 is10px. Use appropriate existing/new translated compact copy in all9 catalogues, not a hardcoded string or a changed global page title. Footer :405–414 has Inbox and Settings ONLY, no PRs and no D2 expansion chevron. Hide/omit the D2-specific toggle in island mode.

No D1/D3 implementation is certified here; this is direct design-source placement guidance for their pending integration tasks.

### Gaps (must close before the plan is complete)

- **High, T7-F01, S3–S4/RF2 — incomplete expanded state and stale budget.** Add visible footer labels in the expanded D2 rail, including the notification trigger, preserving memory dot/count/interaction. More importantly, flow expansion into the REAL reservation/resize path: local NavRail state at :60 only changes CSS width, while shellChromeWidth(rail) remains74 (=50+24), not244 (=220+24), at nav-layout.ts:21–26. useAppShellRuntime.tsx:101–117 only observes the outer shell and navLayout, not rail expansion. It overestimates fixed-window column room by170px when expanded; main-floor/sidebar-max/WorkPanel decisions therefore do not use the rendered rail width. An ordinary pane-x reflow screenshot is not this boundary acceptance. Fix the shared runtime/rail integration and exercise expansion with sidebar + WorkPanel at the floor; do not hide this new state behind the old collapsed rail/island C02 carry.
- **Medium, T7-F02, S6/test policy — source/AST adaptation retained.** Replace or remove the touched extraction-driven Plugins test at utility-navigation.test.mjs:13–36. Legacy inline-handler support plus new variable-declaration parsing is the same wiring-test workaround CP12 rejected. Retain real history-slice/production navigation or actual rendered click coverage, not a new Function reconstruction of copied text. Former deterministic failures are CLOSED and must not be reported as still failing.
- **Medium, T7-F05, S4/fidelity — alignment/label offset/glyph deltas.** Remove collapsed item centering where it contradicts the left-start28px icon box, add the exact expanded label inset and use the approved Build/Bench chart/terminal glyphs. Fix chrome.css:1291,d-shell.css:211–227 and the canonical icon map. Approved reference/markup, not the old approximate plan icon-map snippet, governs. Corrected heights/margins/ink/icon-box size are credited, not recharged.
- **Medium, T7-F06, S4/dark fidelity — panel background and theme-specific border still differ.** d-shell.css:240–244 needs the correct elevation-1 panel surface (or an exact equivalent theme-aware token) and the D.css:1536 dark border override. Current primary background maps to gray-950, and current dark elevation outline maps to gray-700; approved panel uses gray-900/gray-600. Light gutter/radius/outline/shadow fixes are CLOSED. Workbench inner cards remain their Task11 owner, not an instruction to add a second outer wrapper.
- **Medium, T7-F07, S4/Global Constraints — non-hairline size literals remain.** Tokenize6px scroll/footer padding,4px divider margin and160px expanded-label limit at chrome.css:1253,1261 and d-shell.css:223,255, preserving exact design values. Do not claim no literals merely because32/12/2 were converted.
- **Medium, T7-F08, S3/renderer rules — raw expansion button.** Replace NavRail.tsx:150–160 with the existing TooltipButton primitive, keeping dynamic translated tooltip/aria label, aria-expanded, chevrons and actual toggle behaviour. Scroll-item primitive migration IS credited as fixed.
- **Medium, T7-F10, S5/ruling — literal-versus-mirror disposition still incomplete.** Controller must explicitly choose/document the remaining ko/Chinese Bench and tr Build interpretation or align them with the stated mirror rule. Base aaf72787a navToBench uses Bench (ko:1251,zh-CN/zh-TW:1228), while current nav uses 벤치/工作台; base tr navToBuild:1240 uses Build, while current nav uses Derleme. These current values match the literal list but not the report blanket mirror rule. Fix the report typo claiming Chat mirrors navToBench rather than navToChat. No change to the six already corrected entries is requested.
- **Medium, T7-F11, S6/RF1 — wrong host/no native proof remains.** Measure the actual ready/owned surface refs, not main-pane, and pair each renderer rect with actual WebContentsView.getBounds for Build/Raven/FileBird. Record relevant rail resize/expand/collapse/layout-change cases and actual ready state; native view content is untouched. Report:154–162 is still DOM-only and its no-unmount sentence has no preservation trace. Final all-layout/post-lane-integration matrix remains a separate required carry.
- **Medium, T7-F12, S6/R10 — missing capture files and readback evidence.** Supply the three named T7r2 PNGs plus per-shot committed-build/font/zoom/viewport/locale/page/layout/theme identity and saved/store/root readbacks. Required directory was read as empty; scoped WS glob and /tmp/t7r2*.png found no files. A broad search timed out and is NOT used as absence evidence. No new actual/reference pair can be approved from the prose tables alone. Finish the all-page rail light/dark comparisons or obtain an explicit controller carry; keep final102-cell and T6 saved-theme carries truthful.

### Claims not backed by evidence

- Report status DONE / all F01–F13 resolved is not supported: four scoped findings are CLOSED and nine remain OPEN, with partial fixes explicitly credited.
- Report:50 says all rail px literals use tokens; non-hairline6/4/160px remain in source.
- Report:54,154 calls main-pane the native host. Actual reporting refs are different elements and native getBounds is absent. Build outer-rect correction is positive but does not establish native alignment.
- Report:55,111–150 cites three new captures/real saved-theme verification, but the requested artifact directory is empty. I do NOT repeat the former accusation that these new captures were DOM-forced: the updated report claims a real picker method, which is currently unverifiable, not disproved.
- Report:111 says navLayout persisted via settings/get; a GET/readback does not perform persistence. Record the actual write/picker method and returned values.
- The old fidelity-table rows still describe32×32 primary buttons, display:none labels,0/12/12/0 margin and primary native-title tooltips even though source fixes replaced those. Update those claims/anchors rather than resurrect the old CSS. Report:64 still says nav-items2/2; the exercised current file has THREE passing tests. Report:66 says no new keys, although expandRail/collapseRail were added in all9 locales.
- tsc0, i18n27/27, targeted91/91 and full-suite3584/all failures allowlisted remain report-only here. Only the61/61 named cheap group was independently exercised. No unobserved historical RED or actual UI/native measurement is fabricated.

### Open deferred items

1. Retain all accepted Task14 carries from CP12: actual520/240 cap and responsive restoration boundaries, successful persisted-island renderer reload, native cold restart/guard acceptance, and long migrated form dialog light/dark. F01 expanded reservation is a current source defect, not silently folded into a generic evidence carry.
2. Retain Task13/14 T6-F03 saved-theme/root agreement. Current missing T7r2 files cannot close it or establish a new production-theme bug.
3. Task8/9 placement/action/label/overflow/native-control work remains pending; PR guidance above is verified directly from D1/D3 authority. Task8 replaces the stub and supplies all four functional shared navbar actions; Task9 keeps the R11d permanent global sidebar and excludes the D2 toggle.
4. R14 external lanes are separately supervised. After their sequential integration, re-check shared CSS/i18n/token/interface conflicts and native bounds against the final Task7 gutters. Do not combine isolated-lane passing counts into an integration proof.
5. Final102 base cells plus gallery states/derived-comparator policy, all-layout native bounds, plugin theme accents/surfaces, locale/font-scale overflow, settings inert/focus, draft/scroll/running turn, native/platform truthfulness and contrast remain required. Main/integrator runs exact compiler0 and full/i18n/e2e once after integration; this supervisor does not launch those unasked.
6. Final docs/§11/ADR convention and R12 user acknowledgement remain pending. No CHANGELOG edit. Previously noted superseded base.css shell rules remain a clean-cutover cleanup item; prior source-closed ledger minors are not reopened.

### Verdict: GAPS FOUND

**TASK 7 GATE: FAIL.** **4 CLOSED /9 OPEN** within T7-F01–F13. The real toggle, upper grouping, rail surface, original source-pin removal and controller-ratified PR destination are credited. Residual expanded-state budget/labels, fidelity/tokens/primitive/test-policy issues and missing native/capture evidence prevent acceptance.

**DESIGN FIDELITY (scope: Task 7 surfaces): NOT CONFIRMED.**

**DESIGN FIDELITY: NOT CONFIRMED.** No T7r2 actual PNG was available to view; one approved D2-dark PNG was viewed, and D1/D2/D3 source authorities were inspected. No pixel-parity or completed whole-page matrix is claimed.

Only the authorized supervisor-checkpoint-13.md is created. No source/test/ledger/context/design/main-checkout edit, commit, lane mutation or agent dispatch is performed.

