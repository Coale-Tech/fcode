### Coverage

**Task 13 lane audit — frozen commit `7d2164664576ac918f1aa60a77a0c172193cfd50`, base `f7f224a6a`, branch feat/direction-d-t13.** Commit identity and 19-file delta independently inspected with read-only git. Canonical design-authority.md, implementer-rules.md, context.md, progress.md, CP2 checklist, CP13 format, plan T13/T14, lane brief/report read. R11 supersedes conflicting brief snippets. Paths below are relative to lane `apps/desktop/`; WS means canonical `.superpowers/sdd/2026-10-12-direction-d-desk-workbench/`; S means the lane WS `shots/T13/`; R means `/Users/mac/.gstack/projects/Coale-Tech-fcode/designs/all-pages-20261012/`.

|Task|Status (DONE / PARTIAL / MISSING / PENDING)|Evidence or gap (file:line)|
|---|---|---|
|T13 S1 — Settings workbench / SettingsPage.tsx, settings.css|PARTIAL|240px token, 28px nav items, 13px icons, 10px labels and active tint are implemented. But floating nav/content panels and r8 section cards are absent: settings.css:45–53,128–137,333–377,396–405; primitives.tsx:54–65. Actual captures still show the old full-window flat Settings layout.|
|T13 S1 — Appearance/AI/Advanced/Permissions reference rows and states|PARTIAL|44px row minimum and 11px descriptions exist (settings.css:914–945). General still has dropdown Theme, legacy font-size names/slider and expanded Network/Power; AI/Advanced matching page/state matrix missing. Permission staging covers only two dropdowns (SettingsPage.tsx:509–550), not the rendered dirty Enter-to-send/defaults state.|
|T13 S2 — RavenPage.tsx|PARTIAL|Ready branch adds a 48px header and retained native host/ResizeObserver at RavenPage.tsx:43–60,65–117. Disconnected branch remains old unframed empty state at :122–147. Reload only fetches settings (:90–95), not native reload. Native all-layout rect/getBounds evidence missing.|
|T13 S2 — FileBirdPage.tsx|PARTIAL|Header/kebab/native host at FileBirdPage.tsx:50–113; observer :31–48. Connected pill is unconditional, idle/transferring states unreachable; Reload hides/re-adds same view, Open in window only closes menu (:82–103).|
|T13 S3 — SearchDialog.tsx / palette partial|PARTIAL|Actual owner is overlays.css rather than named session-search.css; reasonable file adaptation. 36px/14px rows and footer exist (overlays.css:100–124; SearchDialog.tsx:527–534). Wrong 560px width/320px list cap versus page override 580px/440px; missing matching migrate/four-group proof. New legend is hardcoded English and advertises unsupported Tab preview.|
|T13 S4 — Onboarding component + partial|MISSING|Only workbench.css restyled; unchanged OnboardingChecklist.tsx:119–159 still maps a variable-length checklist. Approved provider wizard and last/Ready-to-code state are not implemented. Decision 4 waives only absent mocks for steps 2–3, not steps 1/4.|
|T13 S5 — Settings search|PARTIAL|settings-general-light-island.webp and command-palette-dark-rail.webp visibly show layout→Navigation layout/General, alongside Search failed/Retry. Report-cited command-palette-dark-query-layout.webp is an unrelated POS Settings screen. No exercised selection/navigation trace.|
|T13 S5 — plugin theme precedence|PARTIAL|Import-order claim alone is not runtime computed-style proof. Revised palette/native head styles use --da directly; no supplied plugin:* screenshot/readback establishes that plugin accent wins.|
|T13 S5 — captures / T6-F03 saved-theme carry|PARTIAL|All 29 files viewed (9 .png-named files decode as WebP +20 .webp). Numerous labels are wrong, duplicates/unrelated app screenshots exist, no per-shot saved/store/root transcript or build identity. Carry NOT closed.|
|T13 S6 — Commit|DONE|Read-only git log confirms exact conventional subject `style(settings,palette,onboarding): direction D`, 7d2164664. Report still says commit pending (:3).|
|T13 — New locale-key parity|DONE|Independent Node transpilation/evaluation of `git show 7d2164664:packages/i18n/src/locales/<locale>/index.ts` checked all ten added key paths across all nine locales: 90/90 nonempty values. `settings.unsavedChanges` is correctly nested, not pluginLauncher. Hardcoded footer remains a separate violation.|
|T14 / integration acceptance|PENDING|Final matrix, post-merge native bounds, compiler exactly0/full-suite/i18n/e2e/docs and accepted prior carries are not certified by this isolated lane.|

