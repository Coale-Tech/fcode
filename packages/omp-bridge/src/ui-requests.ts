/**
 * omp extension_ui_request → PI-Desktop event mapper (E9, E20).
 *
 * omp's extension_ui_request.method values and their PI equivalents:
 * - "confirm"  → tool_permission_request (PermissionCard)
 * - "select"   → asktool_request (AskToolCard)
 * - "input"    → asktool_request (AskToolCard)
 * - "editor"   → explicit refusal response (no PI counterpart)
 * - "cancel"   → clear the pending-request map entry (E9)
 * - "notify"   → system UiMessage
 * - "open_url" → shell.openExternal + system UiMessage
 * - "setStatus"/"setWidget"/"setTitle" → explicitly ignored
 */

export interface OmpExtensionUiRequest {
  id: string;
  method: string;
  sessionId?: string;
  title?: string;
  message?: string;
  url?: string;
  launchUrl?: string;
  options?: Array<{ value: string; label?: string }>;
  defaultValue?: string;
}

export interface MappedToolPermissionRequest {
  type: "tool_permission_request";
  requestId: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  argsPreview: string;
  risk: "high" | "low";
  reason: string;
}

export interface MappedAskToolRequest {
  type: "asktool_request";
  requestId: string;
  sessionId: string;
  toolCallId: string;
  questions: Array<{
    question: string;
    options: string[];
    multiSelect: boolean;
  }>;
}

export interface MappedSystemMessage {
  type: "system_message";
  sessionId: string;
  text: string;
}

export interface MappedOpenUrl {
  type: "open_url";
  url: string;
  sessionId: string;
  text: string;
}

export interface MappedEditorRefusal {
  type: "editor_refusal";
  requestId: string;
}

export type MappedUiRequest =
  | MappedToolPermissionRequest
  | MappedAskToolRequest
  | MappedSystemMessage
  | MappedOpenUrl
  | MappedEditorRefusal
  | null; // null = cancel or ignored method

/**
 * Map one omp extension_ui_request frame to its PI-Desktop equivalent.
 * Returns null for methods that are cleared (cancel) or safely ignored.
 *
 * @param req - The omp frame
 * @param sessionId - resolved session id (omp may omit it)
 * @param openTool - most-recent open tool_execution_start, if any
 */
export function mapExtensionUiRequest(
  req: OmpExtensionUiRequest,
  sessionId: string,
  openTool: { toolCallId: string; toolName: string } | undefined,
): MappedUiRequest {
  const toolCallId = openTool?.toolCallId ?? req.id;
  const toolName = openTool?.toolName ?? (req.title ?? "tool");

  switch (req.method) {
    case "confirm":
      return {
        type: "tool_permission_request",
        requestId: req.id,
        sessionId,
        toolCallId,
        toolName,
        // argsPreview carries site, method and kwargs for bench tools (design D14)
        argsPreview: req.title ?? "",
        risk: "high",
        reason: req.message ?? "",
      };

    case "select":
    case "input": {
      const options = req.options?.map((o) => o.value) ?? [];
      return {
        type: "asktool_request",
        requestId: req.id,
        sessionId,
        toolCallId,
        questions: [
          {
            question: req.message ?? req.title ?? "",
            options,
            multiSelect: false,
          },
        ],
      };
    }

    case "editor":
      // No PI counterpart; respond immediately with a refusal so the tool turn
      // does not hang (E9).
      return { type: "editor_refusal", requestId: req.id };

    case "notify":
      return {
        type: "system_message",
        sessionId,
        text: req.message ?? req.title ?? "",
      };

    case "open_url": {
      const url = req.launchUrl ?? req.url ?? "";
      return {
        type: "open_url",
        url,
        sessionId,
        text: `Opening ${url}`,
      };
    }

    case "cancel":
      // Cleared by the caller; signal the pending-request map to drop the entry.
      return null;

    // setStatus / setWidget / setTitle — no PI surface; ignore.
    default:
      return null;
  }
}

/**
 * Serialize multi-select answers for omp's extension_ui_response (E20).
 *
 * AskToolResolution.answers is Array<string[] | null> — one array per question.
 * omp's response schema carries a single string value, so we join multi-select
 * answers with a NUL byte as the wire delimiter (safe: no omp field uses NUL).
 * A null entry means the question was cancelled.
 */
export function serializeAskAnswers(answers: Array<string[] | null>): string | null {
  if (!answers.length) return null;
  const firstAnswer = answers[0];
  if (!firstAnswer) return null;
  // ponytail: NUL delimiter — simple and unambiguous for omp's string field.
  return firstAnswer.join("\0");
}
