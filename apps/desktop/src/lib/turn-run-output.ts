import type { UiMessage } from "@pi-desktop/shared";
import { getToolAction } from "./tool-display";

export type TurnRunOutput = { messageId: string; toolName: string; output: string };

function runOutputOf(message: UiMessage): string | null {
  const result = message.toolResult;
  if (!result || typeof result !== "object") return null;
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object") return null;
  const { stdout, output } = details as { stdout?: unknown; output?: unknown };
  const text = typeof stdout === "string" ? stdout : typeof output === "string" ? output : "";
  return text.trim() ? text.replace(/\s+$/, "") : null;
}

/** The turn's most recent finished shell command with output — the transcript
 * shows it as the turn's "bash · output" block (pages-d/chat .d-code-block). */
export function latestTurnRunOutput(messages: readonly UiMessage[]): TurnRunOutput | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "tool" || message.toolStatus !== "success") continue;
    if (getToolAction(message.toolName) !== "run") continue;
    const output = runOutputOf(message);
    if (output) {
      return { messageId: message.id, toolName: (message.toolName ?? "").toLowerCase(), output };
    }
  }
  return null;
}
