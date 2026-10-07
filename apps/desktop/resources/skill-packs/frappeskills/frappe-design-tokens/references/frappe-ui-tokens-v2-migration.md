# frappe-ui Espresso v2 Token Migration

Adapted in part from frappe/frappe-ui (MIT): `tailwind/migrate-tokens-v2.js` (header comment).

Reference for `tailwind/migrate-tokens-v2.js` (`(v1)`; ships as the `tokens-v2`
bin, `package.json` `bin: {"tokens-v2": "./tailwind/migrate-tokens-v2.js"}`).
It renames old semantic token names (the "frappe-ui v0.1.278 era" scheme) to
their **espresso v2** equivalents — the color/typography vocabulary documented
in [frappe-ui-tailwind-tokens.md](frappe-ui-tailwind-tokens.md) — across any
text file: Tailwind utilities (`bg-surface-white`, `text-ink-red-2`,
`border-outline-gray-modals`) and raw CSS variables (`var(--surface-white)`)
alike, so it can run against a consuming app's codebase, not just frappe-ui
itself. `0.1.261 baseline` predates this scheme entirely — this codemod (and
the espresso v2 token set it targets) is v1-only.

## CLI usage

```
tokens-v2 [--dry-run] [--force] <dir-or-file...>
```

- Walks each target; only touches `.vue`, `.ts`, `.tsx`, `.js`, `.jsx`, `.md`,
  `.css`, `.scss`, `.html` files, skipping `node_modules`, `.git`, `dist`,
  `cache`, `generated`, `espresso-v2-design-tokens`.
- `--dry-run` prints `file (N)` plus each `L{line}: old -> new` / `L{line}: old => new`
  (renames use `->`, weight-class merges use `=>`) without writing.
- Default (no flags) writes changes in place and prints the same summary.
- Exits `1` and prints usage if no targets are given; `--help`/`-h` prints
  usage and exits cleanly.
- Final line: `Updated N files, N token renames, N weight-class merges`
  (`[dry-run] would update ...` when `--dry-run`), plus, if any flagged
  tokens were found: `Tokens needing manual attention (removed in v2 or
  unmapped):` followed by one `file:Lline  token` row per flag.

## Migration-state auto-detection

**Color renames must run exactly once per codebase** — v2 reuses several
names at different values (e.g. `surface-gray-5` exists pre- and post-
migration with different meanings), so a second full pass would silently
double-shift already-migrated colors. Before touching anything, the script
scans every target file for two token sets:

| Set | Tokens |
|---|---|
| `PRE_MIGRATION_TOKENS` | `surface-white`, `ink-white`, `outline-white`, `surface-menu-bar`, `surface-card`, `surface-cards`, `surface-modal`, `surface-selected`, `outline-gray-modal`, `outline-gray-modals` |
| `POST_MIGRATION_TOKENS` | `surface-base`, `ink-base`, `outline-base`, `surface-sidebar`, `surface-elevation-1`, `surface-elevation-2`, `surface-elevation-3`, `outline-elevation-2` |

`detectMigrationState()` counts matches of each set across all files and sets
`likelyMigrated = post > 0` (any post-migration token present at all is
treated as evidence of a prior run). `getMigrationMode()` then picks the mode:

| Condition | Mode | Effect |
|---|---|---|
| not `likelyMigrated` (or `--force`) | `full` | runs `TOKEN_RENAMES` (colors + unmigrated typography shift) + weight-class merge |
| `likelyMigrated` and no `--force` | `migrated-typography` | runs only `MIGRATED_TEXT_SIZE_RENAMES` (the one-step typography correction below); colors and weight-merge are skipped |

When `likelyMigrated` is true, the CLI prints a warning with the pre/post
counts; in non-`--force` mode it explicitly warns pre-v2 color tokens found
will be left untouched, and that `--force` re-runs the full color migration
("Review carefully: color tokens may double-shift.").

## Color token renames

