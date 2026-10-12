/**
 * Studio doc-method actions for the `fcode_studio` host tool.
 *
 * Studio's publish/export controls are whitelisted *document methods*, which
 * `bench execute <dotted.path>` cannot reach (`frappe.handler.run_doc_method`
 * needs an HTTP request). `bench execute` does eval() any non-importable
 * method string, so each action becomes one fixed Python expression; the only
 * agent-controlled parts are JSON-encoded string literals (valid Python).
 *
 * ponytail: leans on bench's eval fallback; swap for a real Studio endpoint
 * if bench ever drops it.
 */

type Target = "app" | "page";

const ACTIONS: Record<string, { target: Target; method: string }> = {
  publish_app: { target: "app", method: "publish_app" },
  unpublish_app: { target: "app", method: "unpublish_app" },
  enable_export: { target: "app", method: "enable_app_export" },
  disable_export: { target: "app", method: "disable_app_export" },
  publish_page: { target: "page", method: "publish" },
  unpublish_page: { target: "page", method: "unpublish" },
  revert_page: { target: "page", method: "revert" },
};

export const STUDIO_ACTION_NAMES = Object.keys(ACTIONS);

const FRAPPE_APP_NAME = /^[A-Za-z0-9_]+$/;

export type StudioActionInput = {
  action: string;
  app?: string;
  page?: string;
  target_app?: string;
};

export type StudioExpression = { ok: true; expression: string } | { ok: false; error: string };

export function studioExpression(input: StudioActionInput): StudioExpression {
  const spec = ACTIONS[input.action];
  if (!spec) {
    return { ok: false, error: `unknown action '${input.action}'. Allowed: ${STUDIO_ACTION_NAMES.join(", ")}` };
  }
  const name = spec.target === "app" ? input.app : input.page;
  if (typeof name !== "string" || name.length === 0 || name.length > 140) {
    return { ok: false, error: `${input.action}: '${spec.target}' is required (Studio ${spec.target === "app" ? "App" : "Page"} name)` };
  }
  const doctype = spec.target === "app" ? "Studio App" : "Studio Page";
  let call = `${spec.method}()`;
  if (input.action === "enable_export") {
    if (typeof input.target_app !== "string" || !FRAPPE_APP_NAME.test(input.target_app)) {
      return { ok: false, error: "enable_export: 'target_app' (the Frappe app to export into) is required" };
    }
    call = `${spec.method}(${JSON.stringify(input.target_app)})`;
  }
  return { ok: true, expression: `frappe.get_doc(${JSON.stringify(doctype)}, ${JSON.stringify(name)}).${call}` };
}
