/**
 * Tests for extension_ui_request mapping and multi-select serialization (E9, E20).
 */
import { describe, expect, it } from "vitest";
import { classifyToolRisk, mapExtensionUiRequest, serializeAskAnswers } from "./ui-requests.js";

const openTool = { toolCallId: "tc1", toolName: "bash" };

describe("mapExtensionUiRequest", () => {
  it("maps confirm → tool_permission_request", () => {
    const result = mapExtensionUiRequest(
      { id: "r1", method: "confirm", title: "bench execute frappe.utils.now", message: "Allow?" },
      "s1",
      openTool,
    );
    expect(result?.type).toBe("tool_permission_request");
    if (result?.type !== "tool_permission_request") return;
    expect(result.requestId).toBe("r1");
    expect(result.sessionId).toBe("s1");
    expect(result.toolCallId).toBe("tc1");
    expect(result.toolName).toBe("bash");
    // bench execute through bash is neither read-only nor destructive.
    expect(result.risk).toBe("medium");
  });

  it("maps select → asktool_request", () => {
    const result = mapExtensionUiRequest(
      {
        id: "r2",
        method: "select",
        message: "Choose option",
        options: [{ value: "a", label: "A" }, { value: "b", label: "B" }],
      },
      "s1",
      openTool,
    );
    expect(result?.type).toBe("asktool_request");
    if (result?.type !== "asktool_request") return;
    expect(result.questions[0].options).toEqual(["a", "b"]);
    expect(result.questions[0].multiSelect).toBe(false);
  });

  // Real omp frame: tool approval arrives as a select with plain-string options.
  it("maps omp's 'Allow tool' select → tool_permission_request with the command preview", () => {
    const result = mapExtensionUiRequest(
      { id: "r9", method: "select", title: "Allow tool: bash\nCommand: ls /tmp", options: ["Approve", "Deny"] },
      "s1",
      openTool,
    );
    expect(result).toMatchObject({
      type: "tool_permission_request",
      requestId: "r9",
      toolCallId: "tc1",
      toolName: "bash",
      argsPreview: "Command: ls /tmp",
    });
  });

  it("badges an omp bash approval by the command it carries", () => {
    const result = mapExtensionUiRequest(
      { id: "r11", method: "select", title: "Allow tool: bash\nCommand: rm -rf build", options: ["Approve", "Deny"] },
      "s1",
      openTool,
    );
    expect(result).toMatchObject({ type: "tool_permission_request", risk: "high" });
  });

  it("keeps an ordinary select with plain-string options as an ask", () => {
    const result = mapExtensionUiRequest({ id: "r10", method: "select", title: "Pick", options: ["x", "y"] }, "s1", openTool);
    expect(result).toMatchObject({ type: "asktool_request", questions: [{ options: ["x", "y"] }] });
  });

  it("maps input → asktool_request", () => {
    const result = mapExtensionUiRequest(
      { id: "r3", method: "input", message: "Enter value" },
      "s1",
      openTool,
    );
    expect(result?.type).toBe("asktool_request");
    if (result?.type !== "asktool_request") return;
    expect(result.questions[0].options).toEqual([]);
  });

  it("maps editor → asktool_request (multiline textarea)", () => {
    const result = mapExtensionUiRequest(
      { id: "r4", method: "editor", title: "Edit the plan", prefill: "Draft text" },
      "s1",
      openTool,
    );
    expect(result?.type).toBe("asktool_request");
    if (result?.type !== "asktool_request") return;
    expect(result.requestId).toBe("r4");
    expect(result.questions[0].question).toBe("Edit the plan");
    expect(result.questions[0].multiline).toBe(true);
    expect(result.questions[0].defaultText).toBe("Draft text");
    expect(result.questions[0].options).toEqual([]);
  });

  it("editor submit: serializeAskAnswers returns the edited text (boundary)", () => {
    // Simulates user submitting text in the multiline textarea.
    expect(serializeAskAnswers([["Edited content"]])).toBe("Edited content");
  });

  it("editor cancel: serializeAskAnswers returns null (boundary)", () => {
    // Simulates user clicking Decline — answers contain null.
    expect(serializeAskAnswers([null])).toBeNull();
  });

  it("editor timeout: same as cancel — null answer produces null (boundary)", () => {
    // Timeout arrives as a cancelled resolution from the bridge (answers: [null]).
    expect(serializeAskAnswers([null])).toBeNull();
  });

  it("maps set_editor_text → set_editor_text with text and sessionId", () => {
    const result = mapExtensionUiRequest(
      { id: "re", method: "set_editor_text", text: "Hello from omp" },
      "s1",
      openTool,
    );
    expect(result?.type).toBe("set_editor_text");
    if (result?.type !== "set_editor_text") return;
    expect(result.text).toBe("Hello from omp");
    expect(result.sessionId).toBe("s1");
  });

  it("maps cancel → null so the pending-request map entry is cleared (E9)", () => {
    const result = mapExtensionUiRequest(
      { id: "r5", method: "cancel" },
      "s1",
      openTool,
    );
    expect(result).toBeNull();
  });

  it("maps notify → system_message", () => {
    const result = mapExtensionUiRequest(
      { id: "r6", method: "notify", message: "Hello from omp" },
      "s1",
      openTool,
    );
    expect(result?.type).toBe("system_message");
    if (result?.type !== "system_message") return;
    expect(result.text).toBe("Hello from omp");
  });

  it("maps open_url → open_url with the launchUrl preferred", () => {
    const result = mapExtensionUiRequest(
      { id: "r7", method: "open_url", url: "https://fallback", launchUrl: "https://preferred" },
      "s1",
      openTool,
    );
    expect(result?.type).toBe("open_url");
    if (result?.type !== "open_url") return;
    expect(result.url).toBe("https://preferred");
  });

  it("maps setStatus → ext_status with key and text", () => {
    const result = mapExtensionUiRequest(
      { id: "rx", method: "setStatus", statusKey: "progress", statusText: "Working…" },
      "s1",
      openTool,
    );
    expect(result?.type).toBe("ext_status");
    if (result?.type !== "ext_status") return;
    expect(result.key).toBe("progress");
    expect(result.text).toBe("Working…");
    expect(result.sessionId).toBe("s1");
  });

  it("maps setWidget → ext_widget with key and lines", () => {
    const result = mapExtensionUiRequest(
      { id: "ry", method: "setWidget", widgetKey: "info", widgetLines: ["line1", "line2"] },
      "s1",
      openTool,
    );
    expect(result?.type).toBe("ext_widget");
    if (result?.type !== "ext_widget") return;
    expect(result.key).toBe("info");
    expect(result.lines).toEqual(["line1", "line2"]);
  });

  it("maps setTitle → ext_title with title", () => {
    const result = mapExtensionUiRequest(
      { id: "rz", method: "setTitle", title: "My Session" },
      "s1",
      openTool,
    );
    expect(result?.type).toBe("ext_title");
    if (result?.type !== "ext_title") return;
    expect(result.title).toBe("My Session");
  });

  it("falls back to req.id as toolCallId when no open tool is present", () => {
    const result = mapExtensionUiRequest(
      { id: "r8", method: "confirm", message: "Allow?" },
      "s1",
      undefined,
    );
    expect(result?.type).toBe("tool_permission_request");
    if (result?.type !== "tool_permission_request") return;
    expect(result.toolCallId).toBe("r8");
  });
});

