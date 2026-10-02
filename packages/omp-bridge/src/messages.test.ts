/**
 * Frames below are captured from the real omp binary (--mode rpc): no
 * sessionId/turnId, content as block arrays, id in `messageId`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMessageUpdate, type AgentEvent, type UiMessage } from "@pi-desktop/shared";
import { OmpBridge } from "./bridge.js";
import { adaptMessageFrame } from "./messages.js";

type Notif = {
  method: string;
  params: { sessionId: string; turnId: string; event: { type: string; toolCallId?: string; toolName?: string } };
};
const rowOf = (e: AgentEvent | null): UiMessage => {
  if (e && "message" in e) return e.message;
  throw new Error("event has no message");
};

const usage = { input: 3, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 8 };
const partial = (text: string) => ({
  role: "assistant",
  content: [{ type: "text", text }],
  provider: "mock",
  model: "mock-1",
  timestamp: 1790922715402,
});

describe("adaptMessageFrame", () => {
  it("streams assistant text as deltas that rebuild the final text", () => {
    const start = adaptMessageFrame({ type: "message_start", messageId: "msg-5", message: partial("Done: ") });
    expect(start).toMatchObject({ type: "message_start", message: { id: "msg-5", role: "assistant", content: "", status: "streaming" } });

    let row = rowOf(start);
    for (const delta of ["Done: ", "check passed."]) {
      const ev = adaptMessageFrame({
        type: "message_update",
        messageId: "msg-5",
        assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta, partial: partial(delta) },
      });
      expect(ev).toMatchObject({ type: "message_update", stream: "delta", deltaText: delta });
      row = applyMessageUpdate(row, ev as Extract<AgentEvent, { type: "message_update" }>);
    }
    expect(row.content).toBe("Done: check passed.");
  });

  it("final message_end carries full text, thinking, usage, model", () => {
    const end = adaptMessageFrame({
      type: "message_end",
      messageId: "msg-3",
      message: {
        ...partial(""),
        content: [
          { type: "thinking", thinking: "hmm" },
          { type: "text", text: "Running " },
          { type: "toolCall", id: "call_1", name: "bash", arguments: {} },
          { type: "text", text: "now" },
        ],
        usage,
        stopReason: "toolUse",
      },
    });
    expect(end).toMatchObject({
      type: "message_end",
      message: {
        id: "msg-3",
        content: "Running now",
        thinking: "hmm",
        status: "complete",
        modelId: "mock-1",
        providerId: "mock",
        usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
      },
    });
  });

  it("maps provider error / abort stop reasons to row status", () => {
    const status = (stopReason: string) =>
      rowOf(adaptMessageFrame({ type: "message_end", messageId: "m", message: { ...partial("x"), stopReason } })).status;
    expect(status("error")).toBe("error");
    expect(status("aborted")).toBe("aborted");
  });

  it("drops frames with no PI row: user, toolResult, custom, non-text update subtypes", () => {
    for (const role of ["user", "toolResult", "custom"]) {
      expect(adaptMessageFrame({ type: "message_start", messageId: "m", message: { role, content: "x" } })).toBeNull();
      expect(adaptMessageFrame({ type: "message_end", messageId: "m", message: { role, content: "x" } })).toBeNull();
    }
    expect(
      adaptMessageFrame({
        type: "message_update",
        messageId: "m",
        assistantMessageEvent: { type: "toolcall_delta", delta: "{", partial: partial("") },
      }),
    ).toBeNull();
  });

  it("forwards thinking deltas", () => {
    expect(
      adaptMessageFrame({
        type: "message_update",
        messageId: "m",
        assistantMessageEvent: { type: "thinking_delta", delta: "hm", partial: partial("") },
      }),
    ).toMatchObject({ stream: "delta", deltaThinking: "hm" });
  });
});

describe("OmpBridge stamps session/turn on omp frames", () => {
  const orig = process.stdout.write.bind(process.stdout);
  afterEach(() => {
    process.stdout.write = orig;
    vi.restoreAllMocks();
  });

  it("agent_start, adapted messages and tool events carry the active prompt's ids", () => {
    const bridge = new OmpBridge();
    (bridge as unknown as { activeTurn: unknown }).activeTurn = { sessionId: "s1", turnId: "t1" };
    const out: Notif[] = [];
    process.stdout.write = ((d: string) => (out.push(JSON.parse(d.trim())), true)) as typeof process.stdout.write;

    for (const frame of [
      { type: "agent_start" },
      { type: "message_start", messageId: "msg-3", message: partial("hi") },
      { type: "tool_execution_start", toolCallId: "call_1", toolName: "bash", args: { command: "ls" } },
      { type: "message_start", messageId: "msg-4", message: { role: "toolResult", content: [] } },
    ]) {
      bridge.handleOmpFrame(JSON.stringify(frame));
    }

    const events = out.filter((m) => m.method === "agent.event").map((m) => m.params);
    expect(events.map((p) => p.event.type)).toEqual(["agent_start", "message_start", "tool_start"]);
    for (const p of events) expect(p).toMatchObject({ sessionId: "s1", turnId: "t1" });
    expect(events[2].event).toMatchObject({ toolCallId: "call_1", toolName: "bash" });
  });
});

describe("tool_permission.resolve answers omp's select-style approval", () => {
  const orig = process.stdout.write.bind(process.stdout);
  afterEach(() => {
    process.stdout.write = orig;
  });

  function resolveWith(decision: string): Record<string, unknown> {
    const bridge = new OmpBridge();
    (bridge as unknown as { activeTurn: unknown }).activeTurn = { sessionId: "s1", turnId: "t1" };
    const sent: Record<string, unknown>[] = [];
    (bridge as unknown as { sendToOmp: (m: Record<string, unknown>) => void }).sendToOmp = (m) => sent.push(m);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    bridge.handleOmpFrame(JSON.stringify({ type: "tool_execution_start", toolCallId: "c1", toolName: "bash", args: {} }));
    bridge.handleOmpFrame(
      JSON.stringify({ type: "extension_ui_request", id: "u1", method: "select", title: "Allow tool: bash\nCommand: ls", options: ["Approve", "Deny"] }),
    );
    bridge.handleHostFrame({ jsonrpc: "2.0", id: "h1", method: "tool_permission.resolve", params: { requestId: "u1", decision } });
    return sent[0];
  }

  it("Approve / Deny values, not a boolean", () => {
    expect(resolveWith("allow_once")).toEqual({ type: "extension_ui_response", id: "u1", value: "Approve" });
    expect(resolveWith("deny")).toEqual({ type: "extension_ui_response", id: "u1", value: "Deny" });
  });
});
