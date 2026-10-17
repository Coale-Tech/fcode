/**
 * Per-app glyph for bench detail lists (D-kit bench fragment): well-known
 * Frappe apps get their own icon and hue; anything else gets a neutral package.
 */
import type { ComponentType } from "react";
import { IconChat, IconPackage, IconSignal, IconTerminal, IconUsers, IconWrench, type IconProps } from "../icons";

type Tone = "gray" | "blue" | "green" | "violet" | "amber";

const KNOWN: Record<string, { Icon: ComponentType<IconProps>; tone: Tone }> = {
  frappe: { Icon: IconTerminal, tone: "gray" },
  erpnext: { Icon: IconSignal, tone: "blue" },
  hrms: { Icon: IconUsers, tone: "green" },
  raven: { Icon: IconChat, tone: "violet" },
  frappe_assistant: { Icon: IconWrench, tone: "amber" },
};

function glyphFor(app: string): { Icon: ComponentType<IconProps>; tone: Tone } {
  return KNOWN[app] ?? { Icon: IconPackage, tone: "gray" };
}

/** `boxed` draws the 16px tinted tile used in the Apps list; bare draws the tree glyph. */
export function BenchAppIcon({ app, boxed = false }: { app: string; boxed?: boolean }) {
  const { Icon, tone } = glyphFor(app);
  if (!boxed) {
    return <Icon size={12} className={`wb-app-glyph is-${tone}`} aria-hidden="true" />;
  }
  return (
    <span className={`wb-app-detail-icon is-${tone}`} aria-hidden="true">
      <Icon size={10} />
    </span>
  );
}
