### Coverage

**Checkpoint 11 — T6-F03 / T6-F04 ONLY.** Frozen source **0aacdb0517ca0395e6dc4dab648dcf091ac629d8** (0aacdb051). Later Task 7 commits and uncommitted implementation edits are excluded. Independently read git show/diff identifies a two-file native correction: packages/shared/src/window-chrome.ts and window-chrome.test.ts,4 insertions/4 deletions. ShellNavbar and d-shell have no new delta from the previously audited a53338e2d. Prior closed source groups are retained, not routinely re-audited.

**Authority:** progress.md:69–71 retains accepted Tasks1–5 foundation and explicit Task14 carries. R11 design-over-plan/R12 accent decisions remain. The exhaustive task/Step/Files/spec/state checklist in CP2–CP10 remains; this report updates only F03/F04. No final102-cell matrix, tests, compiler run, build or app launch was authorized or performed.

**Paths:** WS=.superpowers/sdd/2026-10-12-direction-d-desk-workbench/. R=/Users/mac/.gstack/projects/Coale-Tech-fcode/designs/all-pages-20261012/. Source anchors are relative to apps/desktop/ unless packages/shared or packages/i18n is explicit. PNG filenames are evidence anchors.

|Task|Status (DONE / PARTIAL / MISSING / PENDING)|Evidence or gap (file:line)|
|---|---|---|
|1 — Accent/density tokens|DONE|Accepted foundation closure,progress.md:71; prior independently exercised/source evidence retained,not re-audited.|
|2 — Setting/resolver/validation|DONE|Accepted foundation closure,progress.md:69–71; native guard/cold-restart acceptance remains Task14.|
|3 — Root attribute/budget|DONE|Accepted foundation closure with explicit C02 Task14 carry,progress.md:69–71.|
|4 — Appearance picker|DONE|Accepted foundation closure with explicit C05 Task14 carry,progress.md:69–71. No foundation theme-product regression is asserted by this capture audit.|
|5 — Shared primitives|DONE|A8 closes C06 and foundation,progress.md:71; long dialog/final verification carries retained.|
|6 — Navbar/window/status|PARTIAL|F01/F02 remain CLOSED. F04 now CLOSED: shared/window-chrome.ts:18 y18,test:16–18,report:178–179 native offset/OS drag. F03 layout/page/missing-dark defects closed,but saved-theme/store provenance remains OPEN: both Settings-light PNGs visibly select Dark; ThemeRow.tsx:43,94–95,147 derives that label from settings.theme.|
|7 — Rail/shared destinations|PENDING|Task7 is dispatched per progress.md:72; later work is deliberately outside this frozen checkpoint. Prior full checklist retained,not flagged as missing.|
|8 — Tabs/shared navbar actions|PENDING|T8-L01/L02 ownership retained: logo/three pills/overflow AND all4 functional navbar actions in all3 layouts.|
|9 — Island|PENDING|Prior complete Steps/Files/spec/sidebar/floor/scroll checklist retained.|
|10 — Chat/Activity/composer|PENDING|Prior complete inventory/move-remove/Steps/Files/spec-state checklist retained.|
|11 — WorkPanel/Bench/Build|PENDING|Prior complete Steps/Files/table/native-bounds checklist retained.|
|12 — Remaining pages|PENDING|Prior complete Steps/Files/table/state checklist retained.|
|13 — Settings/embedded/palette/onboarding|PENDING|Prior checklist retained,including T13-L03 nested Settings/General breadcrumb.|
|14 — Matrix/docs/final verification|PENDING|Explicit controller carries and full base/state/provenance/compiler0/full/i18n/e2e/docs/cleanup checklist retained.|
|Final review|PENDING|Global Constraints and all9 Review Focus gates retained. No whole-design or current-SHA full verification sign-off.|

#### Scoped disposition

