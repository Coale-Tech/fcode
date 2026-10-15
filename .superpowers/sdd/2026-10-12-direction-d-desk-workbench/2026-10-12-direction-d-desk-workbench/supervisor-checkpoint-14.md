### Coverage

**Checkpoint 14 — frozen commit `6d62c87a19025270d07c04318293ddee287a59f8` (`fix(shell): T7 round-4`).** Independently inspected committed source exported with `git archive` into `/tmp/cp14-6d62c87a1`, the plan's Task 7 Steps 1–7/Files/interfaces, Global Constraints and Review Focus, WS/progress.md, WS/context.md, CP13, task-7-report.md, both capture directories and their JSON. No implementer assertion is treated as verification.

**Scope:** Task 7 and closure of CP13 findings. Retained foundation acceptance is not a fresh foundation audit. R14 isolated Tasks 10–13 remain separately supervised; final integrated acceptance is not inferred. Source anchors below are relative to `apps/desktop/` unless otherwise stated. WS is `.superpowers/sdd/2026-10-12-direction-d-desk-workbench/`.

|Task|Status (DONE / PARTIAL / MISSING / PENDING)|Evidence or gap (file:line)|
|---|---|---|
|1–5 — Foundation|DONE|Retained acceptance and explicit Task14 carries: progress.md:69–71; no new whole-foundation certification.|
|6 — Navbar/window/status|DONE|Retained acceptance at progress.md:72–74; saved-theme/root agreement still carried.|
|7 — Rail/shared destinations|PARTIAL|Real expanded reservation/labels, primary geometry/glyphs, dark panel tokens, toggle primitive and locale mirror are source-fixed. Touched source-text test, native acceptance and capture provenance remain incomplete.|
|8 — Tabs/shared navbar actions|PENDING|No Task8 completion certified at frozen T7 commit. Preserve CP13 three-pill/More placement guidance.|
|9 — Island|PENDING|No Task9 completion certified; CP13 upper developer PRs placement/no D2 toggle guidance retained.|
|10–13 — Isolated lanes|PENDING|Pending integrated acceptance, not an allegation that external lanes are unstarted.|
|14 — Final matrix/docs/checks|PENDING|102 base cells plus states, native matrix, compiler0/full/i18n/e2e, documentation and accepted carries remain outstanding.|
|Final review|PENDING|No final integrated design/compiler sign-off.|

#### Per-finding disposition — CLOSED / OPEN