Renames are simultaneous (single regex pass over `TOKEN_RENAMES`, longest-
match-first so e.g. `surface-alpha-gray-5` is never half-matched by a plain
`surface-…` rule) — several chain (outline `red-2→3`, `red-3→4`, `red-4→5`),
and applying them one at a time instead would cascade a token through
multiple renames. Full old name is `{category}-{family}-{oldSuffix}` →
`{category}-{family}-{newSuffix}`; `white`/`base` and the named-slot renames
(`menu-bar`, `card`, `modal`, `selected`, `gray-modal`) have no family
component.

### `surface-*`

| Old | New |
|---|---|
| `surface-white` | `surface-base` |
| `surface-menu-bar` | `surface-sidebar` |
| `surface-card`, `surface-cards` | `surface-elevation-1` |
| `surface-modal` | `surface-elevation-2` |
| `surface-selected` | `surface-elevation-3` |
| `surface-gray-2-contrast` | `surface-elevation-3` |
| `surface-gray-5` / `-6` / `-7` | `surface-gray-8` / `-9` / `-10` |
| `surface-{red,blue,green,amber,violet}-5` / `-6` / `-7` | `surface-{same}-7` / `-8` / `-9` |

### `ink-*`

| Old | New |
|---|---|
| `ink-white` | `ink-base` |
| `ink-{red,blue,green,amber,violet}-2` / `-3` / `-4` | `ink-{same}-5` / `-6` / `-8` |

### `outline-*`

| Old | New |
|---|---|
| `outline-white` | `outline-base` |
| `outline-gray-modal`, `outline-gray-modals` | `outline-elevation-2` |
| `outline-gray-5` | `outline-gray-7` |
| `outline-{red,blue,green,amber,violet}-2` / `-3` / `-4` | `outline-{same}-3` / `-4` / `-5` |

### `surface-alpha-*` / `outline-alpha-*`

The alpha categories only kept their **neutral** (gray) ramps in v2 — no
accent-color alpha renames exist for either.

| Old | New |
|---|---|
| `surface-alpha-white` | `surface-alpha-base` |
| `surface-alpha-menu-bar` | `surface-alpha-sidebar` |
| `surface-alpha-card`, `surface-alpha-cards` | `surface-alpha-elevation-1` |
| `surface-alpha-modal` | `surface-alpha-elevation-2` |
| `surface-alpha-selected` | `surface-alpha-elevation-3` |
| `surface-alpha-gray-5` / `-6` / `-7` | `surface-alpha-gray-8` / `-9` / `-10` |
| `outline-alpha-white` | `outline-alpha-base` |
| `outline-alpha-gray-modal`, `outline-alpha-gray-modals` | `outline-alpha-elevation-2` |
| `outline-alpha-gray-5` | `outline-alpha-gray-7` |

### Removed — no replacement (flagged, never rewritten)

`surface-alpha-red-1` through `-7`, and `outline-alpha-red-2`, `-3`, `-4`
were dropped entirely in v2 with no equivalent. The codemod never rewrites
these; it reports every occurrence in the trailing "needs manual attention"
list (`REMOVED_TOKENS`, matched via the same longest-match-first regex
machinery as the renames, `FLAG_REGEX`). `WATCH_TOKENS` (tokens with no
decided v2 mapping yet, also flagged-only) is currently empty.

## Typography size shift

Per the script's own header comment: "The espresso text scale gained 15px
(`md`) and 17px (`xl`) stops. Each physical size keeps its meaning under a
new name, so existing utility classes must be renamed to render identically."
Two chained shift tables exist depending on starting state — **never mix
them**, and never run either more than once:

**`UNMIGRATED_TEXT_SIZE_SHIFT`** — for codebases that never ran any prior v2
typography codemod. Chains `xl→2xl`, `2xl→3xl`, `3xl→4xl`, `4xl→5xl`,
`5xl→6xl`, `6xl→7xl`, `7xl→8xl`, `8xl→9xl`, `9xl→10xl`, `10xl→11xl`,
`11xl→12xl`, `12xl→13xl`, `13xl→14xl`, `14xl→15xl`, `15xl→16xl`. Note `sm`,
`base`, and `lg` are **not** in this table — only `xl` and above shift.

