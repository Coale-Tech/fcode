# Design Tokens (Espresso, Frappe Desk)

Frappe Desk (v15+/v16) ships its design tokens through the **Espresso** design
system. All token values below are the **actual** values compiled into Desk, read
directly from `apps/frappe/frappe/public/scss/espresso/*.scss`. Tokens are exposed
two ways:

1. **SCSS variables** (e.g. `$gray-900`) — usable only inside `.scss` that is part
   of a bundle importing the espresso partials.
2. **`:root` CSS custom properties** (e.g. `--gray-900`) — usable everywhere: any
   Desk CSS, inline `style`, JS, and even non-bundled custom app CSS, because they
   are globally defined on `:root`.

> This file covers Desk's own SCSS/CSS-custom-property implementation of
> Espresso. **frappe-ui** (the Vue component library) ships a second,
> independent implementation of the same token vocabulary as a Tailwind v3
> preset generated from a Figma export — different pipeline, same names. See
> [frappe-ui-tailwind-tokens.md](frappe-ui-tailwind-tokens.md) for the
> generated color/typography/radius/shadow/icon utility classes (v1,
> `1.0.0-beta.29`) and [frappe-ui-tokens-v2-migration.md](frappe-ui-tokens-v2-migration.md)
> for the espresso-v2 rename migration. For the conceptual overview,
> dark-mode mechanics, semantic tokens, icons, and the Desk-vs-frappe-ui
> split, see [espresso-design-system.md](espresso-design-system.md).

Import order (from `apps/frappe/frappe/public/scss/desk/variables.scss`):

```scss
@import "../espresso/colors";
@import "../espresso/spacing";
@import "../espresso/typography";
@import "../espresso/shadows";
@import "../espresso/borders";
```

The compiled `desk.bundle.scss` pulls this in via `./desk/index`, and Desk loads
it through `app_include_css = ["desk.bundle.css", ...]` in `apps/frappe/frappe/hooks.py`.

---

## Color Palette

### Gray Scale (`_colors.scss`)

The gray ramp is the backbone of the whole system. `$primary` **is** `$gray-900`
(a near-black), which is why Desk reads as a high-contrast black/neutral UI.

| SCSS var | CSS var | Value |
|----------|---------|-------|
| `$gray-50`  | `--gray-50`  | `#f8f8f8` |
| `$gray-100` | `--gray-100` | `#f3f3f3` |
| `$gray-200` | `--gray-200` | `#ededed` |
| `$gray-300` | `--gray-300` | `#e2e2e2` |
| `$gray-400` | `--gray-400` | `#c7c7c7` |
| `$gray-500` | `--gray-500` | `#999999` |
| `$gray-600` | `--gray-600` | `#7c7c7c` |
| `$gray-700` | `--gray-700` | `#525252` |
| `$gray-800` | `--gray-800` | `#383838` |
| `$gray-900` | `--gray-900` | `#171717` |

There is **no** `gray-950`. The palette is 50→900 only.

### Brand / semantic SCSS colors

```scss
$primary: $gray-900;                       // #171717
$primary-light: lighten($primary, 80%) !default;
$danger: #e03636;                          // == --red-500
$light-yellow: #fef4e2;
```

Bootstrap theme map (`desk/variables.scss`): `$theme-colors: ("primary": $primary, "danger": $danger)`.

### Neutral base (`_colors.scss`)

```css
--neutral-white: #ffffff;
--neutral-black: #000000;
--neutral: var(--neutral-white);        /* flips to black in dark mode */
--invert-neutral: var(--neutral-black); /* flips to white in dark mode */
```

### Blue

| CSS var | Value | | CSS var | Value |
|---------|-------|-|---------|-------|
| `--blue-50`  | `#f7fbfd` | | `--blue-500` | `#0289f7` |
| `--blue-100` | `#edf6fd` | | `--blue-600` | `#007be0` |
| `--blue-200` | `#e3f1fd` | | `--blue-700` | `#0070cc` |
| `--blue-300` | `#c9e7fc` | | `--blue-800` | `#005ca3` |
| `--blue-400` | `#70b6f0` | | `--blue-900` | `#004880` |

### Green

| CSS var | Value | | CSS var | Value |
|---------|-------|-|---------|-------|
| `--green-50`  | `#f3fcf5` | | `--green-500` | `#59ba8b` |
| `--green-100` | `#e4f5e9` | | `--green-600` | `#30a66d` |
| `--green-200` | `#daf0e1` | | `--green-700` | `#278f5e` |
| `--green-300` | `#cae5d4` | | `--green-800` | `#16794c` |
| `--green-400` | `#b6dec5` | | `--green-900` | `#173b2c` |

