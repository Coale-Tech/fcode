# Fcode Single-Editor Consolidation Implementation Plan

> **For agentic workers:** Use `subagent-driven-development` or `executing-plans` task-by-task; checkboxes track execution. **This document is a plan, not authorization to remove the shipped Code tab.** No product code was changed when it was written.

**Goal:** One reliable in-app editor, reached from Chat's Files work-panel view; retain agent-change review and Frappe-specific workflows without a second Code destination.

**Architecture:** Promote a **source-owned CodeMirror File Manager** as the editor; keep native Review as the single agent-change history and Browser as a separate work-panel tool. Rehome DocType discovery into Bench. Only after the replacement works in a packaged build, remove the Monaco Code page and its truly orphaned dependencies. Do not put Monaco inside File Manager merely to preserve a brand of editor.

**Tech Stack:** Electron, React, TypeScript, CodeMirror 6, plugin `WebContentsView`, Node IPC, pnpm, `node --test`.

**Spec:** Product contract and capability matrix in this document; no separately approved spec exists. Approval to execute this plan is a separate gate.

## Product contract / design decision

- Primary nav: **Chat / Build / Bench**. The right work-panel tools remain **Files / Browser / Review**. `Mod+2` opens Files without leaving Chat; existing `Mod+3` Build and `Mod+4` Bench remain stable. Files can maximize the panel for focused editing, then restore it to work beside Chat. No second editor route.
- A chat file link opens the same canonical Files editor (subject to the existing HTML→Browser and session-scratch fallback rules). Review continues to show **successful agent Write/Edit records**, their recorded hunks, and snapshot-specific rollback; it does not represent all Git changes or automatically approve code. Saved human edits are not attributed to the agent.
- File Manager remains the only in-app code editor. Keep CodeMirror's find/replace, multi-cursor, folding, previews, create/rename/move, multi-root selection, and conflict confirmation. Add a keyboard quick-open and at most eight open-file tabs **only if** the one-file editor cannot serve a representative multi-file task; before removing Code, that task must pass with no lost selection, scroll position, dirty buffer, or undo history. Do not promise LSP/IntelliSense: Code currently configures Monaco's generic editor, not a Frappe LSP.
- Put DocType browse/search under Bench and link it to **the existing Bench one-shot `migrate` action**, not a second command runner. Bench currently chooses its default site (`BenchPage.tsx:415-435`); add an explicit site choice before any migration when a bench has multiple sites. The current `gitScanDoctypes` assumes `apps/…` is in the bench root's Git repository; test against a real bench with app subrepos before reusing it. The dirty-JSON badge is only a Git heuristic, **not proof that migration is required**. Do not carry forward a misleading indicator.
- Do **not** port Code's `git restore`-based Keep/Revert all into Review: `git restore` restores the whole file since Git state and could discard unrelated human edits, unlike Review's per-snapshot rollback. If users need general Git diff/revert, design that separately with explicit scope and confirmation.
- Because an editor is now a core feature, its shipped source and updates must be owned and reviewable in Fcode; a disabled/crashed plugin must not fail silently. Prefer a pinned, source-built Fcode fork with a distinct plugin ID over editing compiled upstream `views/assets/index.js` or letting marketplace updates overwrite local functionality. Preserve the current host file viewer as an explicit read-only fallback until editing is restored. Resolve project-with-no-chat-session behavior before the cutover: Files must have an intentional accessible entry point, not a disabled work-panel toggle.

### Alternatives checked

- **Keep Monaco as the sole host editor; make File Manager preview-only:** minimizes plugin criticality, but makes the current chat file-link destination and its rich file operations a second, less useful surface. Viable fallback if the source-ownership/security gate fails.
- **Use the existing compiled File Manager unchanged as the sole editor:** smallest apparent diff, but its source is outside the checkout, it can be disabled/replaced, and it currently keeps one file open. Reject as an unsafe release cutover.
- **Chosen: source-own the existing CodeMirror editor and remove Code after gates:** preserves the Chat-adjacent workflow and specialized previews while eliminating duplicate editing. Costs a maintained fork, tab/profile migration, and explicit recovery design. No need to transplant Monaco wholesale.