|Finding|Disposition|Concrete evidence / remaining gap|
|---|---|---|
|T7-F01 — Expanded state, real reservation, footer labels|CLOSED (source; boundary evidence carried)|NavRail.tsx:101–105 toggles state and calls parent; features/app/AppShell.tsx:117,154 connects runtime callback; useAppShellRuntime.tsx:80,95–96,106–125 reads expansion via ref and recomputes shellWidth without outer ResizeObserver activity. lib/nav-layout.ts:21–29 returns74 collapsed/244 expanded. Runtime :126–131 uses columnsWidth for sidebar cap, :155–163 for sidebar reopen, :980–985 for rendered cap; AppShell.tsx:336–345 passes shellWidth to real WorkPanel. This is actual production column-budget wiring, not just CSS or pane-x evidence. NavRail.tsx:144–161 and NotificationCenter.tsx:233–257 retain notification popover/count and Settings memory dot while adding translated visible labels. New T7r4 light/dark expanded PNGs visibly show both Notifications and Settings. Actual threshold/cap restoration trace remains Task14 carry.|
|T7-F02 — Deterministic failures / clean behavioural coverage|OPEN (partial remedy)|utility-navigation.test.mjs:1–24 now tests real usePluginBrowseState; AST/new Function extraction is deleted. However the same commit re-pins a forbidden source-text assertion in sidebar-footer.test.mjs:41, changing exact `<NotificationCenter />` to regex `<NotificationCenter\\b`. That test still reads NavRail source at :10–13, slices TooltipButton text at :48–54, and pins copied Plugins wiring at :56–60. Utility cleanup is credited; policy compliance is not complete. No fresh failing-test claim is made.|
|T7-F03 — Grouping/dividers/scroll/footer|CLOSED|components/nav-items.ts:13–19,33–42 supplies primary/utility/developer and Plugins→Pull Requests ordering; NavRail.tsx:134–145 renders upper scroll groups/two separators and separate footer. chrome.css:1249–1263 supplies scrolling. Viewed captures corroborate upper grouping.|
|T7-F04 — Rail surface/border/transition|CLOSED|NavRail.tsx:132 omits sidebar-surface; chrome.css:1233–1243 supplies elevation-1/right border/.18s transition. Light/dark captures show the intended rail surfaces.|
|T7-F05 — Primary item geometry/alignment/glyphs|CLOSED (named CP13 deltas)|chrome.css:1288–1307 now explicitly overrides base centering with flex-start and keeps32px row/1px6px margin/28px icon box; d-shell.css:214–225 adds2px expanded label inset. NavRail.tsx:32–34 maps Build→BarChart2 and Bench→Terminal; viewed new captures show chart/terminal glyphs. Old T7r2 collapsed JSON still says itemJustify=center and therefore is not accepted as proof of this corrected source. Footer fidelity qualification below remains distinct.|
|T7-F06 — Canvas/panel dark surface/border|CLOSED|d-shell.css:235–246 keeps all-side tokenized12px gutters/radius/elevation-base shadow and adds dark elevation-1 background/outline-gray-2 border. T7r2 dark JSON records rgb31/31/31 panel and rgb56/56/56 border; both generations' dark PNGs were viewed. Workbench bypass remains :249–253, not a second wrapper.|
|T7-F07 — Named6/4/160px literals|CLOSED (named deltas; broader token claim qualified)|chrome.css:1253,1261 and d-shell.css:218,258 now use d-rail-item-mx/divider-gap/label-max; d-tokens.css supplies4px/160px tokens. No regression to the named literals. Broader “all rail px literals tokenized” is still false: chrome.css:1336–1338 retains memory-dot top/right4px and1.5px border. Those predate round4; they are not represented as newly introduced.|
|T7-F08 — Expansion primitive|CLOSED|NavRail.tsx:166–178 uses TooltipButton with dynamic translated tooltip/ariaLabel, aria-expanded, aria-controls and handleToggle. Scroll destinations also remain TooltipButton at :115–128.|
|T7-F09 — Original named source pins|CLOSED (original scope)|Original navItemsSource/work-panel width/footer32px pins remain absent in inspected files. The separate newly adapted NotificationCenter source pin is explicitly charged under F02, not concealed by this closure.|
|T7-F10 — Locale mirror/ruling|CLOSED|progress.md:77 explicitly supplies controller mirror ruling. Committed ko Bench:138, zh-CN/zh-TW Bench:131 and tr Build:137 are Bench/Build. Chinese Chat:129 remains 聊天; es/fr Bench:129 and pt-BR Bench:128/tr Bench:138 remain Bench. All9 chat/build/bench and expandRail/collapseRail entries were inspected; quoted-key de/es/fr catalogues included. Report now names navToChat correctly. Literal plan table is superseded by R11/controller mirror ruling, not a self-authorized implementer deviation.|
|T7-F11 — Actual native bounds|OPEN (Task14 carry)|shots/T7r2/t7r4-native-bounds.json:2 explicitly says renderer DOM rects only. Build :3–16 measures paneRect rather than canvasAreaRef; Raven :28–37 says surfaceFound=false and supplies outer pane rect; only FileBird :18–26 finds its surface. No native view.getBounds, ready/owned trace, or resize/expand/collapse pairs. Real production refs remain pages/BuildPage.tsx:240–257,557; RavenPage.tsx:43–56,65; FileBirdPage.tsx:27–40,48. Report honestly carries this now; it is not CLOSED.|
|T7-F12 — Files/provenance/all-page comparisons|OPEN (partial remedy; Task14 carry)|T7r2 is no longer empty: three t7r4 PNGs and four JSON files exist and were read/viewed. T7r4 additionally has four PNGs, all viewed, plus budget.json. But older light JSON :3 says commit=post-r4 and :15–16 root light/persisted dark; newer budget.json:2 explicitly says uncommitted-round4. Report:228–230 admits setThemeAttr, not the real saved picker. Newer shots have no per-shot saved/store/root readback, exact committed build identity, font/zoom provenance or all-page comparison matrix. File existence is fixed, provenance acceptance is not.|
|T7-F13 — Pull Requests contract/placement|CLOSED|nav-items.ts:42 keeps pulls in developer group after Plugins; NavRail.tsx:40,115–127 renders/activates it. nav-items.test.mjs:19,22–32 asserts selector/group against production function. No alias or utility-footer placement is added.|

**Disposition:** 10 named CP13 findings source-CLOSED /3 OPEN (F02,F11,F12). Closure of named F05/F07 deltas does not erase the additional cross-cutting fidelity/token qualifications below.

#### Task 7 plan checklist and verification boundary