### Red

| CSS var | Value | | CSS var | Value |
|---------|-------|-|---------|-------|
| `--red-50`  | `#fff7f7` | | `--red-500` | `#e03636` |
| `--red-100` | `#fff0f0` | | `--red-600` | `#cc2929` |
| `--red-200` | `#fcd7d7` | | `--red-700` | `#b52a2a` |
| `--red-300` | `#f9c6c6` | | `--red-800` | `#941f1f` |
| `--red-400` | `#eb9091` | | `--red-900` | `#6b1515` |

### Orange

| CSS var | Value | | CSS var | Value |
|---------|-------|-|---------|-------|
| `--orange-50`  | `#fff9f5` | | `--orange-500` | `#e86c13` |
| `--orange-100` | `#fff1e7` | | `--orange-600` | `#d45a08` |
| `--orange-200` | `#fce6d5` | | `--orange-700` | `#bd3e0c` |
| `--orange-300` | `#f7d6bd` | | `--orange-800` | `#9e3513` |
| `--orange-400` | `#f0b58b` | | `--orange-900` | `#6b2711` |

### Amber

| CSS var | Value | | CSS var | Value |
|---------|-------|-|---------|-------|
| `--amber-50`  | `#fdfaed` | | `--amber-500` | `#e79913` |
| `--amber-100` | `#fcf3cf` | | `--amber-600` | `#db7706` |
| `--amber-200` | `#f7e28d` | | `--amber-700` | `#b35309` |
| `--amber-300` | `#f5d261` | | `--amber-800` | `#91400d` |
| `--amber-400` | `#f2be3a` | | `--amber-900` | `#763813` |

### Yellow

| CSS var | Value | | CSS var | Value |
|---------|-------|-|---------|-------|
| `--yellow-50`  | `#fffcef` | | `--yellow-500` | `#edba13` |
| `--yellow-100` | `#fff7d3` | | `--yellow-600` | `#d1930d` |
| `--yellow-200` | `#f7e9a8` | | `--yellow-700` | `#ab6e05` |
| `--yellow-300` | `#f5e171` | | `--yellow-800` | `#8c5600` |
| `--yellow-400` | `#f2d14b` | | `--yellow-900` | `#733f12` |

### Cyan

| CSS var | Value | | CSS var | Value |
|---------|-------|-|---------|-------|
| `--cyan-50`  | `#f5fbfc` | | `--cyan-500` | `#34bae3` |
| `--cyan-100` | `#e0f8ff` | | `--cyan-600` | `#32a4c7` |
| `--cyan-200` | `#b3ecfc` | | `--cyan-700` | `#267a94` |
| `--cyan-300` | `#94e6ff` | | `--cyan-800` | `#125c73` |
| `--cyan-400` | `#6bd3f2` | | `--cyan-900` | `#164759` |

### Teal

| CSS var | Value | | CSS var | Value |
|---------|-------|-|---------|-------|
| `--teal-50`  | `#f0fdfa` | | `--teal-500` | `#36baad` |
| `--teal-100` | `#e6f7f4` | | `--teal-600` | `#0b9e92` |
| `--teal-200` | `#bae8e1` | | `--teal-700` | `#0f736b` |
| `--teal-300` | `#97ded4` | | `--teal-800` | `#115c57` |
| `--teal-400` | `#73d1c4` | | `--teal-900` | `#114541` |

### Violet

| CSS var | Value | | CSS var | Value |
|---------|-------|-|---------|-------|
| `--violet-50`  | `#fbfaff` | | `--violet-500` | `#6846e3` |
| `--violet-100` | `#f5f2ff` | | `--violet-600` | `#5f46c7` |
| `--violet-200` | `#e5e1fa` | | `--violet-700` | `#4f3da1` |
| `--violet-300` | `#dad2f7` | | `--violet-800` | `#392980` |
| `--violet-400` | `#bdb1f0` | | `--violet-900` | `#251959` |

### Pink

| CSS var | Value | | CSS var | Value |
|---------|-------|-|---------|-------|
| `--pink-50`  | `#fff7fc` | | `--pink-500` | `#e34aa6` |
| `--pink-100` | `#feeef8` | | `--pink-600` | `#cf3a96` |
| `--pink-200` | `#f8e2f0` | | `--pink-700` | `#9c2671` |
| `--pink-300` | `#f2d4e6` | | `--pink-800` | `#801458` |
| `--pink-400` | `#e9c4da` | | `--pink-900` | `#570f3e` |

### Purple