|Finding|Disposition|Evidence / residual|
|---|---|---|
|T6-F01 — native lead-slot geometry|CLOSED — retained|No new renderer delta. Prior frozen d-shell.css:61–63 padding76/94/fullscreen12 and approved slot geometry remain accepted.|
|T6-F02 — search/copy/keycaps|CLOSED — retained|No new renderer/i18n delta. Prior ShellNavbar.tsx:63,67–75,d-shell.css:93,108–168,all9 nav.awesomebar entries remain accepted.|
|T6-F03 — layout/page/theme capture evidence|PARTIAL / OPEN — Medium residual|All8 t6r2 PNGs VIEWED and matched with all8 JSON shot records. Actual tabs now has empty navbar-start (not erroneous Fcode/Chat),actual Settings now contains Settings/General and rail Fcode/Settings. Previously missing tabs-dark/island-dark are supplied. Root layout/theme,navbar padding/start,chat-hidden,time,DPR,viewport,locale records agree with these pixels. However, both t6r2-settings-rail-light.png and t6r2-tabs-settings-light.png visibly show Theme=Dark while their root is light. JSON records ONLY rootTheme,not settings.theme/storeTheme/persistedTheme; no saved light agreement is established. The prior CP10 F03 requirement explicitly requested saved light/dark and saved/store/root state,CP10:56,62,93.|
|T6-F04 — native alignment/drag|CLOSED|Committed MAC_TRAFFIC_LIGHT_POSITION is x16,y18 at packages/shared/src/window-chrome.ts:18; main/bootstrap/window.ts:187 consumes that exact constant; geometry test expectation is updated at packages/shared/src/window-chrome.test.ts:16–18. The controller-supplied native center offset1px is acceptable for this native integration under the explicit y18 instruction and12px mock-dot versus14px OS-native geometry,with qualification below. Report:179 records an actual cliclick empty-band gesture and before296,96→after416,96,delta+120,0. This is observed OS movement evidence,not the former CSS-only drag assertion. Previously credited CDP click/Cmd-K/focus/inert subchecks remain retained.|

**Incremental counts:**16 scoped groups =12 CLOSED /1 OPEN (Medium residual within F03) /3 OWNED-BY-LATER-TASK (2×T8,1×T13). The former High layout/page mislabelling and missing-dark defects are closed; they are not recharged to the corrected t6r2 set.

#### Eight images and provenance actually inspected

Provenance JSON independently read in full: WS/shots/T6/t6r2-provenance.json:1–143. It contains8 shot records with timestamps2026-10-13T05:41:46.734Z through05:41:56.426Z,CSS1200×800,DPR2,en,screen296,96,rootNavLayout/rootTheme,chatHidden,navPadLeft,startText and crumbs. Report:113–120 records non-capture main-renderer attachment,real layout picker clicks,build/base-plus-round2 patches and fontScale1. The JSON does NOT record store/persisted layout/theme,navbar data-nav-layout,zoom or font family; no claim is made that those absent fields were measured.

|Actual PNG VIEWED|Recorded / actual state|Scoped comparison and disposition|
|---|---|---|
|t6r2-rail-light.png|rail/light,chatHiddenfalse,padding76,Fcode/Chat; matching JSON:31–47|Shared navbar versus R/kit-d/chat-D2.png: visible corrected awesomebar/caps/breadcrumb; no renewed no-navbar finding. Rendered LIGHT accepted; saved-theme agreement not recorded.|
|t6r2-rail-dark.png|rail/dark,false,76,Fcode/Chat; JSON:48–64|Shared dark navbar versus chat-D2-dark.png: consistent. No whole-page Chat/Activity acceptance is implied.|
|t6r2-island-light.png|island/light,false,76,Fcode/Chat; JSON:65–81|Shared navbar versus chat-D3.png: consistent with recorded current root layout and real-picker method. Identical current rail/island body is staged Task7/9 scope,not a new completed-task defect.|
|t6r2-island-dark.png|island/dark,false,76,Fcode/Chat; JSON:82–98|Shared navbar versus chat-D3-dark.png: dark frame is now actually supplied and viewed.|
|t6r2-tabs-light.png|tabs/light,false,94,empty start/null crumbs; JSON:114–128|Versus chat-D1.png,Task6 stub boundary: EMPTY navbar-start is now correct for actual tabs branch at ShellNavbar.tsx:40,48–55; Task8 logo/pills/overflow remain pending. The old wrong Fcode/Chat tabs state is closed.|
|t6r2-tabs-dark.png|tabs/dark,false,94,empty start/null crumbs; JSON:129–142|Versus chat-D1-dark.png: missing dark tabs state now supplied and viewed; expected empty start retained. Reference is a real approved file,not an absent/derived comparator.|
|t6r2-settings-rail-light.png|rail/light,chatHiddentrue,76,Fcode/Settings; JSON:15–30|Versus Appearance variant-D2.png,navbar-only scope: ACTUAL Settings/General body and appropriate current page breadcrumb now visible. /General path and future workbench composition remain Task13. **Theme picker says Dark despite rendered light root.**|
|t6r2-tabs-settings-light.png|tabs/light,chatHiddentrue,94,empty start; JSON:99–113|Actual Settings/General with Top tabs selected and empty navbar-start: positive store-layout/page evidence. **Theme picker again says Dark despite rendered light root.**|

All8 images have2400×1600 source dimensions,consistent with the recorded1200×800 atDPR2. Reader scaling is a preview,not normalized pixel-parity analysis. No screenshots were written/resized by this auditor. **8 actual +7 approved PNGs viewed** (D1,D1-dark,D2,D2-dark,D3,D3-dark,Appearance-D2). Zero new whole-page matrix cells are accepted; right cluster,nav/body/page compositions remain their pending owners.

