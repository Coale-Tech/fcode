/**
 * Pure, deterministic markdown block an agent reads for a Design Mode pick.
 * Importable from both renderer and main (no Electron/DOM imports).
 */
import type { AnnotationIntent, ElementGrab } from "./element-grab";

/** Code fence longer than any backtick run inside, so page HTML cannot close it early. */
function fenced(lang: string, body: string): string {
  const longest = Math.max(2, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${lang}\n${body}\n${fence}`;
}

export function formatElementGrabPrompt(grab: ElementGrab, intent?: AnnotationIntent): string {
  const parts: string[] = [];

  if (intent) {
    parts.push(`**Intent:** ${intent}`);
  }

  parts.push(`**Page:** ${grab.url}${grab.title ? ` — ${grab.title}` : ""}`);
  parts.push(`**Element:** \`${grab.selector.replace(/`/g, "'")}\``);
  if (grab.path && grab.path !== grab.selector) {
    parts.push(`**Path:** ${grab.path}`);
  }
  if (grab.accessibleName) {
    parts.push(`**Accessible name:** ${grab.accessibleName}`);
  }
  if (grab.nearbyText) {
    parts.push(`**Nearby text:** ${grab.nearbyText}`);
  }
  if (grab.react) {
    const src = grab.react.source ? ` (${grab.react.source.file}:${grab.react.source.line})` : "";
    parts.push(`**React component:** ${grab.react.component}${src}`);
  }

  const styleEntries = Object.entries(grab.styles).filter(([, v]) => v);
  if (styleEntries.length > 0) {
    const styleLines = styleEntries.map(([k, v]) => `  ${k}: ${v};`).join("\n");
    parts.push(`**Computed styles:**\n${fenced("css", styleLines)}`);
  }

  parts.push(`**Outer HTML:**\n${fenced("html", grab.outerHTML)}`);

  return parts.join("\n");
}
