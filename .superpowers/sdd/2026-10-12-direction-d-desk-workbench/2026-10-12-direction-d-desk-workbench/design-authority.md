# Design authority (user mandate R10 — applies to EVERY task, supersedes plan/brief text)

The user requires the build to follow the agreed design 100%:
`/Users/mac/.gstack/projects/Coale-Tech-fcode/designs/all-pages-20261012/` — `gallery-d.html`, `kit-d/D-SPEC.md`, `kit-d/D.css`, `pages-d/<page>/{fragment*.html,variant-D*.png,notes.md}`, `../approved.json`.

## Precedence
1. Rendered design (PNGs) > fragments/D.css/D-SPEC > plan/brief text. Where the brief's number/colour/structure differs from D.css or the page fragment, the DESIGN WINS. Copy the value from D.css/fragment (cite file:line in your report), do not approximate or "round" to an existing token — add/re-point a token if needed.
2. The plan's snippets that conflict with the design are superseded. Known conflicts (rulings R11a–k, all resolved in favour of the design): 
   - (a) navbar: use the design's reserve/grid (78 reserve, 56 and 300 spec from D-SPEC/D3 shell + right cluster), not search 240–480.
   - (b) D1 tabs: three primary tabs + overflow menu, not every destination as a pill tab.
   - (c) D2 rail has the expanded 220px state; do not drop it.
   - (d) D3 island: permanent 256px global sidebar on Bench/Build too, label 10px, inner 12px; not "hide on Bench/Build".
   - (e) Activity: pure Activity when review closed + Review panel 340px when open; tool node 30px circle (not 7px); composer min 56 / D3 max-width 760.
   - (f) list rows: multiline Scheduled/Pulls/Notifications as in mocks; Kanban stripes on column headers (not card-level).
   - (g) Notifications is a FULL inbox page, not a popover.
   - (h) Settings: r8 cards / nav 28 / 13px / group 10px / dirty Save-Discard state as rendered.
   - (i) palette: 14px / 36px rows.
   - (j) FileBird: kebab-only frame as approved (no reload/external buttons).
   - (k) captures: all 17 pages × 3 layouts × light/dark base cells + the states in the gallery (not the 78-shot shortcut).
3. APPROVED DEVIATIONS ONLY (user/controller approved; everything else must match): light accent fill `#2578ab` (+ derived hover) instead of `#2E8AC2` (AA contrast); dark-theme on-accent glyph/knob colour is dark (`#0a1f2e`) because white on `#42a2d9` is 2.84:1 (R12 — controller ruling, flagged to user in final message; reversible by one token: `--ds-accent-foreground` dark). Do not extend these.
4. Missing comparators (Projects page, 4 D2-dark base PNGs, onboarding steps 2–3, some WorkPanel/Advanced tab contents): derive from the approved light/other-theme source via the same tokens; list each such derivation in your report as "derived, no mock".

## Per-task evidence required in the report (supervisor audits it)
- "Design fidelity" section: for every surface touched, list design reference (file) → implementation (file:line) and each remaining difference (there should be none besides approved deviations).
- "Capture provenance" block for every screenshot you cite: commit SHA, build time, window CSS size, DPR/zoom/font scale, locale, layout+theme (store value AND `document.documentElement` attributes), state shown. Compare against the matching `pages-d/<page>/variant-D*.png` (same layout, theme, state) by VIEWING both PNGs; state MATCH/MISMATCH per item. Mock PNGs are 1440×900; rig output is 2400×1600 — say how you normalised (do not claim pixel parity).
- Verified reference values: WS/supervisor-checkpoint-2.md lines 29–145 hold the supervisor's extracted checklist (re-verify against D.css; it is a guide, not authority).
