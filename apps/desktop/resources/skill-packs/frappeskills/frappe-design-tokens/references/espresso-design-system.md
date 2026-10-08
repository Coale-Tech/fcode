# Espresso Design System

## What Espresso is

**Espresso** is Frappe's design system for **Desk** (the `/desk` admin UI in
v16; `/app` in v15, still supported as a redirect — see `website_redirects`
in `apps/frappe/frappe/hooks.py`),
introduced in v15 and current in v16 (`frappe.__version__` 16.35.0). It defines the
design-token source of truth — colors, typography, spacing, shadows, borders/radii
— as **SCSS variables + `:root` CSS custom properties**, plus an SVG **icon set**.
Every Desk page, form, list, report, and workspace is styled against these tokens,
and the same semantic token *vocabulary* (`ink-*`/`surface-*`/`outline-*`) is
independently reused by **frappe-ui** (the Vue component library used for
standalone SPAs like the HRMS/roster frontends) — see
[§ Espresso (Desk) vs frappe-ui (Vue apps)](#espresso-desk-vs-frappe-ui-vue-apps)
below, and [frappe-ui-tailwind-tokens.md](frappe-ui-tailwind-tokens.md) for the
full frappe-ui-side generated token/class reference.

Espresso replaced the older ad-hoc Desk variables; note the migration is still in
progress in places (e.g. `desk/typography.scss` header comment: "Typography remove
when espresso is ready"), so both espresso tokens and legacy layout aliases
(`--fg-color`, `--border-color`, …) coexist. New code should target espresso
tokens.

## File locations

| What | Path |
|------|------|
| Color tokens | `apps/frappe/frappe/public/scss/espresso/_colors.scss` |
| Typography | `apps/frappe/frappe/public/scss/espresso/_typography.scss` |
| Spacing | `apps/frappe/frappe/public/scss/espresso/_spacing.scss` |
| Shadows | `apps/frappe/frappe/public/scss/espresso/_shadows.scss` |
| Borders/radii | `apps/frappe/frappe/public/scss/espresso/_borders.scss` |
| Desk import + bootstrap overrides | `apps/frappe/frappe/public/scss/desk/variables.scss` |
| Light layout aliases | `apps/frappe/frappe/public/scss/common/css_variables.scss` |
| Desk light extras | `apps/frappe/frappe/public/scss/desk/css_variables.scss` |
| Dark-mode overrides | `apps/frappe/frappe/public/scss/desk/dark.scss` |
| Desk CSS bundle entry | `apps/frappe/frappe/public/scss/desk.bundle.scss` |
| Espresso icon sprite | `apps/frappe/frappe/public/icons/espresso/icons.svg` |
| Icon JS helper | `apps/frappe/frappe/public/js/frappe/utils/utils.js` (`frappe.utils.icon`) |
| Include wiring | `apps/frappe/frappe/hooks.py` (`app_include_css`, `app_include_icons`, `web_include_icons`) |

**Load path:** `desk.bundle.scss` → `./desk/index` → `desk/variables.scss` which
`@import`s all five espresso partials, then `common/css_variables`, then `dark`.
`hooks.py` serves the compiled `desk.bundle.css` via `app_include_css`.

The **website** stack has its own parallel import
(`apps/frappe/frappe/public/scss/website/variables.scss` imports the same espresso
partials), so tokens are available on public web pages too.

## Colors

Espresso exposes both raw color scales and semantic tokens. See
[design-tokens.md](design-tokens.md) for the complete hex table of every scale. Summary:

- **Neutral base:** `--neutral-white #ffffff`, `--neutral-black #000000`, and the
  flippable `--neutral` / `--invert-neutral`.
- **Gray ramp** `--gray-50 #f8f8f8` → `--gray-900 #171717` (`$primary` == `$gray-900`).
- **Color scales** (each `-50` … `-900`): `blue`, `green`, `red`, `orange`,
  `amber`, `yellow`, `cyan`, `teal`, `violet`, `pink`, `purple`.
- **Overlays:** `--white-overlay-*` / `--black-overlay-*` (0.09→0.9 alpha).
- **Gradients:** `--linear-black`, `--linear-blue`, `--angular-white/black/green/red/blue`.

### Semantic colors (`--ink-*`, `--surface-*`, `--outline-*`)

These are the "frappe-ui/espresso" names (the `_colors.scss` comment literally says
*"Semantic names like ones used frappe-ui/espresso"*). Use these instead of the raw
scale so components respond to dark mode:

| Prefix | Meaning | Light examples |
|--------|---------|----------------|
| `--ink-*` | text / icon / foreground | `--ink-gray-9 #171717` (strong), `--ink-gray-5 #7c7c7c` (muted), `--ink-gray-1 #ededed`, `--ink-blue-3 #007be0`, `--ink-red-3 #e03636` |
| `--surface-*` | backgrounds / fills | `--surface-white #ffffff`, `--surface-gray-1 #f8f8f8`, `--surface-modal #ffffff`, `--surface-red-5 #cc2929`, `--surface-green-3 #278f5e` |
| `--outline-*` | borders / rings | `--outline-gray-1 #ededed`, `--outline-gray-2 #e2e2e2`, `--outline-gray-3 #c7c7c7`, `--outline-red-3 #e03636`, `--outline-blue-1 #a7d7fd` |

Semantic ranges run `1`→`n` where higher = stronger/darker in light mode (and the
polarity is preserved after dark inversion by redefining the values, not by
flipping the number).

### Semantic brand aliases (legacy layer)

Bridged in `common/css_variables.scss` / `desk/dark.scss`:
`--primary-color: var(--gray-900)`, `--brand-color: var(--primary)`,
`--fg-color`/`--bg-color` (surfaces), `--border-color: var(--gray-200)`,
`--btn-primary: var(--gray-900)`, alert/status pairs like
`--alert-bg-danger`/`--alert-text-danger`. `$danger` (`#e03636`) is the
canonical error color. `--text-color: var(--gray-800)` and the other font-color
aliases (`--heading-color`, `--text-muted`, `--text-light`, `--text-dark`) live
in `espresso/_typography.scss` instead, re-pointed in `desk/dark.scss` for dark mode.

## Dark mode

Dark mode is driven by a **`data-theme` attribute on `<html>`**
(`document.documentElement`). `apps/frappe/frappe/public/js/frappe/ui/theme_switcher.js`:

```js
// theme_switcher.js
root.setAttribute("data-theme", theme || theme_mode);   // "light" | "dark"
root.setAttribute("data-theme-mode", this.current_theme); // "light"|"dark"|"automatic"
// "automatic" resolves via frappe.ui.dark_theme_media_query (prefers-color-scheme)
```

The **inversion mechanism** hinges on two tokens (`_colors.scss` light defaults,
`desk/dark.scss` dark override):

```css
/* light (_colors.scss) */
:root { --neutral: var(--neutral-white); --invert-neutral: var(--neutral-black); }
/* dark (desk/dark.scss) */
[data-theme="dark"] { --neutral: var(--neutral-black); --invert-neutral: var(--neutral-white); }
```

`_colors.scss` also ships a full `[data-theme="dark"]` block that **redefines the
semantic tokens** (`--surface-*`, `--ink-*`, `--outline-*`) to dark equivalents,
e.g. `--surface-white: #0f0f0f`, `--ink-gray-9: #f8f8f8`, `--outline-gray-2: #343434`,
`--surface-cards: #1c1c1c`, `--surface-modal: #232323`. `desk/dark.scss` additionally
re-points the **legacy layout aliases** (`--fg-color: var(--gray-900)`,
`--text-color: var(--gray-50)`, `--border-color: var(--gray-800)`, the `--bg-*`/
`--text-on-*` pairs, checkbox/alert colors, etc.) and even tweaks a couple of raw
grays (`--gray-700: #383838`, `--gray-800: #232323`).

**Consequence for authors:** if you style with semantic tokens (`--ink-*`,
`--surface-*`, `--outline-*`) or legacy aliases (`--fg-color`, `--text-color`,
`--border-color`), dark mode "just works". If you hardcode raw `--gray-500` or a
hex, your UI will **not** adapt.

## Typography

- Font: `--font-stack` = `"InterVariable", "Inter", "-apple-system", …, sans-serif`.
  `InterVariable` (variable weight 100–900) loaded from
  `apps/frappe/frappe/public/css/fonts/inter/inter.css`.
- Size scale: `--text-tiny 11px`, `--text-xs/2xs 12px`, `--text-sm 13px`,
  `--text-base/md 14px` (base is 14px!), `--text-lg 16px`, `--text-xl 18px`,
  `--text-2xl 20px`, `--text-3xl 24px` … up to `--text-12xl 64px`.
- Weights: `--weight-regular 420` (deliberately >400), `--weight-medium 500`,
  `--weight-semibold 600`, `--weight-bold 700`, `--weight-black 800`.
- Line heights: `--text-line-height-*` and `--para-line-height-*` (percentages).
- Color aliases: `--heading-color`, `--text-neutral`, `--text-color`, `--text-muted`,
  `--text-light`, `--text-dark`.
- SCSS helpers: `@mixin get_textstyle($name, $weight)` (sets size + weight +
  letter-spacing together) and `@mixin truncate`.

Full table in [design-tokens.md](design-tokens.md).

## Spacing

- `_spacing.scss` defines only component paddings: `--input-padding 6px 8px`,
  `--dropdown-padding 4px 8px`, `--grid-padding 10px 8px`,
  `--number-card-padding 8px 8px 8px 12px`.
- The reusable scale lives in `common/css_variables.scss`:
  `--padding-xs 5px … --padding-2xl 40px` and `--margin-xs 5px … --margin-2xl 40px`.

## Shadows

`_shadows.scss`: `--shadow-xs`, `--shadow-sm`, `--shadow-base`, `--shadow-md`,
`--shadow-lg`, `--shadow-xl`, `--shadow-2xl`; focus rings `--focus-default`,
`--focus-blue/green/yellow/red`; `--custom-status`, `--custom-shadow-sm`,
`--drop-shadow`. Aliases: `--card-shadow: --shadow-sm`, `--modal-shadow: --shadow-md`,
`--btn-shadow: --shadow-xs`. Exact values in [design-tokens.md](design-tokens.md).

## Borders / radii

`_borders.scss`: `--border-radius-tiny 4px`, `--border-radius-sm 8px`,
`--border-radius 8px` (default), `--border-radius-md 10px`, `--border-radius-lg 12px`,
`--border-radius-xl 16px`, `--border-radius-2xl 20px`, `--border-radius-full 999px`.

## Icons (Espresso icon set)

### Sprites and injection

Frappe injects three SVG symbol sprites (`lucide`, `timeless`, `espresso`) plus an
alphabet sprite. Registered in `hooks.py`:

```python
app_include_icons = [
    "/assets/frappe/icons/lucide/icons.svg",
    "/assets/frappe/icons/timeless/icons.svg",
    "/assets/frappe/icons/espresso/icons.svg",
    "/assets/frappe/icons/desktop_icons/alphabets.svg",
]
web_include_icons = [ ...lucide, timeless, espresso ]  # website pages
```

Sprites are inlined into a hidden `<div id="all-symbols">` in
`apps/frappe/frappe/templates/base.html` (`{% for path in web_include_icons %}
{{ include_icons(path) }}`), so every `<symbol id="…">` is available for
`<use href="#…">` on the same page.

The espresso sprite (`icons/espresso/icons.svg`) contains **two families**:
`es-line-*` (outline, ~184 symbols, e.g. `es-line-add`, `es-line-search`,
`es-line-delete`, `es-line-drag`) and `es-solid-*` (filled, ~79 symbols, e.g.
`es-solid-up`, `es-solid-alert-triangle`, `es-solid-close-circle`). Legacy
`timeless` icons use `#icon-*` ids (e.g. `#icon-heart`, `#icon-close`).

### `frappe.utils.icon()` helper

Defined in `apps/frappe/frappe/public/js/frappe/utils/utils.js`:

```js
frappe.utils.icon(
    icon_name,           // "search" (timeless) OR "es-line-add"/"es-solid-up" (espresso)
    size = "sm",         // "xs"|"sm"|"md"|"lg"|"xl" → class "icon-<size>", OR {width,height}
    icon_class = "",     // class on the inner <use>
    icon_style = "",     // inline style on <svg>
    svg_class = "",      // extra class on <svg>
    current_color = false, // add stroke="currentColor"
    stroke_color = null    // explicit stroke color
)
```

Behavior (verified in source):

- If `icon_name` starts with `es-` → **espresso** icon:
  `href="#<icon_name>"`, `<svg>` class `es-icon es-solid` (when name starts
  `es-solid`) else `es-icon es-line`.
- Otherwise → **timeless/legacy** icon: `href="#icon-<icon_name>"`, class `icon`.
- Emoji names are returned wrapped in a `<span>`.

Returns an HTML string; typically used via `v-html` (Vue) or template interpolation.

```js
// espresso outline icon, medium
frappe.utils.icon("es-line-add", "md")
// → <svg class="es-icon es-line  icon-md" ...><use href="#es-line-add"></use></svg>

// legacy timeless icon, small
frappe.utils.icon("search", "sm")
// → <svg class="icon  icon-sm" ...><use href="#icon-search"></use></svg>
```

### Raw markup pattern

You can also hand-write the `<use>` (as much Desk HTML does):

```html
<!-- espresso -->
<svg class="es-icon es-line icon-sm" aria-hidden="true"><use href="#es-line-add"></use></svg>
<!-- legacy timeless -->
<svg class="icon icon-sm"><use href="#icon-heart"></use></svg>
```

Icon color follows `--icon-stroke` / `currentColor`; sizes map to `.icon-xs … .icon-xl`.

## Building Desk UI that matches Espresso

1. **Reference tokens, never hardcode.** Use CSS custom properties in client
   scripts, custom Desk CSS, and HTML `style` attributes — they're globally on
   `:root`, no import needed.
2. **Prefer semantic tokens** (`--ink-*`, `--surface-*`, `--outline-*`) or legacy
   aliases (`--fg-color`, `--text-color`, `--border-color`, `--control-bg`) so dark
   mode is automatic. Raw `--gray-*`/hex will break in dark mode.
3. **Compose from real primitives.** Use Bootstrap/Desk classes (`btn`,
   `btn-default`, `btn-primary`, `form-control`, `icon-btn`) and `frappe.ui.*`
   widgets; they already carry espresso styling. Don't reinvent buttons/inputs.
4. **Icons via `frappe.utils.icon()`** with `es-line-*`/`es-solid-*` names for the
   modern look; fall back to `#icon-*` (timeless) only for legacy names.
5. **Match shape language:** cards → `--border-radius-lg` + `--card-shadow`;
   inputs/buttons → `--border-radius-md`; modals → `--border-radius-2xl` +
   `--modal-shadow`; pills/avatars → `--border-radius-full`; focus → `--focus-*`.
6. **Type:** base is `--text-base` (14px) with `--weight-regular` (420); use
   `--heading-color`/`--text-muted` rather than fixed grays.

## Espresso (Desk) vs frappe-ui (Vue apps)

Two runtimes, **one shared token vocabulary, two independent implementations**:

| | Espresso (Desk) | frappe-ui (Vue SPA) |
|--|-----------------|---------------------|
| Where | `/desk` (v16) / `/app` (v15) Desk, jQuery/Bootstrap templates | standalone SPAs (e.g. HRMS `frontend/`, roster) mounted at custom routes |
| Source of truth | hand-maintained SCSS partials in `apps/frappe/frappe/public/scss/espresso/` | Figma `espresso-2.0` file, synced to `tailwind/generated/*.json` (v1 only; see [frappe-ui-tailwind-tokens.md](frappe-ui-tailwind-tokens.md)) |
| Styling | espresso SCSS partials → `:root` CSS vars, Bootstrap classes | Tailwind v3 preset (`frappe-ui/tailwind`) + frappe-ui Vue components |
| Tokens | `--gray-*`, `--ink-*`, `--surface-*`, `--outline-*`, `--text-*`, `--border-radius-*` | same **names**, independently generated as Tailwind utilities: `text-ink-gray-8`, `bg-surface-white`, `border-outline-gray-2`, `rounded-lg` |
| Icons | `frappe.utils.icon()` / `<use href="#es-line-…">` sprite | v1: `lucide-<name>` CSS mask classes generated by a Tailwind plugin (`<span class="lucide-menu size-4" />`); the top-level `<FeatherIcon>` Vue component is deprecated in v1 |
| Dark mode | `data-theme="dark"` on `<html>`, toggled by `theme_switcher.js` | same attribute (`darkMode: ['selector', '[data-theme="dark"]']` in the preset), toggled by `src/utils/theme.ts` `useTheme()` |

Both sides ship a `gray` ramp plus `blue/green/red/orange/amber/yellow/cyan/teal/violet/pink/purple` and overlay scales with **matching hex/oklch values** for the tokens both export, so a designer can move between a Desk customization and a frappe-ui app using the same color names (`ink-gray-8`, `surface-white`, `outline-gray-2`). But the two pipelines have diverged in *scale*: frappe-ui v1 documents more typography sizes (`tiny`…`16xl` vs Desk's `tiny`…`12xl`), a numbered radius scale (`rounded-0`…`rounded-9`, Desk has no numbered equivalent), and per-weight typography component classes (`text-base-medium`) that Desk's `_typography.scss` does not have (Desk instead offers the `get_textstyle($name, $weight)` SCSS mixin). Treat "same token names" as **vocabulary parity**, not byte-for-byte value parity — always check the actual generated file for the runtime you're targeting.

**Rule of thumb:** building inside Desk (client scripts, custom form/list UI,
workspaces) → espresso CSS vars + `frappe.utils.icon()`. Building a standalone
Vue portal → frappe-ui components + Tailwind token classes (see
[frappe-ui-tailwind-tokens.md](frappe-ui-tailwind-tokens.md) for the full
generated class reference, and [frappe-ui-tokens-v2-migration.md](frappe-ui-tokens-v2-migration.md)
if migrating an app off the pre-espresso-v2 token names).

## Sources

- `apps/frappe/frappe/public/scss/espresso/_colors.scss`
- `apps/frappe/frappe/public/scss/espresso/_typography.scss`
- `apps/frappe/frappe/public/scss/espresso/_spacing.scss`
- `apps/frappe/frappe/public/scss/espresso/_shadows.scss`
- `apps/frappe/frappe/public/scss/espresso/_borders.scss`
- `apps/frappe/frappe/public/scss/desk/variables.scss`
- `apps/frappe/frappe/public/scss/desk/css_variables.scss`
- `apps/frappe/frappe/public/scss/common/css_variables.scss`
- `apps/frappe/frappe/public/scss/desk/dark.scss`
- `apps/frappe/frappe/public/scss/desk.bundle.scss`
- `apps/frappe/frappe/public/scss/website/variables.scss`
- `apps/frappe/frappe/public/css/fonts/inter/inter.css`
- `apps/frappe/frappe/public/icons/espresso/icons.svg`
- `apps/frappe/frappe/public/js/frappe/utils/utils.js` (`frappe.utils.icon`)
- `apps/frappe/frappe/public/js/frappe/ui/theme_switcher.js`
- `apps/frappe/frappe/templates/base.html` (`include_icons` / `#all-symbols`)
- `apps/frappe/frappe/hooks.py` (`app_include_css`, `app_include_icons`, `web_include_icons`)
- frappe-ui `tailwind/{preset,plugin,colorPalette,tokens,lucideIconsPlugin,iconPackPlugin}.js`, `tailwind/generated/*.json`, `src/utils/theme.ts`, `spec/foundations.md` — full citations in [frappe-ui-tailwind-tokens.md](frappe-ui-tailwind-tokens.md)