|Plan requirement|Status / evidence|
|---|---|
|Files: NavRail, nav-items, chrome.css/d-shell.css, nine locale catalogues, nav-items.test.mjs|All specified implementation files inspected in frozen commit; registry contract intentionally updated by authoritative design/rulings to three upper groups, pulls and exported canonical icons.|
|Step1–2: flag gating and stable selectors, production registry|Production nav-items.ts:33–42 and behavioral nav-items.test.mjs:7–32 implement flag gating, stable build-canvas/chat/filebird/pulls selectors and grouping. Historical RED cannot be independently established from present source. No invented RED/PASS result.|
|Step3: render registry, Plugins back toggle, NC/Settings functionality|NavRail.tsx:95–161 contains real registry loops and original Plugins back-toggle logic, NC invocation and memory-dot Settings navigation. NC :233–257 preserves open/close and unread badge. No rendered click/preservation journey independently run.|
|Step4: rail geometry/active/canvas/theme tokens|Source fixes credited above; original plan snippets yield to D.css per R11. Expanded footer alignment/icon-size and global token-only qualification remain below.|
|Step5: nine locales / mirror decision|DONE by committed catalogue reads and controller ruling; no locale overflow smoke executed.|
|Step6: i18n suite/full suite/all-page captures/native pairs|PARTIAL. Seven supplied actual PNGs and two approved D2 PNGs viewed. All-page light/dark set/native pairs missing. Report-only tsc/test/i18n results not independently certified.|
|Step7: commit|Observed `git show --stat 6d62c87a1`:15 committed changed files,87 insertions/131 deletions; prior feature commit is part of frozen archive.|

**Checks actually exercised:** read-only git show/diff/archive; committed source reads/searches; WS directory/JSON reads; seven actual PNG views and two approved chat D2 light/dark PNG views. No tests, compiler, full suite, build, browser/native launch or i18n suite was run by this auditor. Exact-zero tsc remains required, not inferred from prose. No new hardcoded colour was observed in the scoped changed component/rail CSS hunks; remaining token dimension literals are separately identified.

#### Visual evidence and provenance assessment

- Viewed requested T7r2 `t7r4-rail-light-collapsed.png`, `t7r4-rail-light-expanded.png`, `t7r4-rail-dark-collapsed.png` and their JSON. The old expanded picture does **not** show a readable Notifications label: it shows a bell/count and clipped label fragment. Old collapsed JSON reports center alignment, inconsistent with frozen round4 source. Those artifacts cannot prove the final fixes.
- Also viewed all four newer T7r4 shots. New light and dark expanded pictures do visibly show Notifications and Settings, while primary rows are left-start and chart/terminal glyphs are correct. This closes the prior complete absence of visible footer-label evidence. Both footer controls still sit near the rail centre rather than sharing the primary left icon grid: d-shell.css:255–264 sets flex-column align-items:center, and its expanded :228–230 changes justify-content, which is vertical in a column. NotificationCenter's wrapping div further makes the trigger intrinsic-width. Approved D.css:369–382,432–435 uses common left-start rail-item rows with footer padding. NotificationCenter.tsx:249 still uses14px bell rather than reference16px SVG (:402). These are scoped footer fidelity differences, not an allegation that labels remain absent.
- Reference `pages-d/chat/variant-D2.png` and `variant-D2-dark.png` were both viewed. Actual chat is an empty/get-started state, with different sessions/activity/content, and is not a comparable reference-state all-page matrix. Task8 navbar actions/Task10 content/Task11 panels remain their owners; this checkpoint does not move them into T7. No pixel-parity claim follows from a matching outer rail/panel.
- New `budget.json` states50+24=74/220+24=244 and source provenance, but provides no measured runtime shellWidth/sidebarWidthMax/WorkPanel collapse state. Its build is explicitly uncommitted-round4. The production code really fixes reservation; this artifact alone is not runtime boundary acceptance.

### Gaps (must close before the plan is complete)