**Verification exercised:** read-only git log/diff, committed-locale object evaluation (90/90 added paths), SHA256 comparison of nine PNG-named captures, source/reference reads, direct viewing of all 29 lane images plus approved Settings General light/dark, AI, Advanced, Permissions dirty, palette light/dark, onboarding provider/last, Raven disconnected and FileBird browsing references. No tsc, tests, full suite, build or app launch performed; these were not requested. No report-only test count is promoted to independent evidence. No tests changed in the 19-file delta, so no newly introduced source-text tests are alleged.

#### Actual image audit — every available file viewed

Reference images are 1440×900. PNG-named lane files are reported by the decoder as WebP at2400×1600; newer WebPs visibly show1024-wide images with clipped/cropped content. Report's 1240×880×DPR2 cannot equal2400×1600 (it would be2480×1760). I compare semantic composition, not pixels; unknown crop/zoom/font scale cannot be normalized into a parity claim. Every row is MISMATCH / INVALID EVIDENCE, not a whole-page MATCH.

|Actual image(s), individually viewed|Closest approved reference viewed|Observation|
|---|---|---|
|settings-ai-light-tabs.png|settings-ai/variant-D1.png|Actually dark Permissions & defaults, not AI Agents/light. Flat cards and wrong shell.|
|settings-general-light-island.png; settings-general-light-rail.png; settings-permissions-dark-tabs.png; settings-permissions-light-tabs.png|General D2 / Permissions dirty D1|All four SHA256 identical (`047bb152…`): dark blank generic Settings content, not named pages/layouts/themes.|
|settings-general-dark-tabs.png; settings-general-light-tabs.png|General D1-dark / D2|Identical SHA256 (`6714f858…`): dark General with Icon rail selected, dropdown Theme and expanded sections.|
|command-palette-dark.png; command-palette-light.png|palette D2-dark / D1|Both visibly dark empty-query command results, not light/migrate/four groups. Old footer lacks Tab chip, so cannot certify final footer build. Hashes differ; not claimed byte-identical.|
|test-light-rail.webp|palette D2-dark|Dark empty-query palette; test-light label false. Footer with Tab visible, no migrate state.|
|command-palette-dark-rail.webp|palette D1|Actually light layout-query palette with Settings result and Search failed/Retry, not dark rail proof.|
|settings-general-light-island.webp|palette D2-dark|Actually dark query layout palette, Search failed/Retry and Settings result, not General/light/island.|
|settings-general-light-rail-v2.webp|palette D1|Actually light empty-query palette, not General.|
|settings-general-dark-rail.webp|General D2|Actually light General, theme visibly Light, clipped after first preview card.|
|settings-general-dark-tabs.webp|General D1-dark|Dark General/Top tabs selected, cropped, flat old Settings layout; no three-panel/card framing.|
|settings-permissions-dark-tabs-v2.webp|Permissions dirty D1|Dark clean Permissions, cropped, no staged dirty state or framed cards.|
|command-palette-light-empty.webp|palette D1|Actually light General capture, not palette.|
|command-palette-light-query.webp|palette D1|Unrelated POS Past Orders transaction-list dialog; individually re-read to resolve exact identity.|
|settings-permissions-light-rail.webp|onboarding D3|Actually Chat empty home/checklist 4/8, not Settings.|
|settings-ai-agents-light-rail.webp; filebird-page-light-island.webp|FileBird D3 / AI D1|Both show FileBird-selected shell with blank native area, no visible d-page-head. Cannot certify either AI or FileBird chrome.|
|raven-page-light-island.webp|Raven disconnected D3|Old large Raven empty title/card, lacks approved persistent48px site/status/action header.|
|onboarding-light-island.webp; onboarding-dark-island.webp|onboarding D3 and last D3|Chat home/checklist cropped behind toolbar/composer, not provider wizard or ready state.|
|settings-permissions-dark-tabs.webp|Permissions dirty D1|Unrelated Select POS Profile screen (light).|
|chat-onboarding-light-island.webp|onboarding D3|Unrelated Retail POS sales screen.|
|command-palette-dark-query-layout.webp|palette D2-dark|Unrelated POS Settings page. Report's primary search proof does not show Fcode.|
|command-palette-dark-query.webp|palette D2-dark|Unrelated POS Pending Approvals page.|
|command-palette-dark-query-v2.webp|palette D2-dark|Unrelated POS Sync Status page.|