#### Native1px judgment — acceptable, with precise limits

**YES: the recorded1px residual is acceptable for Task6 native window integration at y18.** This is a scoped audit judgment,NOT a claim that D.css contains a±1px tolerance.

- D.css:23,119–129 defines a48px navbar; :134–140 vertically centers a fixture slot whose HTML traffic-light dots are12px. Nominal48px-band/12px-dot geometry gives top18 and center24.
- The product preserves REAL macOS native controls,not replacement12px renderer circles. Frozen shared/window-chrome.ts:9–11,24–26 documents native DIP space and approximate visible diameter14 owned by macOS. With prescribed top18,its nominal radius7 gives center25,oneDIP below24. That extra radius is native-platform geometry,not a changed renderer navbar dimension/inset or a reason to draw fake dots.
- Plan Task6S6:643 explicitly prescribes y18 after off-centering. That correction is now committed,and the re-check reports the residual rather than hiding it. x16/cluster60/edge76 is unchanged; no native lead-reserve regression or return of per-pane lead rules is introduced.
- It would be FALSE to say exact center24 is mathematically impossible merely because coordinates are integer DIPs: under the simplified14px circle model,y17 would center at24. I do NOT accept that impossibility argument. I also do not require an unplanned y17 experiment merely to chase fixture/native optical identity after the prescribed18 correction. Actual macOS-painted diameter/optical bounds are approximate and platform-owned.
- This acceptance is NOT “sub-pixel,imperceptible” rhetoric and is not a blanket tolerance for renderer misalignment. It specifically recognizes the2px fixture/native diameter difference while honoring the requested native18 position. Native pixels are not included in CDP screenshots; no claim that this auditor viewed a native-pixel image or exercised hardware is made. The controller-provided1px observation is accepted,not rerun.

**OS drag:** report:179 records cliclick dd:1196,116 dm:1316,116 du:1316,116 with window initially296,96. Relative start900,20 is in the48px empty band,right of the awesomebar and away from existing controls. Before/after screen position296→416 at unchanged96 demonstrates the requested120px OS window movement. This is materially stronger than source app-region classes,and closes the prior drag evidence gap. Previously credited awesomebar/Cmd-K/Settings-inert CDP observations remain accepted; they are not rerun.

The report/commit phrase “improvement” at report:178 is numerically imprecise under its own updated14px model: y16 gives center23,absolute error1; y18 gives25,also absolute error1,opposite sign. The conditional plan correction and fixture/native geometry explain acceptance; an alleged reduction of1 to1 does not. This wording is a report accuracy minor,not a reason to undo the correct prescribed native constant.

#### Saved-theme residual — not a new foundation bug accusation

The visible Dark label is a concrete STORE-backed observation: frozen components/settings/ThemeRow.tsx:43 derives selectedId from settings.theme; :94–95 derives triggerLabel from that selected option; :147 renders it. Thus the two light Settings captures are not merely a metadata omission: their visible current-settings theme isDark while rootTheme sayslight. They establish rendered light styles but not the saved-light/store/root agreement specifically requested by CP10 F03.

I do NOT infer that the production ThemeRow save is broken. A root-only capture override is one possible explanation [INFERENCE]; frozen capture/renderer-api.ts:102–103 has an existing setThemeAttr hook that changes only the root dataset. The capture report does not record the actual theme-setting method or saved/store readings,so that cause is not proved. The remedy is capture-state evidence using the real theme setting,not speculative product edits or reopening Task4. Cold restart/reload/native guards remain the separate Task14 carries and are NOT required for this residual.

### Gaps (must close before the plan is complete)

- **Medium, T6-F03, Task6S6 / CP10:56,62,93 — saved-theme capture agreement remains unproved and visibly inconsistent in light Settings frames.** In WS/shots/T6/t6r2-settings-rail-light.png and t6r2-tabs-settings-light.png,Theme=Dark while rootTheme=light. JSON records no settings/store/persistedTheme at all. Complete the targeted capture run by setting/saving Light or Dark through the actual ThemeRow/saveSettings path before each theme group,and record the actual current-settings choice,settings IPC readback and root theme alongside current layout/navbar/page state. Regenerate the affected frames and update WS/task-6-report.md:113–145 and provenance. No app feature change,new compiler/full-suite run,native y17 change,Task14 reload/cold restart or102-cell matrix is requested. If the controller elects to carry this saved-state evidence to Task14,that needs an explicit ruling; this audit does not silently delete the prior F03 requirement.