| CSS var | Value | | CSS var | Value |
|---------|-------|-|---------|-------|
| `--purple-50`  | `#fdfaff` | | `--purple-500` | `#9c45e3` |
| `--purple-100` | `#f9f0ff` | | `--purple-600` | `#8642c2` |
| `--purple-200` | `#f1e5fa` | | `--purple-700` | `#6e399d` |
| `--purple-300` | `#e9d6f5` | | `--purple-800` | `#5c2f83` |
| `--purple-400` | `#d6c1e6` | | `--purple-900` | `#401863` |

### Overlays

Alpha ramps (`--white-overlay-50 … -900` and `--black-overlay-50 … -900`) step
opacity from `0.09` to `0.9` in `0.09` increments over `rgba(255,255,255,a)` /
`rgba(0,0,0,a)`. Example:

```css
--white-overlay-50: rgba(255, 255, 255, 0.09);
--white-overlay-500: rgba(255, 255, 255, 0.54);
--white-overlay-900: rgba(255, 255, 255, 0.9);
--black-overlay-50: rgba(0, 0, 0, 0.09);
--black-overlay-900: rgba(0, 0, 0, 0.9);
```

### Semantic color tokens (`--ink-*`, `--surface-*`, `--outline-*`)

These are the names shared with frappe-ui. `--ink-*` = text/icon/foreground,
`--surface-*` = backgrounds/fills, `--outline-*` = borders. They are redefined
under `[data-theme="dark"]` for dark mode (see [espresso-design-system.md](espresso-design-system.md)).
Light-mode samples:

```css
--ink-gray-9: #171717;   /* strongest text */
--ink-gray-8: #383838;
--ink-gray-5: #7c7c7c;   /* muted text */
--ink-gray-1: #ededed;   /* faint */
--surface-white: #ffffff;
--surface-gray-1: #f8f8f8;
--surface-modal: #ffffff;
--outline-gray-1: #ededed;
--outline-gray-2: #e2e2e2;
--outline-gray-3: #c7c7c7;
```