- **Medium, T7-F02, S6/test policy — source-text re-pin remains.** Remove or replace the touched `sidebar-footer.test.mjs:41` NotificationCenter regex and associated extraction/wiring coverage with real production/rendered behavior. Round4 AST deletion in utility-navigation is credited. Do not retain the new regex simply because it is green; test-file diff explicitly confirms the adaptation.
- **Medium, T7/footer fidelity, S3–S4/R10 — expanded footer not on the common left-start grid.** Fix d-shell.css:255–264/expanded footer :228–230 and NotificationCenter wrapper sizing so Notifications and Settings share primary row/icon alignment; use approved16px bell for the rail trigger (NotificationCenter.tsx:249). Preserve popover/count/memory dot. New PNG labels are readable, but readable labels are not100% alignment parity.
- **Medium, T7-F07/global token constraint — broader all-literals claim still inaccurate.** Named6/4/160px requested conversions are CLOSED. Remaining rail memory-dot4px offsets/1.5px border at chrome.css:1336–1338 need tokens or an explicit accepted exception; do not call all non-hairline rail sizes token-only while these remain.
- **Medium, T7-F11, S6/RF1 — native pairing incomplete (carried to Task14).** Capture owned/ready canvasAreaRef, data-raven-surface and data-filebird-surface with actual native view.getBounds, including expansion/collapse/resize/layout changes. Raven surfaceFound=false is not successful Raven alignment; Build paneRect is not canvas bounds. Existing observer source alone is not native proof.
- **Medium, T7-F12, S6/R10 — final capture provenance/comparison incomplete (carried to Task14).** Capture exact committed build with real saved theme/layout path and per-shot saved/store/root agreement, fonts/zoom/viewport/DPR/locale/page/layout identity; complete approved all-page light/dark comparison. Supplied old light root/persisted mismatch and new uncommitted identity cannot satisfy this. Correct report tables to distinguish old/new captures instead of claiming interchangeable committed real-picker evidence.

### Claims not backed by evidence

- DONE/all gaps resolved is too broad: F02 policy and F11/F12 acceptance remain open, plus footer fidelity/token-only qualifications. A four-round cap changes scheduling, not evidence or the design gate.
- Report's stale fidelity table (rows around :109–129) still claims32×32 primary buttons, centering, display:none/display:block labels, old0/12/12/0 margin, native-title primary tooltips and raw toggle despite corrected source. These must be rewritten to current implementation, not used as closure evidence.
- Older RF1 report section :154–162 still calls main-pane the native host and claims no unmount. JSON contains no native getBounds and Raven has no surface; no draft/scroll/running-turn preservation trace is supplied.
- Report's earlier real-picker/committed-build provenance is contradicted by old light persistedTheme=dark/root light and the later explicit setThemeAttr setup; newer budget says uncommitted-round4. JSON commits post-r4/uncommitted-round4 do not identify6d62c87a1. This establishes inadequate evidence, not a production persistence defect.
- All rail px literals tokenized is false at the memory-dot offsets/border. Named CP13 literal fixes remain credited.
- Report compiler0, targeted60/60 and full-suite allowlist claims remain report-only. No executable logs were independently exercised in this audit; none are claimed as independent verification.
- “Native pairing requires infrastructure outside capture rig” is the implementer's stated limitation, not an independently established impossibility. The missing proof remains a carry, not a closed requirement.

### Open deferred items

1. Explicit progress.md round4 cap carries remaining work to Task14. F11/F12 remain OPEN acceptance carries; no automatic closure or gate waiver is inferred.
2. Retain all CP13/CP12 accepted Task14 carries: actual520/240 caps and450px main-floor/WorkPanel collapse/reopen/restoration boundaries, rail/island10px delta and now expanded170px budget delta; successful persisted-island renderer reload; native cold restart/guard acceptance; long migrated form dialog light/dark.
3. T6-F03 saved-theme/root agreement remains Task13/14 carry. Supplied root light/persisted dark and setThemeAttr shots do not close it.
4. Task8/9 pending implementation/acceptance retains CP13 authoritative PR placement: D1 More overflow, only3 primary pills; D3 upper developer subgroup after Plugins with compact translated PRs label and footer Inbox/Settings only, no D2 toggle.
5. R14 isolated lane integration must re-check shared CSS/tokens/locales/interfaces and native bounds against final gutters; do not aggregate isolated passing counts into integrated proof.
6. Final102 base cells plus gallery states/derived-comparator policy, plugin themes, long locale/font-scale ellipsis+title, Settings inert/focus, native/platform truthfulness, draft/scroll/running-turn preservation and contrast remain pending. Main/integrator runs compiler exact0 and full/i18n/e2e after integration as authorized.
7. Ledger minors remain open unless separately source-closed: superseded base.css shell rules, stale shadowed base tokens, duplicated NavLayout union, duplicate main.tsx import and legacy source-text pins. No unrelated foundation re-audit is claimed.
8. Final §11/ADR/docs and R12 user acknowledgement remain pending; no CHANGELOG mutation is authorized here.

### Verdict: GAPS FOUND

Real expanded-rail reservation now reaches the production column-budget path, and newer PNGs show both footer labels. Locale mirror, named token conversions, primary alignment/glyphs, dark panel and TooltipButton fixes are credited. Remaining test policy, footer fidelity and evidence acceptance prohibit100% sign-off. Only this authorized checkpoint report is written; no source, tests, ledger, context, design, main checkout, commits or agents are modified.

DESIGN FIDELITY: NOT CONFIRMED
TASK 7 GATE: FAIL
