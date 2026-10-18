/**
 * Bench command approval helpers (E5).
 *
 * `isReadOnlyBenchMethod` suppresses the omp approval prompt for introspection
 * calls — it is a footgun guard, NOT a security boundary. omp's own `bash` tool
 * can invoke `bench execute` with any method regardless. The real gate is the
 * omp approval dialog that fires for every exec-tier host tool call that this
 * function does NOT suppress.
 */

/**
 * `bench execute` falls back to `eval(method)` when `frappe.get_attr` fails
 * (frappe/commands/utils.py), so the method string is code. Every rule below is
 * therefore a whole-string match: exact names, or a single identifier under a
 * fixed module. Prefix/suffix matching would admit
 * `frappe.utils.now.__globals__[...]` and similar expressions.
 */
const EXACT_METHODS: Record<string, true> = {
  "frappe.client.get": true,
  "frappe.client.get_list": true,
  "frappe.client.get_value": true,
  "frappe.client.get_count": true,
  "frappe.db.get_value": true,
  "frappe.db.count": true,
  // Pure helpers only — no blanket frappe.utils allowance (B5).
  "frappe.utils.now": true,
  "frappe.utils.today": true,
  "frappe.utils.get_url": true,
};

// studio/builder getters: `<module>.api.get` / `list` or `get_*` / `list_*`,
// one identifier, no dots, no operators.
const GETTER_METHOD = /^(?:studio|builder)\.api\.(?:get|list)(?:_[A-Za-z0-9_]*)?$/;

/** Returns `true` when the method should suppress the approval prompt. */
export function isReadOnlyBenchMethod(method: string): boolean {
  return EXACT_METHODS[method] === true || GETTER_METHOD.test(method);
}
