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
 * Two sets of rules, matched differently:
 *
 * DOT_PREFIXES — segment-aware, boundary is `.` only. Prevents
 * `frappe.client.get_list_evil` from matching `frappe.client.get_list`.
 *
 * UNDERSCORE_PREFIXES — function-name prefix, boundary is end-of-string or
 * end-of-identifier. Used for studio/builder getter namespaces where Frappe
 * function names use underscores (`get_app`, `list_pages`, …).
 */
const DOT_PREFIXES: readonly string[] = [
  "frappe.client.get",
  "frappe.client.get_list",
  "frappe.client.get_value",
  "frappe.client.get_count",
  "frappe.db.get_value",
  "frappe.db.count",
  "frappe.utils",
];

// For studio.api and builder.api, allow any method whose local name starts
// with `get` or `list` (they are all read-only introspection calls).
const UNDERSCORE_PREFIXES: readonly string[] = [
  "studio.api.get",
  "studio.api.list",
  "builder.api.get",
  "builder.api.list",
];

/**
 * Returns `true` when the method should suppress the approval prompt.
 *
 * DOT_PREFIXES match only at a dot boundary: `frappe.client.get_list_evil`
 * does NOT match `frappe.client.get_list` because the next character is `_`,
 * not `.` or end-of-string.
 *
 * UNDERSCORE_PREFIXES match at an underscore boundary: `studio.api.get_app`
 * matches `studio.api.get` because Frappe function names are underscore-joined
 * (`get_app`, `get_page`, …). A method must equal the prefix exactly or have
 * the prefix followed by `_` or `.`.
 *
 * ponytail: linear scan over a small static list; replace with a trie if
 * the prefix list grows beyond ~20 entries.
 */
export function isReadOnlyBenchMethod(method: string): boolean {
  if (!method) return false;

  for (const prefix of DOT_PREFIXES) {
    if (method === prefix) return true;
    if (method.startsWith(prefix) && method[prefix.length] === ".") return true;
  }

  for (const prefix of UNDERSCORE_PREFIXES) {
    if (method === prefix) return true;
    const next = method[prefix.length];
    if (method.startsWith(prefix) && (next === "_" || next === ".")) return true;
  }

  return false;
}