Every available image was viewed. Filename/state mismatches above are observed evidence, not inferred from filenames.

### Gaps (must close before the plan is complete)

- **High, T13-F01, S1 — Settings workbench absent.** Implement actual two floating panels,12px gutters/r12 outer surfaces and r8 section cards with headers/borders/dividers. Current settings.css:45–53,128–137,333–377,396–405 preserves full-window old layout; primitives.tsx:54–65 lacks card framing. Remove superseded rules/comments instead of appending a second system. Approved General D2 and AI/Advanced D1 refs show the missing structure clearly.
- **High, T13-F02, S4 — unapproved onboarding substitution.** OnboardingChecklist.tsx:119–159 maps up to eight bench/host checklist rows, not four wizard stages; no168px sidebar/content pane, provider radios/key Verify/success, footer Continue, or final summary/Start coding. workbench.css:608–613 explicitly says approximation. R/onboarding/notes.md:9–32 and viewed provider/last PNGs approve steps1/4. Neither decision4 nor design-authority.md approves replacing these with a checklist. Implement reachable real flows, derive only unmocked2/3 and label those honestly.
- **High, T13-F03, S2 — fake native frame actions/status.** FileBirdPage.tsx:57–61 always says Connected; successful service visibility is not an SFTP connection. Idle/transferring keys/classes are dead. Open in window at:97–103 is a no-op. Reload:82–87 only detaches/re-adds the view (electron/main/ipc/filebird-ipc.ts:140–155), not reload. RavenPage.tsx:90–95 only GETs unchanged settings and:80–84 derives Connected from enabled, not connection. Wire real existing native state/actions or implement required real IPC; never display fake functionality.
- **High, T13-F04, S2 — disconnected Raven frame missing / unshottable claim invalid.** Header is conditional on enabled (RavenPage.tsx:23,65), not proven WebContentsView connection. Disabled branch:122–147 loses frame; approved disconnected PNG retains header. The Fcode header is ordinary renderer DOM, unlike native content; CDP exclusion of WebContentsView cannot explain absent header in supplied FileBird image. Supply true renderer/native captures and rect/getBounds pairs; retain separate post-integration bounds carry.
- **High, T13-F05, S5/T6-F03 — unreliable capture provenance and saved-theme proof.** report:140–142 supplies only prose/one claimed tuple, no actual write/readback trace or per-shot build SHA/time/zoom/font scale/root/store. Four differently named PNGs are identical blank dark Settings, light/dark General PNGs identical dark, and several newer images are unrelated POS. Replace evidence with committed-build, same-state/layout/theme captures and immutable sidecars. A real dark picker is positive visual evidence but cannot prove saved persistence/readback. T6-F03 remains OPEN; no production theme desync is asserted.
- **Medium, T13-F06, S3 — page-specific palette overrides ignored.** R/command-palette/fragment.html:55 sets max-height440 and rendered card has inline width580; viewed PNGs confirm. Generic D.css560/320 is overridden by page fragment. Lane d-tokens.css:195–197 / overlays.css:31–35,80–84 retain560/320. Report:43,103 incorrectly says generic D.css wins. Match580/440 and demonstrate actual Sessions/Files/Commands/Benches query results. Focus outline is -2 inset (overlays.css:120–124), not claimed +2 offset; reconcile with rendered authority rather than brief approximation.
- **Medium, T13-F07, S3/Global i18n — new untranslated legend and misleading keyboard action.** SearchDialog.tsx:527–534 hardcodes navigate/open/preview/close/to open. Move copy to t() in all9 locales. :355–374 handles arrows/Enter/Escape, not Tab preview; the added legend must correspond to an actual preview action. aria-hidden does not exempt visible strings from translation.
- **Medium, T13-F08, S1 — incomplete dirty state/error handling.** SettingsPage.tsx:115–119 treats any pending key as dirty even when restored to saved value;:234–251 swallows toolApprovalModeSet failure and clears pending state as if saved. :439 uses Cancel rather than required Discard. Only two permission rows stage; approved dirty Enter-to-send row and other changed defaults remain instant-save. Complete coherent dirty/save/discard model without suppressing failures; add smallest real behavioral checks (none added in this commit).
- **Medium, T13-F09, S1/GC — duplicate primitives and raw controls.** settings.css:3888–3966 adds unused `.d-panel`, parallel `.d-btn`/`.d-pill` APIs instead of shared Button/Badge/Panel primitives; RavenPage.tsx:87–106 and FileBirdPage.tsx:64–104 use raw icon/menu buttons. Reuse existing primitives, preserve keyboard/focus/escape semantics and remove dead parallel rules. No new §11 documentation/three-callsite justification supplied.
- **Medium, T13-F10, Global token constraints — new hardcoded paint/metrics.** overlays.css:20 introduces rgba(0,0,0,.42) outside allowed token files;:26,55,81,108,183–202 uses new non-token sizes. settings.css:3848–3988 and workbench.css:608 onward likewise hardcode numerous sizes. Move exact values to tokens, not rounded approximations. Existing unrelated hex literals in settings.css:76–100 are historical, not charged as newly introduced.
- **Medium, T13-F11, S1/S5 — remaining surface/evidence coverage.** General still dropdown Theme rather than segment, legacy numeric-font replacement absent, Network/Power not collapsed (SettingsPage.tsx:460–504); matching Advanced search/Modified-only and AI collapsed state/queue/worktrees badges not demonstrated. Provide correct six-way scoped surface/state evidence, actual plugin:* computed styles, and successful search-result activation. Do not call wrong query/empty/error/POS pages MATCH. Final whole-gallery matrix belongs to T14, not a reason to certify T13 prematurely.

