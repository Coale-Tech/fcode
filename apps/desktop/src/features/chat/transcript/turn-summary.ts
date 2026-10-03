/**
 * Pure turn-level tool-action counter (I.3).
 * Groups raw activity items into five verb buckets for the summary chip.
 */
import type { AssistantActivityItem } from "../../../lib/assistant-turns";
import { getToolAction } from "../../../lib/tool-display";

export type TurnSummary = {
  edited: number;   // write + edit
  ran: number;      // run (shell commands)
  read: number;     // read + list
  fetched: number;  // fetch (URLs)
  searched: number; // search + hostedSearch
};

/** Count tool actions across all items in one assistant turn. */
export function summarizeTurn(items: readonly AssistantActivityItem[]): TurnSummary {
  let edited = 0, ran = 0, read = 0, fetched = 0, searched = 0;
  for (const item of items) {
    if (item.kind === "thinking") continue;
    if (item.kind === "hostedSearch") { searched++; continue; }
    const action = getToolAction(item.message.toolName);
    if (action === "write" || action === "edit") edited++;
    else if (action === "run") ran++;
    else if (action === "read" || action === "list") read++;
    else if (action === "fetch") fetched++;
    else if (action === "search") searched++;
    // delegate/fork/use omitted — too abstract to count meaningfully
  }
  return { edited, ran, read, fetched, searched };
}

/** True when the summary has at least one non-zero count. */
export function hasSummary(s: TurnSummary): boolean {
  return s.edited > 0 || s.ran > 0 || s.read > 0 || s.fetched > 0 || s.searched > 0;
}
