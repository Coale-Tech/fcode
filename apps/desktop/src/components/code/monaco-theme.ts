/**
 * monaco-theme.ts — Build a Monaco editor theme from the app's CSS design
 * tokens at runtime (T12).
 *
 * Instead of shipping vs-dark, this reads `--ds-*` custom properties from
 * `document.documentElement` at call time so the theme updates correctly on
 * theme switch without a reload.
 *
 * Usage:
 *   <Editor theme={buildMonacoTheme()} … />
 *
 * Note: the embedded Frappe/Builder/Studio canvas's own scrollbars, caret and
 * selection colour are left entirely to Frappe — this module does not inject
 * any CSS into that WebContentsView.
 */

/** Read a CSS custom property value from the document root. */
function token(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

const DARK_THEME_NAME = "fcode-dark" as const;
const LIGHT_THEME_NAME = "fcode-light" as const;

/**
 * Detect which theme is active by sampling `--ds-bg-primary`.
 * Dark theme has a dark background (~#181818); light has #ffffff.
 */
function isDarkTheme(): boolean {
  const bg = token("--ds-bg-primary");
  // A dark background starts with '#1' or is a very dark hex/rgb value.
  // We use the presence of 'data-theme="dark"' as the canonical signal.
  return document.documentElement.getAttribute("data-theme") !== "light";
}

/**
 * Register (or re-register) the Fcode Monaco theme with the editor API and
 * return the theme name to pass to the `theme` prop of `<Editor />`.
 *
 * Must be called in the renderer; `document` must be available.
 *
 * @param monaco - The monaco namespace (from `@monaco-editor/react` beforeMount
 *   or `loader.init()`). Accepts `typeof import('monaco-editor')`.
 */
export function buildMonacoTheme(
  monaco: { editor: { defineTheme: (name: string, data: unknown) => void } },
): string {
  const dark = isDarkTheme();
  const themeName = dark ? DARK_THEME_NAME : LIGHT_THEME_NAME;

  const bg = token("--ds-bg-primary");
  const bgSecondary = token("--ds-bg-secondary");
  const fg = token("--ds-text-primary");
  const fgSecondary = token("--ds-text-secondary");
  const border = token("--ds-border-default");
  const accent = token("--ds-accent");

  // Monaco theme data structure.
  // We derive a minimal palette from the design tokens and leave syntax
  // highlighting at Monaco's defaults for the base theme.
  const themeData = {
    base: dark ? "vs-dark" : "vs",
    inherit: true, // inherit syntax colours from the base
    rules: [] as unknown[],
    colors: {
      "editor.background": bg || (dark ? "#181818" : "#ffffff"),
      "editor.foreground": fg || (dark ? "#f0f0f0" : "#1a1c1f"),
      "editorLineNumber.foreground": fgSecondary || (dark ? "#808080" : "#888"),
      "editor.lineHighlightBackground":
        bgSecondary || (dark ? "#222222" : "#f9f9f9"),
      "editorWidget.background": bgSecondary || (dark ? "#222222" : "#f9f9f9"),
      "editorSuggestWidget.background":
        bgSecondary || (dark ? "#222222" : "#f9f9f9"),
      "editorSuggestWidget.border": border || (dark ? "#333" : "#ddd"),
      "focusBorder": accent || (dark ? "#f0f0f0" : "#1a1c1f"),
    },
  };

  monaco.editor.defineTheme(themeName, themeData);
  return themeName;
}
