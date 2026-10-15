## Global Constraints

- Renderer rules from `apps/desktop/src/AGENTS.md` bind every task: use `components/ui.tsx` primitives (Button, Input, Field, SettingsToggle, SegmentedControl, Checkbox, Select, Badge, Panel, TooltipButton, HelpIcon) and `features/settings/primitives.tsx` (SettingsCard, SettingsRow). Settings pages use `SettingsMenuSelect`, never `<select>`. No inline reimplementation of a primitive. A new shared primitive needs ≥3 call sites and a §11 entry in `docs/spec/04-ux/07-ui-design-system.md`.
- Clean cutover: when a rule is superseded (46px toolbar, traffic-light lead inset, 76px chrome), delete the old rule and migrate every caller. No dual-support classes, no `d-` aliases of existing classes.
- No hardcoded colours/sizes in component CSS: use `--ds-*` / `--d-*` tokens. Hex literals live only in `tokens.css` and `d-tokens.css`.
- Every new user-visible string goes through `t()` and exists in all 9 locales (`en, zh-CN, zh-TW, de, es, fr, ko, tr, pt-BR`).
- Source edits use the `edit` tool, not sed/perl/python. omp/hashline tools take absolute paths.
- Do not push, tag or release. Do not touch `CHANGELOG.md` (integrator-owned). Do not edit design artifacts under `~/.gstack`.
- Baselines (controller-measured, authoritative; supersedes any "3 errors" wording in the plan): desktop `tsc --noEmit -p .` is EXACTLY 0 errors in this worktree — any error is a regression, never "pre-existing TS5101". Full `node --test` failures tolerated ONLY if load-flaky and passing in isolation: npm-executable, remote-host-ssh-password, remote-host-ssh-transport, codesign x2, hindsight fast-exit. Anything else is a regression; prove "pre-existing" against base checkout aaf72787a before claiming it. Plan text saying "3 baseline errors"/"baseline" means 0 errors / flaky list above.
- Frappe reference is the installed `coale_v16` source (frappe 16.35.0). The user said 16.5.1; no such bench exists. This plan touches no Frappe code.
- Accessibility: all text/interactive colour pairs introduced here must meet 4.5:1 (text) or 3:1 (non-text). The design's light accent `#2E8AC2` is 3.8:1 with white, so Task 1 uses the next step darker; this is a deliberate deviation from the mockups.

## Review Focus

1. **Embedded-view bounds.** Raven, FileBird and the Build canvas are native `WebContentsView`s positioned from `getBoundingClientRect()` via ResizeObserver (`api.ravenSetBounds`, `api.fileBirdSetBounds`, `IPC.invoke.buildCanvasSetBounds`). Switching `navLayout` or toggling the sidebar must re-report bounds; a stale rect leaves the view over the navbar or detached from its frame. Check in all 3 layouts × 3 pages.
2. **Column budget.** `SHELL_CHROME_WIDTH` (76) becomes `shellChromeWidth(layout)`. The 450px main-pane floor, work-panel auto-collapse and sidebar max must use it, including after a live layout switch.
3. **Window chrome.** macOS traffic lights (`MAC_TRAFFIC_LIGHT_POSITION`, y:16) vs the 48px navbar; Windows/Linux `WindowControls` must stay the rightmost, clickable (`no-drag`) element and the tabs layout must not run under them. Deleting the old `--ds-window-lead-inset` / `.ct-collapsed` lead-inset logic must not leave a double inset.
4. **Settings-mode `inert` shell.** `page==='settings'` renders the shell `hidden`/`inert`; the new navbar must either be outside that subtree (and stay usable) or be inert with it. Pick one and test keyboard focus.
5. **Invalid persisted value.** A saved `navLayout` of `"dock"`/`null`/number resolves to `rail`, never to a broken shell, and a write of an invalid value is rejected (`INVALID_PARAMS`).
6. **Themes.** Light, dark and every `plugin:*` theme (`data-plugin-theme`): the accent override must not defeat a plugin theme's own `--ds-accent`. Order: `d-tokens.css` before `theme-overrides.css`.
7. **i18n overflow.** Tab pills / rail labels with de/fr/pt-BR/tr strings; truncate with ellipsis + `title`, never wrap or push the awesomebar off-centre.
8. **Instant switch.** Changing the layout must not unmount `ChatSurface` (draft text, scroll position, running turn). The layout switch is an attribute + conditional nav chrome only.
9. **Primary-button contrast / focus ring** after the accent change (focus ring = `--ds-accent`, 240 call sites).

- DESIGN FIDELITY GATE (user mandate, R10): the build must match gallery-d.html / kit-d/D-SPEC.md / pages-d/* 100%. Only approved deviations: light accent #2578ab (AA), dark switch knob dark-on-accent. SddSupervisor (GPT-6.1-Sol) audits fidelity at checkpoints; every implementer's visual smoke must compare their PNG to the matching pages-d/<page>/variant-D*.png and list mismatches. Do not edit tsconfig files.
