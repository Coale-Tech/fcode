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
    selector: ".settings-toggle",
    properties: ["width", "height", "transition-duration"],
    expected: {
      width: "32px",           // Raven md: h-5 w-8 = 20×32
      height: "20px",
      "transition-duration": "300ms",  // FD4
    },
    exception: null,
  },

  // ── Switch/toggle thumb ────────────────────────────────────────────────────
  {
    id: "toggle-thumb",
    label: "Toggle thumb (.settings-toggle-thumb)",
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
