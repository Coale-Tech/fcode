/**
 * scripts/ui-verify/settings-element-map.mjs
 *
 * Element mapping for settings-parity.mjs.
 * Reference values are taken verbatim from the Raven spec (§5.3 of
 * 2026-10-02-settings-raven-restyle-spec.md) and Raven source:
 *   /Users/mac/ERPNext/coaletecherp/apps/raven/apps/web/src/components/ui/
 *
 * Raven class → computed value translation:
 *   w-56       → 224px
 *   h-7.5      → 30px   (7.5 * 4px Tailwind unit)
 *   h-7        → 28px
 *   h-8        → 32px
 *   rounded    → 4px    (espresso --radius-1)
 *   rounded-md → 10px   (espresso --radius-md in Raven; --radius-5 = 10px)
 *   gap-8      → 32px
 *   py-2       → 8px
 *   px-6       → 24px
 *   px-2       → 8px
 *   py-[7px]   → 7px
 *   ms-2       → 8px  (margin-inline-start = gap between icon and label)
 *   text-xs    → 12px
 *   text-sm    → 13px
 *   text-base  → 14px
 *   text-xl    → 16px
 *   text-xl-semibold → 16px weight 600
 *
 * FD5 exception: settings rail (nav) may use macOS vibrancy instead of
 * Raven's opaque surface-sidebar. Listed here as an allowed mismatch.
 *
 * Properties dumped per element (match verify.mjs convention):
 *   width, height, padding-top, padding-right, padding-bottom, padding-left,
 *   margin-top, margin-right, margin-bottom, margin-left, gap,
 *   border-top-left-radius, border-top-right-radius,
 *   border-bottom-left-radius, border-bottom-right-radius,
 *   background-color, color, font-family, font-size, font-weight,
 *   line-height, letter-spacing, box-shadow,
 *   transition-duration, transition-timing-function
 */

/** @typedef {{ selector: string, properties: string[], expected: Record<string,string>, exception?: string }} ElementEntry */