The former F03 wrong-tabs/wrong-Settings/missing-dark issues ARE CLOSED. F04 native18/1px/OS-drag acceptance IS CLOSED. Minimal current residual is only capture saved-theme agreement.

### Claims not backed by evidence

- “All prior F03 acceptance is complete”: current layout/page/rendered-theme capture issues are independently corrected,but saved-theme/store/root agreement is not. Both light Settings screenshots visibly select Dark; root-only JSON cannot establish saved light/dark state.
- Report:117 calls chatShellHidden/navPadLeft “store state”. They are useful DOM integration observations,not direct saved-settings/store fields. Actual tabs picker selection and empty branch are separately positive store-layout evidence.
- Exact native center24,or mathematical impossibility of24 for14px integer-DIP circles: neither is proved. The recorded residual1 is explicitly accepted for the native-platform/fixture geometry reasons above,not called zero or impossible.
- Report:178 / commit prose calls absolute1px→1px an improvement; that claim is not true under the stated14px diameter model. Keep the accepted y18 result but describe the geometry accurately.
- Report:144 labels chat-D1-dark.png “derived”; that approved file exists and was VIEWED. Use the real comparator identity in the final evidence ledger.
- Report tests/tsc/vitest/e2e are not independently exercised at0aacdb051 by this auditor. The changed geometry expectation is independently read,not run. Final controller verification remains pending; no unauthorized check is launched.

### Open deferred items

All CP10 carries remain,not silently closed by this native/capture checkpoint:

1. **Task14 C02:** actual520/240 runtime sidebar cap,main floor,WorkPanel collapse/reopen boundary rail/island10px difference,restoration and saved/store/root agreement; no shadow cap.
2. **Task14 C05:** successful real renderer reload with persisted island; separate native cold restart/rebuilt guard/directRPC/ElectronIPC invalid-write/corrupt-boot acceptance.
3. **Task14:** actual long migrated form dialog light/dark,max80vh,body-only scroll/pinned footer/right-close/submit/cancel; no vendor chooser substitute.
4. **Task14:**17×3×2=102 base comparisons plus named gallery states,derived-comparator policy and full per-shot source/build/font/zoom/saved/store/root/state identity. Current JSON still lacks exact committed-build/hash,font-family/zoom and direct saved/store fields; full provenance remains final carry. The concrete saved-theme mismatch above is the existing targeted F03 residual,not a newly invented full matrix requirement.
5. **Task8 T8-L01/L02:** replace null NavTabs before release with logo/3pills/overflow,and complete bench chip/bell/gear/avatar in tabs,rail,island,reconciling fixed rightmost WorkPanel-toggle seat. Task7 owns removal of old --nav-rail-width after migration,R1.
6. **Task13 T13-L03:** Settings nested Fcode/Settings/General path and subsequent subpage breadcrumbs; actual Settings workbench/embedded/palette/onboarding styles remain pending.
7. **Final acceptance:** saved fontScale1.3/chosen font/native-control/locale/picker/plugin/bounds/draft-scroll-streaming checks; exact compiler0/full/i18n/e2e28/28; design-system/§11/ADR convention; R12 user acknowledgement.
8. **Cleanup/minors:** inherited source-test/dead-class/literal/future-owner cleanup,no CHANGELOG,superseded base.css:175–181 rules; C06 remains foundation-closed by A8. Add accurate native “same magnitude/opposite sign” and real D1-dark comparator wording to final evidence cleanup,not code rework. Windows/Linux hardware stays truthfully UNVERIFIED as permitted.

### Verdict: GAPS FOUND

**TASK 6 GATE: FAIL.** Only remaining scoped blocker: F03 saved-theme/store/root capture agreement. The eight new frames genuinely fix actual tabs/Settings and supply both missing dark layouts; do not repeat the previous high-severity mislabelling accusation. F04 is CLOSED: prescribed y18 is committed,the1px native residual is acceptable under the12px mock/14px native geometry judgment,and actual empty-band OS movement is recorded.

**DESIGN FIDELITY (scope: Task 6 surfaces): NOT CONFIRMED — targeted saved-theme acceptance still incomplete.** Current rendered-navbar/source corrections and native integration are accepted; whole-page/final matrix approval is not implied. Minimal closure is saved Light/Dark capture agreement with truthful per-shot state/provenance,not another native geometry change.

**Counts:**16 groups=12 CLOSED/1 OPEN(Medium)/3 later-owned; plan5 DONE/1 PARTIAL/8 PENDING,finalreviewPENDING. **8 actual+7 approved PNGs VIEWED;0 tests/tsc/vitest/build/full-suite/e2e/UI-launch/native-smoke commands run.** Only the explicitly authorized supervisor-checkpoint-11.md is written; no implementation/ledger/context/provenance/design/main-checkout edit,commit or dispatch.

