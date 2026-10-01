import type { UiMessage } from "@pi-desktop/shared";
import type { AssistantActivityItem } from "./assistant-turns";
import { getToolAction, getToolDisplayName, getToolSummary } from "./tool-display";
import { runOutcome } from "./tool-presentation";
import { isDelegationActivityItem, subagentOutcome, type SubagentOutcome } from "./subagent-topology";

export function activityItemHasIssue(item: AssistantActivityItem): boolean {
  if (item.kind === "hostedSearch") return item.round.status === "failed";
  if (item.kind !== "tool") return false;
  const message = item.message;
  return message.toolStatus === "error" || message.toolStatus === "denied" ||
    Boolean(message.isError) ||
    (getToolAction(message.toolName) === "run" && runOutcome(message) === "failed");
}

export function visibleActivityItems(
  items: readonly AssistantActivityItem[],
  compact: boolean,
  active: boolean,
) {
  return items.filter((item) => item.kind !== "thinking" || !compact ||
    (active && item.message.status === "streaming" && !item.message.content.trim()));
}

export function activitySummary(items: readonly AssistantActivityItem[], statuses?: ReadonlyMap<string, SubagentOutcome>) {
  const tools = items.filter((item) => item.kind !== "thinking");
  const thinking = items.length - tools.length;
  const actions = tools.map((item) => item.kind === "hostedSearch"
    ? "search" : getToolAction(item.message.toolName));
  const label = tools.length === 0 ? "chat.activityThinking"
    : actions.every((action) => action === "run") ? "chat.activityCommands"
    : actions.every((action) => action === "search") ? "chat.activitySearches"
    : "chat.activityTools";
  return {
    label,
    count: tools.length || thinking,
    tools: tools.length,
    thinking,
    issues: items.filter((item) => {
      if (!isDelegationActivityItem(item)) return activityItemHasIssue(item);
      const outcome = subagentOutcome(item.message, statuses);
      return outcome === "failed" || outcome === "denied";
    }).length,
  };
}

export type ActivityTimelineRow = {
  id: string;
  name: string;
  target: string;
  status: "running" | "ok" | "error";
  durationMs: number | undefined;
};

/** Build tool-timeline rows from all session messages (newest last). */
export function buildActivityTimeline(messages: readonly UiMessage[]): ActivityTimelineRow[] {
  return messages
    .filter((m) => m.role === "tool" && m.toolName)
    .map((m) => ({
      id: m.toolCallId ?? m.id,
      name: getToolDisplayName(m.toolName),
      target: getToolSummary(m.toolName, m.toolArgs),
      status: m.toolStatus === "running" ? "running"
        : (m.toolStatus === "error" || m.toolStatus === "denied") ? "error"
        : "ok",
      durationMs: m.toolDurationMs,
    }));
}