describe("classifyToolRisk", () => {
  it("rates read-only bash low and destructive bash high", () => {
    expect(classifyToolRisk("bash", "Command: git status")).toBe("low");
    expect(classifyToolRisk("bash", "Command: rm -rf build")).toBe("high");
    expect(classifyToolRisk("bash", "Command: git push origin main")).toBe("high");
  });

  it("never rates a compound or writing command low", () => {
    expect(classifyToolRisk("bash", "Command: git status && rm -rf /")).toBe("high");
    expect(classifyToolRisk("bash", "Command: git status && make")).toBe("medium");
    expect(classifyToolRisk("bash", "Command: cat a > b")).toBe("medium");
    expect(classifyToolRisk("bash", "Command: git log --output=/tmp/x")).toBe("medium");
    expect(classifyToolRisk("bash", "Command: git difftool -y --extcmd='touch /tmp/proof' HEAD")).toBe("medium");
    expect(classifyToolRisk("bash", "Command: file -C -m magic")).toBe("medium");
    expect(classifyToolRisk("bash", "Command: git diff HEAD~1")).toBe("low");
    expect(classifyToolRisk("bash", "Command: find . -delete")).toBe("medium");
  });

  it("rates tools by name, defaulting to medium", () => {
    expect(classifyToolRisk("read", "")).toBe("low");
    expect(classifyToolRisk("kanban_show", "")).toBe("low");
    expect(classifyToolRisk("edit", "src/a.ts")).toBe("high");
    expect(classifyToolRisk("some_mcp_tool", "")).toBe("medium");
    expect(classifyToolRisk("constructor", "")).toBe("medium");
  });
});

describe("serializeAskAnswers (E20 — multi-select wire format)", () => {
  it("joins multi-select answers with NUL delimiter", () => {
    const result = serializeAskAnswers([["a", "b", "c"]]);
    expect(result).toBe("a\0b\0c");
  });

  it("returns the single value for a single-select answer", () => {
    expect(serializeAskAnswers([["yes"]])).toBe("yes");
  });

  it("returns null for a cancelled answer (null entry)", () => {
    expect(serializeAskAnswers([null])).toBeNull();
  });

  it("returns null for an empty answers array", () => {
    expect(serializeAskAnswers([])).toBeNull();
  });
});
