/**
 * Design Mode contract: one element the user picked in the Browser guest page.
 * Pure types + constants only, so main (`electron/main/browser-grab.ts`) and the
 * renderer both import it. The guest page is untrusted: main MUST clamp every
 * field to these budgets before anything leaves main (`clampElementGrab`).
 */
/** The intent behind one Design Mode annotation pick. */
export type AnnotationIntent = "change" | "fix" | "question";

export type ElementGrabReact = {
  component: string;
  /** Dev builds only (fiber `_debugSource`). */
  source?: { file: string; line: number };
};

export type ElementGrab = {
  /** Page URL with query and hash stripped. */
  url: string;
  title: string;
  /** Unique-ish CSS selector. */
  selector: string;
  /** Human readable ancestry, e.g. `main > section.hero > button#cta`. */
  path: string;
  tag: string;
  /** Accessible name (aria-label / label / text), may be empty. */
  accessibleName: string;
  /** Visible text near the element (own text + nearest siblings), clamped. */
  nearbyText: string;
  outerHTML: string;
  /** Small computed-style subset (see ELEMENT_GRAB_STYLE_KEYS). */
  styles: Record<string, string>;
  /** Viewport CSS px at pick time. */
  rect: { x: number; y: number; width: number; height: number };
  /** Element or an ancestor is position:fixed/sticky. */
  fixedOrSticky: boolean;
  react?: ElementGrabReact;
  /** Cropped to the element box (+padding). Base64 without data: prefix. */
  screenshot?: { mimeType: "image/jpeg" | "image/png"; dataBase64: string };
};

export const ELEMENT_GRAB_STYLE_KEYS = [
  "display", "position", "color", "background-color", "font-family", "font-size",
  "font-weight", "line-height", "margin", "padding", "border", "border-radius",
  "width", "height", "opacity", "z-index",
] as const;

/** Budgets enforced by main. Characters unless noted. */
export const ELEMENT_GRAB_BUDGETS = {
  url: 512,
  title: 200,
  selector: 400,
  path: 600,
  tag: 40,
  accessibleName: 200,
  nearbyText: 600,
  outerHTML: 4000,
  styleValue: 200,
  reactComponent: 120,
  sourceFile: 300,
  screenshotBase64: 1_500_000,
} as const;

/** Result of one pick. `null` = user cancelled (Esc / toggled off / navigated away). */
export type ElementPickResult = ElementGrab | null;
