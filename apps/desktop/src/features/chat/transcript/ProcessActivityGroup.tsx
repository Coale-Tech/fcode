import { type ReactNode } from "react";
import type { AssistantActivityItem } from "../../../lib/assistant-turns";
import { DisclosureScope, type useAutomaticDisclosure } from "./disclosure";

/** Keep the body identity stable when a singleton grows into a group. */
export function ProcessActivityGroup({
  items,
  active: _active,
  disclosure,
  children,
}: {
  items: readonly AssistantActivityItem[];
  active: boolean;
  disclosure: ReturnType<typeof useAutomaticDisclosure>;
  children: ReactNode;
}) {
  // D design: tools always expand inline — no collapsible summary header.
  if (items.length === 0) return null;
  return (
    <div className="process-activity-group singleton open">
      <DisclosureScope disclosure={disclosure} open={true}>{children}</DisclosureScope>
    </div>
  );
}
