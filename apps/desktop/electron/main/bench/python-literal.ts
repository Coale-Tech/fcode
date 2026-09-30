/**
 * `bench execute --kwargs` runs `eval()` on its value, so it needs a Python
 * literal, not JSON: `true`/`false`/`null` raise NameError. Convert a
 * JSON-serialisable value to the equivalent Python literal.
 */
export function pythonLiteral(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`pythonLiteral: non-finite number ${value}`);
    return String(value);
  }
  // JSON string escapes (\", \\, \n, \uXXXX) are all valid in a Python literal.
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(pythonLiteral).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${pythonLiteral(v)}`);
    return `{${entries.join(", ")}}`;
  }
  throw new Error(`pythonLiteral: unsupported ${typeof value}`);
}