## Evidence / capability matrix

| Workflow | Today | Cutover / gate |
| --- | --- | --- |
| File editing | `src/pages/CodePage.tsx` Monaco **and** bundled `pi.file-manager` CodeMirror | One source-built File Manager editor. Existing plugin supports save conflict, atomic write, media/CSV/JSON/SQLite viewing; no blind Monaco replacement. |
| Browse/open from chat | `src/hooks/use-preview-target.ts`: project files prefer File Manager, HTML uses Browser, scratch files use host viewer | Preserve resolution, multi-root selection, and missing-plugin fallback; link opens correct file once. |
| Agent edits | `src/components/workpanel/ReviewTab.tsx` + `ReviewChangeCard.tsx`: session tool records and snapshot rollback | Keep these; Review and Files switch without losing unsaved human edits. |
| Code-only review | `src/components/code/ChangedPanel.tsx`: compares current file to `HEAD`, then `gitRestore` | Retire, not fold destructive whole-file restore into Review. |
| DocTypes | `src/components/code/DocTypeTree.tsx` browse, schema/controller/form/tests, optional migrate | Move to Bench once scan and site semantics are proven; keep file-opening path to Files. |
| Fast navigation | Code `Cmd+P`, up to eight file tabs; File Manager has project filename search and one open file | Test workflow first; add true quick-open/tabs only for observed gaps; maintain keyboard focus with Chat. |
| Availability | `src/stores/slices/work-panel-slice.ts` requires an active session; `PluginViewTab.tsx` may fail to open plugin view | Provide recoverable error and working entry from project context even with no session. |
| Source/safety | `resources/plugins/pi.file-manager/UPSTREAM.md` vendors built view only; plugin uses Node `fs` and its own containment/audit | Fork source, pin/rebuild, threat-review selected-root and external-file exceptions; preserve/strengthen existing atomic write and mtime+size conflict check. Do not remove host protections on agent writes. |

**Independent perspective:** The localhost `laya-advisor` HTTP endpoint refused connection; its CLI invocation timed out. An independent model critique challenged making a third-party compiled-only plugin the sole editor, losing a fallback, and mixing snapshot rollback with `git restore`. These are valid cutover gates. Its proposed universal write broker, telemetry system, and mandatory feature flags would substantially broaden this request; do not add them without a demonstrated need. Its assertion that users have project-wide Monaco language services was not established by the current CodePage implementation.

## Global constraints / review focus

- Changes must leave Chat file links and Browser routing intact, including secondary project roots, session scratch/attachments, HTML, and missing file refs.
- Saved human edits, dirty editor buffers, and agent changes must never be silently overwritten by a Review rollback, a root/workspace change, or a view reload. Existing plugin has optimistic locking; verify host/plugin tab lifecycle rather than assuming it preserves buffers. When a human changes the **same file** after an agent edit, snapshot rollback may correctly refuse with a conflict; it must not discard that human change.
- Plugin fork must build from checked-in source at a pinned revision in CI and ship correct executable assets on macOS, Linux, Windows; account for the marketplace-updatable upstream plugin ID and previously saved `plugin:pi.file-manager/manager` tabs.
- Plugin file writes currently bypass the host's permission gateway; a security review of containment, credential exclusions, secondary roots, external chat artifacts, and the source-built fork is a **release gate**, not an excuse to claim host approval covers them.
- Tests must exercise behavior, not assert source strings. Retire Code-only source-text tests rather than re-pin them to the new path. Preserve `fs/index` used by composer autocomplete.

## Tasks

### 1. Own the editor before promoting it

**Files:** `apps/desktop/resources/plugins/pi.file-manager/UPSTREAM.md` (retire old bundled copy after migration), create `apps/desktop/resources/plugins/fcode.files/` with `views-src/`, `main.js`, `manifest.json`, `views/`, `LICENSE`, `UPSTREAM.md`; `apps/desktop/test/bundled-plugins.test.mjs`, release packaging config; upstream reference: `https://github.com/Tioit-Wang/pi-desktop-plugin-file-manager/tree/v0.5.2/views-src`.

