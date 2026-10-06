/**
 * omp message frames -> PI `AgentEvent`s.
 *
 * omp ships `message_*` frames with `content` as an array of blocks and an
 * out-of-band `messageId`; PI's renderer expects a `UiMessage` with string
 * `content` and `stream:"delta"` updates. Only assistant messages cross over:
 * user rows are added optimistically by the host, tool rows are built from
 * `tool_*` events, and omp-internal roles (`custom`, `toolResult`) have no PI row.
 */

import { randomUUID } from "node:crypto";
import type { AgentEvent, MessageUsage, UiMessage } from "@pi-desktop/shared";

// omp numbers messages from msg-1 again in every process, while the host
// keeps ids for good and skips a final row whose id the session already has.
// Without a per-process prefix, replies after an omp restart are lost.
const PROCESS_ID = randomUUID();

type Frame = Record<string, any>;

function blockText(content: unknown, type: string, key: string): string {
  if (typeof content === "string") return type === "text" ? content : "";
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b?.type === type && typeof b[key] === "string")
    .map((b) => b[key] as string)
    .join("");
}

function usageOf(u: Frame | undefined): MessageUsage | undefined {
  if (!u) return undefined;
  return {
    inputTokens: u.input ?? 0,
    outputTokens: u.output ?? 0,
    ...(u.cacheRead ? { cacheReadTokens: u.cacheRead } : {}),
    ...(u.cacheWrite ? { cacheWriteTokens: u.cacheWrite } : {}),
    totalTokens: u.totalTokens ?? (u.input ?? 0) + (u.output ?? 0),
  };
}

function toUiMessage(frame: Frame, final: boolean): UiMessage | null {
  const m = frame.message as Frame | undefined;
  if (m?.role !== "assistant" || !frame.messageId) return null;
  const stop = String(m.stopReason ?? "");
  const thinking = blockText(m.content, "thinking", "thinking");
  const usage = final ? usageOf(m.usage) : undefined;
  return {
    id: `${PROCESS_ID}:${String(frame.messageId)}`,
    role: "assistant",
    // Streaming rows start empty: text arrives as deltas, message_end carries the full text.
    content: final ? blockText(m.content, "text", "text") : "",
    ...(final && thinking ? { thinking } : {}),
    createdAt: new Date(m.timestamp ?? Date.now()).toISOString(),
    status: !final ? "streaming" : stop === "error" ? "error" : stop === "aborted" ? "aborted" : "complete",
    ...(m.model ? { modelId: String(m.model) } : {}),
    ...(m.provider ? { providerId: String(m.provider) } : {}),
    ...(usage ? { usage } : {}),
  };
}

/** Convert one omp `message_*` frame; null = no PI counterpart. */
export function adaptMessageFrame(frame: Frame): AgentEvent | null {
  if (frame.type === "message_start") {
    const message = toUiMessage(frame, false);
    return message && { type: "message_start", message };
  }
  if (frame.type === "message_end") {
    const message = toUiMessage(frame, true);
    return message && { type: "message_end", message };
  }
  if (frame.type === "message_update") {
    const ev = frame.assistantMessageEvent as Frame | undefined;
    const message = toUiMessage({ message: ev?.partial, messageId: frame.messageId }, false);
    if (!message || typeof ev?.delta !== "string") return null;
    if (ev.type === "text_delta") {
      return { type: "message_update", stream: "delta", message, deltaText: ev.delta };
    }
    if (ev.type === "thinking_delta") {
      return { type: "message_update", stream: "delta", message, deltaThinking: ev.delta };
    }
  }
  return null;
}