> Legacy layout aliases (`--fg-color`, `--bg-color`, `--border-color`,
> `--control-bg`, `--btn-primary`, …) are defined in
> `apps/frappe/frappe/public/scss/common/css_variables.scss` (light) and
> `apps/frappe/frappe/public/scss/desk/dark.scss` (dark), resolving to the
> espresso gray/color tokens (e.g. `--fg-color: white`, `--border-color: var(--gray-200)`,
> `--btn-primary: var(--gray-900)`). `--text-color` and the other font-color
> aliases (`--heading-color`, `--text-muted`, `--text-light`, `--text-dark`,
> `--text-neutral`) are defined in `espresso/_typography.scss` instead (light),
> and re-pointed in `desk/dark.scss` (dark) — see [Font color aliases](#font-color-aliases) below.

---

## Typography (`_typography.scss`)

### Font stack

```css
--font-stack: "InterVariable", "Inter", "-apple-system", "BlinkMacSystemFont",
  "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans",
  "Droid Sans", "Helvetica Neue", sans-serif;
```

`InterVariable` is a variable font (`font-weight: 100 900`) loaded via
`apps/frappe/frappe/public/css/fonts/inter/inter.css`
(`@font-face { font-family: InterVariable; src: url(".../InterVariable.woff2") }`).
Base document font-size is `16px` (`desk/variables.scss` sets `html, body { font-size: 16px }`).

### Font sizes

Note: `--text-base` / `--text-md` are **14px**, not 16px. Several small sizes alias
each other (`--text-2xs` == `--text-xs` == 12px).

| CSS var | Value | | CSS var | Value |
|---------|-------|-|---------|-------|
| `--text-tiny` | `11px` | | `--text-4xl`  | `26px` |
| `--text-2xs`  | `12px` | | `--text-5xl`  | `28px` |
| `--text-xs`   | `12px` | | `--text-6xl`  | `32px` |
| `--text-sm`   | `13px` | | `--text-7xl`  | `40px` |
| `--text-md`   | `14px` (alias) | | `--text-8xl`  | `44px` |
| `--text-base` | `14px` | | `--text-9xl`  | `48px` |
| `--text-lg`   | `16px` | | `--text-10xl` | `52px` |
| `--text-xl`   | `18px` | | `--text-11xl` | `56px` |
| `--text-2xl`  | `20px` | | `--text-12xl` | `64px` |
| `--text-3xl`  | `24px` | | | |

### Font weights

Note `--weight-regular` is **420** (not 400) — a deliberate slightly-heavier
regular for InterVariable.

| CSS var | Value |
|---------|-------|
| `--weight-regular`  | `420` |
| `--weight-medium`   | `500` |
| `--weight-semibold` | `600` |
| `--weight-bold`     | `700` |
| `--weight-black`    | `800` |

### Line heights

```css
--text-line-height-3xl: 115%;   --text-line-height-4xl: 160%;
--text-line-height-7xl: 140%;   --text-line-height-12xl: 130%;
--text-line-height-14xl: 120%;
--para-line-height-2-xs: 160%;  --para-line-height-sm: 150%;
--para-line-height-2xl: 148%;   --para-line-height-3xl: 140%;
```

### Font color aliases

```css
--heading-color: var(--gray-900);
--text-neutral:  var(--gray-900);
--text-color:    var(--gray-800);
--text-muted:    var(--gray-700);
--text-light:    var(--gray-600);
--text-dark:     var(--fg-color);
```

### Letter-spacing + text-style mixins

`_typography.scss` also defines a `$letter-space` SCSS map (per size, e.g.
`"tiny": 0.09em`, `"base": 0.02em`, `"3xl": 0.005em`) and helpers
`@mixin get_textstyle($name, $weight)` and `@mixin truncate`. Prefer these in
SCSS instead of hand-setting size/weight/tracking:

```scss
.my-heading { @include get_textstyle("2xl", "semibold"); }
.my-cell    { @include truncate; }
```

---

## Spacing

### Espresso component padding (`_spacing.scss`)

`_spacing.scss` is intentionally tiny — it only holds a few component paddings:

```css
--input-padding: 6px 8px;
--dropdown-padding: 4px 8px;
--grid-padding: 10px 8px;
--number-card-padding: 8px 8px 8px 12px;
```

### General spacing scale (`common/css_variables.scss`)

The reusable padding/margin scale lives in the common layer (loaded before dark):

| CSS var | Value | | CSS var | Value |
|---------|-------|-|---------|-------|
| `--padding-xs`  | `5px`  | | `--margin-xs`  | `5px`  |
| `--padding-sm`  | `7px`  | | `--margin-sm`  | `10px` |
| `--padding-md`  | `15px` | | `--margin-md`  | `15px` |
| `--padding-lg`  | `20px` | | `--margin-lg`  | `20px` |
| `--padding-xl`  | `30px` | | `--margin-xl`  | `30px` |
| `--padding-2xl` | `40px` | | `--margin-2xl` | `40px` |

Bootstrap's `$spacer` in Desk is `14px` (`desk/variables.scss`).

---

## Border Radius (`_borders.scss`)

| CSS var | Value | Notes |
|---------|-------|-------|
| `--border-radius-tiny` | `4px`   | chips, tiny controls |
| `--border-radius-sm`   | `8px`   | |
| `--border-radius`      | `8px`   | default (== `sm`) |
| `--border-radius-md`   | `10px`  | inputs, buttons |
| `--border-radius-lg`   | `12px`  | cards |
| `--border-radius-xl`   | `16px`  | |
| `--border-radius-2xl`  | `20px`  | modals |
| `--border-radius-full` | `999px` | pills, avatars |

---

## Shadows (`_shadows.scss`)

### Drop shadows

```css
--shadow-xs: rgba(0,0,0,0.05) 0px 0.5px 0px 0px,
             rgba(0,0,0,0.08) 0px 0px 0px 1px,
             rgba(0,0,0,0.05) 0px 2px 4px 0px;
--shadow-sm: 0px 1px 2px rgba(0,0,0,0.1);
--shadow-base: 0px 0px 1px rgba(0,0,0,0.45), 0px 1px 2px rgba(0,0,0,0.1);
--shadow-md: 0px 0px 1px rgba(0,0,0,0.12), 0px 0.5px 2px rgba(0,0,0,0.15),
             0px 2px 3px rgba(0,0,0,0.16);
--shadow-lg: 0px 0px 1px rgba(0,0,0,0.35), 0px 6px 8px -4px rgba(0,0,0,0.1);
--shadow-xl: 0px 0px 1px rgba(0,0,0,0.19), 0px 1px 2px rgba(0,0,0,0.07),
             0px 6px 15px -5px rgba(0,0,0,0.11);
--shadow-2xl: 0px 0px 1px rgba(0,0,0,0.2), 0px 1px 3px rgba(0,0,0,0.05),
              0px 10px 24px -3px rgba(0,0,0,0.1);
```

Layout aliases (`common/css_variables.scss`): `--card-shadow: var(--shadow-sm)`,
`--modal-shadow: var(--shadow-md)`, `--btn-shadow: var(--shadow-xs)`.

### Focus rings

```css
--focus-default: 0px 0px 0px 2px #c9c9c9;
--focus-blue:    0px 0px 0px 2px #65b9fc;
--focus-green:   0px 0px 0px 2px #5bb98c;
--focus-yellow:  0px 0px 0px 2px #fff0ad;
--focus-red:     0px 0px 0px 2px #eb9091;
```

### Custom

```css
--custom-status: 0px 0px 0px 1.5px #ffffff;
--custom-shadow-sm: 0px 1px 4px rgba(0,0,0,0.1);
--drop-shadow: 0px 0.5px 0px rgba(0,0,0,0.05), 0px 0px 0px rgba(0,0,0,0),
               0px 2px 4px rgba(0,0,0,0.05);
```

---

## Breakpoints (`desk/variables.scss`)

```scss
$grid-breakpoints: (xs: 0, sm: 576px, md: 768px, lg: 992px, xl: 1200px, 2xl: 1440px);
$container-max-widths: (sm: 540px, md: 840px, lg: 1090px, xl: 1290px);
```

CSS-var mirrors (`desk/css_variables.scss`): `--sm-width: 567px`, `--md-width: 768px`,
`--lg-width: 992px`, `--xl-width: 1200px`, `--xxl-width: 1440px`.

---

## Consuming tokens

### In custom Desk CSS / client scripts

Always reference the CSS custom properties (they exist on `:root` at runtime, no
import needed):

```css
.my-custom-card {
  background: var(--surface-white);
  color: var(--ink-gray-8);
  border: 1px solid var(--outline-gray-2);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--card-shadow);
  padding: var(--padding-md);
  font-size: var(--text-base);
  font-weight: var(--weight-regular);
}
```

Prefer semantic tokens (`--ink-*`, `--surface-*`, `--outline-*`, `--text-color`,
`--fg-color`, `--border-color`) over raw scale tokens (`--gray-500`) so your UI
follows dark mode automatically — the semantic tokens are re-pointed under
`[data-theme="dark"]`, the raw `--gray-*` scale is (mostly) not.

### In SCSS bundles

If your app bundles SCSS that imports the espresso partials, you can also use the
`$gray-900`, `$primary`, `$danger` SCSS vars and the `get_textstyle`/`truncate`
mixins. In plain custom SCSS that isn't part of a frappe bundle, use the CSS vars.

### In frappe-ui (Vue) apps

frappe-ui apps use the same token *names* through a separately-generated
Tailwind v3 preset — utilities like `text-ink-gray-8`, `bg-surface-white`,
`border-outline-gray-2`, `rounded-lg` exist, but they are **not** produced
from this Desk SCSS; frappe-ui compiles its own preset from a Figma token
export (`tailwind/generated/*.json`). Values are pixel-identical to Desk's
CSS vars for the tokens both sides ship, but frappe-ui v1 has a materially
larger scale (more typography sizes, a numbered radius scale, per-weight
typography classes). Import path is version-gated — check
`frontend/package.json`:

- **v1** (`1.0.0-beta.x`, canonical): `import frappeUIPreset from 'frappe-ui/tailwind'`
- **0.1.261 baseline**: same `import frappeUIPreset from 'frappe-ui/tailwind'`
  (`./tailwind` was already a stable export subpath)
- **very old 0.1.x** (e.g. `apps/hrms/frontend` pins `0.1.105`): a pre-exports-map
  deep import, `import frappeUIPreset from 'frappe-ui/src/tailwind/preset'`
  (`apps/hrms/frontend/tailwind.config.js`) — don't copy this pattern into new code.

Full generated class reference: [frappe-ui-tailwind-tokens.md](frappe-ui-tailwind-tokens.md).
Details on the split: [espresso-design-system.md](espresso-design-system.md).

---

## Best Practices

1. **Use semantic tokens first** (`--ink-*`/`--surface-*`/`--outline-*` or the
   `--text-color`/`--fg-color`/`--border-color` layout aliases) so components
   respond to dark mode.
2. **Gray-driven, color-accented.** `$primary` is `--gray-900`; colored scales are
   for states/status, not primary chrome.
3. **Match the radii/shadows.** Cards: `--border-radius-lg` + `--card-shadow`.
   Inputs/buttons: `--border-radius-md`. Modals: `--border-radius-2xl` +
   `--modal-shadow`. Focus: the `--focus-*` rings.
4. **Type: 14px base.** `--text-base` is 14px and `--weight-regular` is 420 — don't
   assume Tailwind defaults.
5. **Never hardcode hex** that already has a token.

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
- `apps/frappe/frappe/public/css/fonts/inter/inter.css`
- `apps/frappe/frappe/hooks.py` (`app_include_css`)
- `apps/hrms/frontend/tailwind.config.js` (frappe-ui preset)