- [ ] Import the pinned upstream view **source** and its build inputs into the Fcode-owned `fcode.files` plugin; keep MIT license and provenance. Retire only the old **bundled** copy after migrating old tab IDs; never uninstall a user's marketplace plugin. Do not patch the 1.3 MB compiled view by hand or allow marketplace updates to replace the Fcode fork.
- [ ] Confirm reproducible build of the checked-in plugin source and packaging of its `main.js`, manifest, view, and bridge on all supported platforms. Add a behavioral packaging test that opens a project file and saves it through the released asset, plus a provenance/build check.
- [ ] Threat-review the fork's existing Node-fs boundary and run actual path-containment, symlink, credential, multi-root, and external-artifact tests. Keep existing conflict confirmation and atomic saves. If ownership or containment cannot be established, **stop here; do not remove Code**.
- [ ] Check: `node --test apps/desktop/test/bundled-plugins.test.mjs` and the plugin's source-level `verify`/typecheck; smoke an installed dev build, not just the source tree.

### 2. Make Files a credible primary editing surface

**Files:** source-backed File Manager `App.tsx`, `components/EditorPane.tsx`, `lib/editor.ts` and relevant bridge files; host `src/components/workpanel/PluginViewTab.tsx`, `src/stores/slices/work-panel-slice.ts`, `src/lib/work-panel-tabs.ts`.

- [ ] Before adding features, run one representative task: open file A from Chat, edit and save, open B from project search, return to A, switch Files→Review→Files, then maximize/restore. Verify correct path/root, typing focus, preserved work, and conflict treatment after agent edits A on disk. Record the specific gap; do not add a second editor implementation.
- [ ] If the task fails for multi-file use, add focused quick-open (`Mod+P` while Files is active) and capped open-file tabs in the **source** plugin, maintaining per-file dirty state and navigation guards. Its current `App.tsx` stores a single `openFile` and `dirty`, so swapping labels alone is not sufficient. Verify keyboard focus does not steal `Mod+P` from Chat when Files is inactive.
- [ ] Ensure selecting Review, switching workspace/root, closing the panel, plugin crash/re-enable, and editor reload never silently drop an unsaved buffer; offer Save / Discard / Cancel where the state can still be recovered. Verify external agent edits prompt on stale save and refresh a clean buffer. If a crash can lose a dirty buffer, preserve a local draft before making Files the sole editor.
- [ ] A disabled or failed plugin must show a specific recovery action and retain the host's read-only file viewer; do not claim an editing fallback exists when it does not. Solve project-without-session entry (either a project-scoped work-panel context or an explicit transition to a session) before removing Code.
- [ ] Check: source plugin behavior tests and an Electron smoke of two files + Review switch + conflicting agent write + plugin restart. Reject a broken save or lost dirty buffer as a blocker.

### 3. Preserve Frappe work without preserving a duplicate editor

**Files:** `apps/desktop/src/pages/BenchPage.tsx`, `apps/desktop/src/components/code/DocTypeTree.tsx` (move/rework), `apps/desktop/electron/main/ipc/workspace-ipc.ts` (`gitScanDoctypes` and migrate flow), related bench tests.

- [ ] Exercise DocType discovery on a real bench whose apps have their own Git repos. Correct the scan if it returns no entries or wrong dirty status; label the result as a heuristic, not migration truth. Reuse Bench's existing `migrate` action/confirmation/output, with explicit site choice when several sites exist and no implicit mutation during browse.
- [ ] Place the app→module→DocType browser inside the selected Bench detail; retain schema/controller/form/tests links to the canonical Files opener. A file in an app's own repo, including a second registered project root, must open the intended file rather than an empty editor.
- [ ] Check: one real bench with at least one DocType, an edited JSON, and a selected site; a second test for an empty/unavailable bench. No migration command during an observational test; use a safe test site for the action smoke.

### 4. Cut over navigation and review semantics

**Files:** `apps/desktop/src/components/NavRail.tsx`, `src/features/app/AppShell.tsx`, `src/stores/app-state.ts`, `src/stores/slices/interaction-slice.ts`, `src/features/app/useAppShellRuntime.tsx`, `src/hooks/use-preview-target.ts`, `src/lib/work-panel-tabs.ts`, `packages/shared/src/keyboard-shortcuts.ts`, `packages/i18n/src/locales/*/index.ts`.