**`MIGRATED_TEXT_SIZE_SHIFT`** — for codebases that already ran an earlier
version of the v2 codemod and are on its temporary intermediate names (where
`lg` meant 15px and `xl` meant 16px). Chains one step further: `lg→md`,
`xl→lg`, `2xl→xl`, `3xl→2xl`, `4xl→3xl`, `5xl→4xl`, `6xl→5xl`, `7xl→6xl`,
`8xl→7xl`, `9xl→8xl`, `10xl→9xl`, `11xl→10xl`, `12xl→11xl`, `13xl→12xl`,
`14xl→13xl`, `15xl→14xl`, `16xl→15xl`, `17xl→16xl`. This is the table used
automatically in `migrated-typography` mode (see detection above).

Each `(from, to)` pair in either table expands (`textSizeRenames()`) into ten
concrete renames — the bare size, the paragraph variant, and each of the four
weighted-style suffixes: `text-{from}` → `text-{to}`, `text-p-{from}` →
`text-p-{to}`, and `text[-p]-{from}-{medium,semibold,bold,black}` →
`text[-p]-{to}-{medium,semibold,bold,black}`. Only `UNMIGRATED_TEXT_SIZE_RENAMES`
is folded into the exported `TOKEN_RENAMES` (used by `full` mode alongside
the color renames above); `MIGRATED_TEXT_SIZE_RENAMES` is applied on its own
in `migrated-typography` mode.

## Weight-class merge

`full` mode also runs `mergeWeightClasses()` **after** the token renames, so
a class list is rewritten size-first, then merged: `text-xl font-medium` →
(size renamed) `text-2xl font-medium` → (merged) `text-2xl-medium`. It:

- Only touches **static** `class="..."` / `className="..."` attribute values
  (regex-matched, rejecting a preceding `:`/`-` so Vue `:class` and
  `v-bind:class` bindings are left alone) — dynamic or conditionally-applied
  weights are never merged, since folding a conditional weight into an
  unconditional size would change behavior.
- Requires **exactly one** size token (from the full `tiny`…`17xl` list,
  bare or `p-` prefixed) and **exactly one** `font-{weight}` token in the
  same class list; two of either is treated as ambiguous and left untouched.
- Maps `font-medium`→`-medium`, `font-semibold`→`-semibold`,
  `font-bold`→`-bold`, `font-extrabold`→`-black` (note the name change:
  Tailwind's `extrabold` becomes frappe-ui's `black` weight-class suffix),
  and `font-normal`→ no suffix (regular is the bare size class, so the
  `font-normal` token is simply dropped, not renamed).
- Preserves unrelated classes between the size and weight tokens
  (`px-2 text-sm font-medium text-ink-gray-7` merges the size+weight,
  keeps `px-2` and `text-ink-gray-7` untouched) and never confuses a color
  utility like `text-ink-gray-7` for a size token.

## Sources

- `tailwind/migrate-tokens-v2.js` (full file: header comment, `SURFACE_RENAMES`,
  `INK_RENAMES`, `OUTLINE_RENAMES`, `SURFACE_ALPHA_RENAMES`,
  `OUTLINE_ALPHA_RENAMES`, `UNMIGRATED_TEXT_SIZE_SHIFT`,
  `MIGRATED_TEXT_SIZE_SHIFT`, `COLOR_TOKEN_RENAMES`, `TOKEN_RENAMES`,
  `REMOVED_TOKENS`, `WATCH_TOKENS`, `mergeWeightClasses`,
  `detectMigrationState`, `getMigrationMode`, `migrateTokens`, `main`)
- `package.json` (`bin["tokens-v2"]`)
- `espresso-v2-design-tokens/manifest.json` (v2 Figma export this codemod targets)

See also [frappe-ui-tailwind-tokens.md](frappe-ui-tailwind-tokens.md) for the
current (post-migration) token/class reference, and
[espresso-design-system.md](espresso-design-system.md) for how this compares
to Desk's separate, unmigrated espresso SCSS.
