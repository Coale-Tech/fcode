/**
 * omp extension_ui_request → Fcode event mapper (E9, E20).
 *
 * omp's extension_ui_request.method values and their PI equivalents:
 * - "confirm"         → tool_permission_request (PermissionCard)
 * - "select"          → asktool_request (AskToolCard)
 * - "input"           → asktool_request (AskToolCard, single-line)
 * - "editor"          → asktool_request (AskToolCard, multiline textarea)
 * - "cancel"          → clear the pending-request map entry (E9)
 * - "notify"          → system UiMessage
 * - "open_url"        → shell.openExternal + system UiMessage
 * - "setStatus"       → ext_status (status bar / footer line, keyed by statusKey)
 * - "setWidget"       → ext_widget (collapsible block above composer, keyed by widgetKey)
 * - "setTitle"        → ext_title (overrides session title display)
 * - "set_editor_text" → sidecar.ext_ui editor_text (prefill Composer draft)
 */

export interface OmpExtensionUiRequest {
  id: string;
  method: string;
  sessionId?: string;
  title?: string;
  message?: string;
  url?: string;
  launchUrl?: string;
  options?: Array<string | { value: string; label?: string }>;
  /** editor request: initial text for the multiline textarea */
  prefill?: string;
  defaultValue?: string;
  /** set_editor_text wire field */
  text?: string;
  /** setStatus wire fields */
  statusKey?: string;
  statusText?: string;
  /** setWidget wire fields */
  widgetKey?: string;
  widgetLines?: string[];
  widgetPlacement?: "aboveEditor" | "belowEditor";
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
    multiline?: boolean;
    defaultText?: string;
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

export interface MappedSetEditorText {
  type: "set_editor_text";
  sessionId: string;
  text: string;
}

export interface MappedExtStatus {
  type: "ext_status";
  sessionId: string;
  key: string;
  text: string | undefined;
}

export interface MappedExtWidget {
  type: "ext_widget";
  sessionId: string;
  key: string;
  lines: string[] | undefined;
}

export interface MappedExtTitle {
  type: "ext_title";
  sessionId: string;
  title: string;
}

export type MappedUiRequest =
  | MappedToolPermissionRequest
  | MappedAskToolRequest
  | MappedSystemMessage
  | MappedOpenUrl
  | MappedSetEditorText
  | MappedExtStatus
  | MappedExtWidget
  | MappedExtTitle
  | null; // null = cancel

/**
 * Map one omp extension_ui_request frame to its Fcode equivalent.
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
      const options = req.options?.map((o) => (typeof o === "string" ? o : o.value)) ?? [];
      // omp asks tool approval as select ["Approve","Deny"] titled "Allow tool: <name>\n<details>".
      const approval = req.method === "select" && options.join() === "Approve,Deny"
        ? /^Allow tool: ([^\n]+)\n?([\s\S]*)$/.exec(req.title ?? "")
        : null;
      if (approval) {
        return {
          type: "tool_permission_request",
          requestId: req.id,
          sessionId,
          toolCallId,
          toolName: openTool?.toolName ?? approval[1],
          argsPreview: approval[2],
          risk: "high",
          reason: "",
        };
      }
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
      return {
        type: "asktool_request",
        requestId: req.id,
        sessionId,
        toolCallId,
        questions: [
          {
            question: req.title ?? req.message ?? "",
            options: [],
            multiSelect: false,
            multiline: true,
            defaultText: req.prefill,
          },
        ],
      };

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

    case "setStatus":
      return {
        type: "ext_status",
        sessionId,
        key: req.statusKey ?? "",
        text: req.statusText,
      };

    case "setWidget":
      return {
        type: "ext_widget",
        sessionId,
        key: req.widgetKey ?? "",
        lines: req.widgetLines,
      };

    case "setTitle":
      return {
        type: "ext_title",
        sessionId,
        title: req.title ?? "",
      };

    case "set_editor_text":
      return {
        type: "set_editor_text",
        sessionId,
        text: req.text ?? "",
      };

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