/** @type {ElementEntry[]} */
export const SETTINGS_ELEMENT_MAP = [
  // ── Nav rail ───────────────────────────────────────────────────────────────
  {
    id: "nav-rail",
    label: "Settings nav rail (.settings-shell-full .settings-nav)",
    selector: ".settings-shell-full .settings-nav",
    properties: ["width"],
    expected: {
      width: "224px",          // Raven w-56
    },
    exception: null,
  },

  // ── Nav group label ────────────────────────────────────────────────────────
  {
    id: "nav-group-label",
    label: "Nav group label (.settings-nav-group-label)",
    selector: ".settings-nav-group-label",
    properties: ["font-size", "font-weight"],
    expected: {
      "font-size": "12px",     // Raven text-xs
      "font-weight": "500",    // Raven medium
    },
    exception: null,
  },

  // ── Nav item (rest) ────────────────────────────────────────────────────────
  {
    id: "nav-item-rest",
    label: "Nav item rest (.settings-nav-item)",
    selector: ".settings-nav-item",
    properties: [
      "min-height",
      "border-top-left-radius",
      "padding-top",
      "padding-left",
      "gap",
      "transition-duration",
      "transition-timing-function",
    ],
    expected: {
      "min-height": "30px",                // Raven h-7.5
      "border-top-left-radius": "4px",     // Raven rounded = --radius-1
      "padding-top": "5px",
      "padding-left": "8px",              // Raven px-2 = 8px
      "gap": "8px",                       // Raven ms-2 / gap
      "transition-duration": "300ms",     // FD4
      "transition-timing-function": "ease-in-out",  // FD4
    },
    exception: null,
  },

  // ── Nav item icon ──────────────────────────────────────────────────────────
  {
    id: "nav-item-icon",
    label: "Nav item icon (.settings-nav-icon)",
    selector: ".settings-nav-icon",
    properties: ["width", "height"],
    expected: {
      width: "16px",   // Raven size-4
      height: "16px",
    },
    exception: null,
  },

  // ── Nav rail background (FD5 exception: darwin vibrancy allowed) ───────────
  {
    id: "nav-rail-bg",
    label: "Nav rail background (FD5: darwin vibrancy allowed)",
    selector: ".settings-shell-full .settings-nav",
    properties: ["background-color"],
    expected: {
      // Raven: surface-sidebar opaque. Fcode: vibrancy on darwin (allowed).
      "background-color": "(resolved from --surface-sidebar)",
    },
    exception: "FD5: macOS vibrancy on the settings rail is an allowed mismatch; " +
               "the nav keeps .sidebar-surface class so darwin applies glass tint.",
  },

  // ── Settings content area ──────────────────────────────────────────────────
  {
    id: "settings-content",
    label: "Settings content (.settings-content)",
    selector: ".settings-content",
    properties: ["padding-right", "padding-bottom", "padding-left"],
    expected: {
      "padding-right": "24px",   // Raven px-6
      "padding-bottom": "32px",  // Raven py-8
      "padding-left": "24px",    // Raven px-6
    },
    exception: null,
  },

  // ── Panel title ────────────────────────────────────────────────────────────
  {
    id: "panel-title",
    label: "Panel/section title (.settings-section-title)",
    selector: ".settings-section-title",
    properties: ["font-size", "font-weight", "letter-spacing"],
    expected: {
      "font-size": "16px",          // Raven text-xl-semibold
      "font-weight": "600",
      "letter-spacing": "0.015em",
    },
    exception: null,
  },

  // ── Section heading (SettingsSectionHeader / settings-card-heading) ────────
  {
    id: "section-heading",
    label: "Section heading (.settings-card-heading)",
    selector: ".settings-card-heading",
    properties: ["font-size"],
    expected: {
      "font-size": "14px",   // Raven text-base text-ink-gray-5
    },
    exception: null,
  },

  // ── Form row (SettingsRow / settings-row) ──────────────────────────────────
  {
    id: "form-row",
    label: "Settings row (.settings-row)",
    selector: ".settings-row",
    properties: [
      "padding-top", "padding-bottom",
      "padding-left", "padding-right",
      "gap",
      "background-color",
      "border-top-left-radius",
    ],
    expected: {
      "padding-top": "8px",              // Raven py-2
      "padding-bottom": "8px",
      "padding-left": "0px",             // flat, no card padding
      "padding-right": "0px",
      "gap": "32px",                     // Raven gap-8
      "background-color": "rgba(0, 0, 0, 0)",  // transparent (FD2: no card)
      "border-top-left-radius": "0px",   // FD2: no card chrome
    },
    exception: null,
  },

  // ── Row label (.settings-row-title) ───────────────────────────────────────
  {
    id: "row-label",
    label: "Row label (.settings-row-title)",
    selector: ".settings-row-title",
    properties: ["font-size"],
    expected: {
      "font-size": "14px",   // Raven text-p-base
    },
    exception: null,
  },

  // ── Row detail/description (.settings-row-detail) ─────────────────────────
  {
    id: "row-detail",
    label: "Row detail (.settings-row-detail)",
    // SettingsRow detail prop renders on AI tab (prompt-enhancement-card.tsx:52)
    tab: "ai",
    selector: ".settings-row-detail",
    properties: ["font-size"],
    expected: {
      "font-size": "13px",   // Raven text-p-sm
    },
    exception: null,
  },

  // ── Switch/toggle track ────────────────────────────────────────────────────
  {
    id: "toggle-track",
    label: "Toggle track (.settings-toggle)",
    // SettingsToggle appears on General tab (enter-to-send, close-behavior)
    tab: "general",
    selector: ".settings-toggle",
    properties: ["width", "height", "transition-duration"],
    expected: {
      width: "32px",           // Raven md: h-5 w-8 = 20×32
      height: "20px",
      "transition-duration": "300ms",  // FD4 (browser may report 0.3s — normalized)
    },
    exception: null,
  },

  // ── Switch/toggle thumb ────────────────────────────────────────────────────
  {
    id: "toggle-thumb",
    label: "Toggle thumb (.settings-toggle-thumb)",
    tab: "general",
    selector: ".settings-toggle-thumb",
    properties: ["width", "height"],
    expected: {
      width: "14px",   // Raven size-3.5
      height: "14px",
    },
    exception: null,
  },

  // ── Btn control ────────────────────────────────────────────────────────────
  {
    id: "btn-ctrl",
    label: "Button in settings (.settings-shell .btn)",
    // AgentCapabilityLayout renders .btn on the agent tab
    tab: "agent",
    selector: ".settings-shell .btn",
    properties: ["border-top-left-radius"],
    expected: {
      "border-top-left-radius": "4px",  // Raven rounded = 4px (FD3)
    },
    exception: null,
  },

  // ── Field input ────────────────────────────────────────────────────────────
  {
    id: "field-input",
    label: "Field input in settings (.settings-shell .field-input)",
    // NetworkProxySection on General tab shows .field-input when mode=custom.
    // mock-api.mjs sets networkProxy.mode="custom" for this check.
    tab: "general",
    selector: ".settings-shell .field-input",
    properties: ["border-top-left-radius"],
    expected: {
      "border-top-left-radius": "4px",  // Raven rounded = 4px (FD3)
    },
    exception: null,
  },

  // ── Menu select trigger ────────────────────────────────────────────────────
  {
    id: "menu-select-trigger",
    label: "Menu select trigger (.settings-menu-select-trigger)",
    // SettingsMenuSelect appears on AI tab (permission mode, tool approval)
    tab: "ai",
    selector: ".settings-menu-select-trigger",
    properties: ["border-top-left-radius"],
    expected: {
      "border-top-left-radius": "4px",  // FD3
    },
    exception: null,
  },
];