### Claims not backed by evidence

- DONE/all five steps completed (report:7–11) conflicts with missing wizard and partial frames/workbench; plan has six steps including commit.
- Checklist-only allegedly approved by decision4 (report:132,171): approval concerns absent steps2/3 mocks only. Provider and last mocks are present and were viewed.
- All screenshot MATCH rows (report:148–161), FileBird header DOM verification, ready Raven DOM verification and real saved-theme tuple are not backed by attached trace and contradict many viewed files. Native layer absence is not proof of an ordinary DOM header.
- Claimed 1240×880/DPR2=2400×1600 is arithmetically wrong. No zoom/font-scale/build time+SHA supplied.
- tsc0, i18n27/27, full-suite all-pass remain implementer claims, not auditor runs. Report allows work-panel/workspace failures without required base proof; these are not automatically in canonical flaky allowlist.
- Commit message claims real FileBird statuses and Open-in-window actions, but source has only unconditional connected and no-op open.

### Open deferred items

1. T6-F03 saved-theme/store/root/readback remains open for T13/14; this audit does not infer a product bug from invalid evidence.
2. Accepted post-integration Raven/FileBird/Build native bounds/live-switch matrix remains open under R14; report:173 appropriately carries it but supplies no lane native numeric proof.
3. Final102 base cells plus gallery states, actual plugin accent/locale overflow/settings focus/state preservation/platform evidence, exact compiler0/full/i18n/e2e and docs remain T14 PENDING. Prior sidebar cap/restoration, persisted island reload, native cold restart and long form-dialog carries remain unchanged.
4. Unmocked onboarding steps2/3 and Advanced/WorkPanel unprototyped contents require explicit derived/no-mock disclosure, not approval of a different mocked step1/4.

### Verdict: GAPS FOUND

**TASK 13 GATE: FAIL.** Real locale relocation/parity and partial nav/palette/header styling are credited. Missing approved onboarding/workbench, fake frame actions/status and unusable capture/provenance evidence prevent sign-off. No source/main-checkout/design/ledger mutation, test/build run, commit or subagent dispatch performed. Only this authorized report is delivered.

DESIGN FIDELITY: NOT CONFIRMED