- [ ] Expose a clear Files launcher and panel maximize/restore from Chat. Retarget `Mod+2` and its user override to **Open Files**; do not silently reuse a customized Code binding for a different action without describing the migration in Settings. Keep `Mod+3` and `Mod+4` as-is. A historical `page: "code"` in nav history lands safely in Chat with Files active; no dead route or back/forward loop.
- [ ] Migrate stored old File Manager tab IDs/locations and update chat/project artifact openers so there is exactly one file destination. Review remains the existing `ReviewTab` with `ReviewChangeCard` rollback; it never invokes `gitRestore` or claims to show human-only edits. The native host file viewer remains for scratch/attachments and plugin failure.
- [ ] Test keyboard-only Chat→Files→Review→Files→Chat and file-link routing with a primary root, secondary root, HTML, scratch attachment, and missing file; include no-session and plugin-disabled cases. Exercise both an existing user profile and a fresh install.

### 5. Remove the duplicate only after replacement gates pass

**Files:** `apps/desktop/src/pages/CodePage.tsx`, `apps/desktop/src/components/code/ChangedPanel.tsx`, `FileTree.tsx`, `DocTypeTree.tsx` (move/rework), `monaco-theme.ts`, `apps/desktop/src/styles/code.css`, `apps/desktop/package.json`, `pnpm-lock.yaml`, Code-only API/IPC in `src/lib/api.ts` and `electron/main/ipc/workspace-ipc.ts`, shared IPC definitions/whitelist as appropriate, `apps/desktop/test/{t11-code-open-files-conflict,t12-monaco-theme,e22-fs-index-truncation,t03-keyboard-shortcuts}.test.mjs`, `docs/fcode/README.md`.

- [ ] Search actual consumers of each symbol/channel first. Delete orphaned Monaco theme/worker/dependencies and unsafe Code-only `gitShow`/`gitRestore` handlers. Keep any general `fsIndex` / `fsWrite` / `gitBranch` APIs still used by composer, host integrations, or tests; remove contracts only when truly unused. Do not rewrite historical release notes; add a new release note describing the moved workflows.
- [ ] Remove stale source-text tests tied to Code and add consumer-visible regression coverage in the owning feature's tests: open/edit/save; dirty-buffer conflicts; agent rollback vs unrelated human edit; DocType→Files and site-scoped migrate; nav/history/settings migration. Run `pnpm typecheck`, `pnpm lint:biome`, `node scripts/check-architecture.mjs`, `pnpm -C apps/desktop test`, `node scripts/check-legal.mjs`, plugin verify, and the relevant packaged Electron smokes **once after integrated edits**, not during independent tasks.
- [ ] Before deleting the Code route, smoke the replacement in a packaged build: Chat→File Manager→save→agent edit→Review diff→snapshot rollback; manually saved edits survive, and a later human edit to the **same file** causes safe rollback refusal. Open Browser and a DocType from Bench. Restart with a saved old profile, disable/re-enable File Manager, and verify a clean install. Then remove the Code nav item and route, rerun the smoke and full integrated checks on the final build.

## Release gates / stop conditions

1. A normal edit and a two-file task complete in the packaged Fcode build with one canonical editor; switching Review or roots cannot lose a dirty buffer.
2. Agent snapshot rollback leaves an unrelated human edit intact (or safely refuses if it shares the same changed file); the dangerous whole-file `gitRestore` action is gone from this workflow.
3. Frappe DocType browse/open and site-scoped migrate operate against real app repos; the UI never equates an uncommitted JSON edit with required migration.
4. Missing, disabled, or crashed editor shows a recoverable state and a working read-only viewer; no empty panel disguised as success.
5. Source-backed editor artifact, third-party license, plugin update identity, path containment, and release packaging are verified. No source ownership = no Code removal.

**Scope deliberately excluded:** LSP, generic SCM/Git revert UI, a global file-write broker, analytics/telemetry infrastructure, and a parallel Monaco-in-plugin editor. Reconsider any only when an observed task fails without it.