/**
 * Properties to dump for all elements (superset; element map may use a subset).
 */
export const DUMP_PROPERTIES = [
  "width", "height",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "gap",
  "border-top-left-radius", "border-top-right-radius",
  "border-bottom-left-radius", "border-bottom-right-radius",
  "background-color", "color",
  "font-size", "font-weight", "line-height", "letter-spacing",
  "box-shadow",
  "transition-duration", "transition-timing-function",
  "min-height",
];

// ── §5.3 Raven primitives — verbatim from Raven components/ui/*.tsx ──────────
// Extracted 2026-10-02 from:
//   /Users/mac/ERPNext/coaletecherp/apps/raven/apps/web/src/components/ui/
//
// CHECKBOX (checkbox.tsx)
// ─────────────────────────────────────────────────────────────────────────────
// Root: `peer border data-[state=checked]:text-ink-base shrink-0 transition outline-none align-middle`
//       `rounded-sm` (= 4px)
//       `border-outline-gray-4 data-[state=checked]:bg-ink-gray-8 data-[state=checked]:border-ink-gray-8`
//   Hover: `hover:border-outline-gray-7 hover:shadow-checkbox-hover hover:data-[state=checked]:bg-ink-gray-7 ...`
//   Active: `active:border-outline-gray-6 active:data-[state=checked]:bg-ink-gray-6 ...`
//   Focus: `focus-visible:border-outline-gray-8 focus-visible:focus-ring ...`
//   Disabled: `disabled:border-outline-gray-2 disabled:bg-surface-gray-1 disabled:cursor-not-allowed ...`
//   Size md: `size-4` (16×16px)   size sm: `size-3.5` (14×14px)
//   Indicator: `<CheckIcon>` size-3 (12px) or size-2.5 (10px)
//
// SELECT (select.tsx)
// ─────────────────────────────────────────────────────────────────────────────
// Trigger base: `flex w-fit items-center justify-between gap-2 min-w-0 transition-colors outline-none border border-transparent`
//   Focus: `focus-visible:bg-surface-base focus-visible:border-outline-gray-4 focus-visible:shadow-sm focus-visible:focus-ring`
//   Active: `active:bg-surface-base active:shadow-sm active:border-outline-gray-4 data-[state=open]:border-outline-gray-4`
//   Placeholder: `placeholder:text-ink-gray-4 text-ink-gray-8`
//   Disabled: `disabled:bg-surface-gray-1 disabled:text-ink-gray-3 disabled:cursor-not-allowed`
//   Invalid: `aria-invalid:focus-ring-red aria-invalid:border-outline-red-3`
//   Size sm: `text-base rounded py-1.5 px-2 h-7` (height 28px, radius 4px)
//   Size md: `text-base rounded py-1.5 px-2.5 h-8` (height 32px, radius 4px)
//   Size lg: `text-xl rounded-md py-1.5 px-3 h-10` (height 40px, radius 10px)
//   Variant subtle: `bg-surface-gray-2 hover:bg-surface-gray-3 hover:border-outline-elevation-2`
//   Variant outline: `bg-surface-base border-outline-gray-2 hover:border-outline-gray-3 hover:shadow-sm`
// Content: `bg-surface-elevation-2 rounded-lg min-w-40 ring-1 ring-black/5 shadow-2xl`
//   Animate: `data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 ...`
// Item: `rounded py-1.5 pe-8 px-2 focus:bg-surface-gray-2 text-ink-gray-7 text-base`
// Separator: `bg-outline-elevation-2 mx-0.5 my-1 h-px`
//
// TEXTAREA (textarea.tsx)
// ─────────────────────────────────────────────────────────────────────────────
// Base: `flex field-sizing-content w-full transition-colors outline-none border border-transparent`
//   `placeholder:text-ink-gray-4 text-ink-gray-8`
//   Focus: `focus-visible:bg-surface-base focus-visible:border-outline-gray-4 focus-visible:shadow-sm focus-visible:focus-ring`
//   Active: `active:bg-surface-base active:shadow-textarea-active active:border-outline-gray-4`
//   Disabled: `disabled:bg-surface-gray-1 disabled:text-ink-gray-3 disabled:cursor-not-allowed`
//   Invalid: `aria-invalid:focus-ring-red aria-invalid:border-outline-red-3`
//   Size sm: `text-p-base rounded py-1.5 px-2 min-h-15` (radius 4px)
//   Size md: `text-p-base rounded-md py-2.5 px-3 min-h-20.5` (radius 10px)
//   Size lg: `text-p-lg rounded-md py-3 px-3.5 min-h-25.5` (radius 10px)
//   Variant subtle: `bg-surface-gray-2 hover:bg-surface-gray-3 hover:border-outline-elevation-2`
//   Variant outline: `bg-surface-base border-outline-gray-2 hover:border-outline-gray-3 hover:shadow-sm`
//
// BADGE (badge.tsx)
// ─────────────────────────────────────────────────────────────────────────────
// Base: `inline-flex items-center justify-center select-none rounded-full whitespace-nowrap gap-1 w-fit shrink-0 overflow-clip`
// Size sm: `h-4 text-xs px-1.5` (16px, 12px font)
// Size md: `h-5 text-xs px-1.5` (20px, 12px font)
// Size lg: `h-6 text-sm px-2`  (24px, 13px font)
// Variant × Theme combinations (examples):
//   subtle gray: `text-ink-gray-6 bg-surface-gray-2`
//   solid gray: `text-ink-base bg-surface-gray-10`
//   outline gray: `text-ink-gray-6 border-outline-gray-2 bg-transparent border`
//   solid blue: `text-ink-blue-1 bg-surface-blue-7`
//   subtle green: `text-ink-green-8 bg-surface-green-2`
//   subtle red: `text-ink-red-8 bg-surface-red-2`
//   solid red: `text-ink-red-1 bg-surface-red-7`
//
// TOOLTIP (tooltip.tsx)
// ─────────────────────────────────────────────────────────────────────────────
// Provider: `delayDuration = 500`
// Content: `bg-surface-gray-10 shadow-xl text-ink-base rounded px-2 py-1 text-p-xs`
//   Animate: `animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 ...`
//   `z-50 w-fit origin-(--radix-tooltip-content-transform-origin)`
//   sideOffset: 2
// Arrow: `fill-surface-gray-10` width 8 height 4
//
// DIALOG (dialog.tsx)
// ─────────────────────────────────────────────────────────────────────────────
// Overlay: `fixed inset-0 z-50 bg-black-200 dark:bg-black-700`
//   Animate: `data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0`
// Content: `bg-surface-elevation-1 shadow-xl rounded-xl`
//   `fixed top-[50%] left-[50%] z-50 flex flex-col w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%]`
//   `gap-4 p-6 duration-200 outline-none sm:max-w-lg max-h-[90vh] overflow-y-auto`
//   Animate: `data-[state=open]:animate-in data-[state=closed]:animate-out ... zoom-out-95 zoom-in-95`
// Header: `flex flex-col gap-2 sm:text-start`
// Footer: `flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2`
// Title: `text-base-medium` (font-weight-medium)
// Description: `text-p-sm text-ink-gray-5`
//
// SEPARATOR (separator.tsx)
// ─────────────────────────────────────────────────────────────────────────────
// Root: `bg-outline-gray-2 shrink-0`
//   Horizontal: `data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full` (1px)
//   Vertical: `data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px`
// Default: horizontal, decorative=true
// Used between settings form rows (SettingsFormRow) in Raven's settings panels.
//
// ── Fcode mapping notes ──────────────────────────────────────────────────────
// - Checkbox: not used directly in Settings pages (Raven uses it internally).
//   Fcode uses <input type="checkbox"> with settings-specific CSS.
// - Select: Raven's <SelectTrigger> rounded = 4px. Fcode .field-select now uses
//   --ds-settings-radius-ctrl = var(--radius-1) = 4px inside .settings-shell (S4).
// - Textarea: Raven rounded = 4px (sm). Fcode .field-textarea now uses
//   --ds-settings-radius-ctrl = 4px inside .settings-shell (S4).
// - Badge: Raven rounded-full. Fcode .badge already uses var(--radius-full). ✓
// - Tooltip: Raven rounded = 4px. Fcode tooltips use --radius-sm = 10px (Fcode scale).
//   This is a Fcode-only control (exception §5.5.1) — styling is Fcode's own.
// - Dialog: Raven rounded-xl = 20px. Fcode dialogs use --radius-xl = 20px. ✓
// - Separator: Raven bg-outline-gray-2, 1px. Fcode uses --ds-settings-separator
//   = var(--outline-gray-2), 1px border-bottom on .settings-panel .settings-row (S3). ✓
