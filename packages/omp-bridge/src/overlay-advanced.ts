/**
 * Expands `OmpAdvancedSettings` (dotted omp setting ids → values) into the
 * nested YAML lines that omp reads in its overlay config.
 *
 * Advanced values are merged INTO the Fcode-written overlay lines: a key that
 * the overlay already sets wins, and a new key under an existing section is
 * added to that section. Appending a second top-level block instead would make
 * YAML's last-duplicate-key-wins drop the whole earlier Fcode block.
 *
 * ponytail: hand-written YAML avoids a yaml dep for a small config file.
 */
import { FCODE_OWNED_OMP_KEYS, type OmpAdvancedSettings } from "@pi-desktop/shared";

/** Serialise one value as a YAML scalar or inline JSON collection. */
function yamlValue(value: unknown): string {
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  // array or record: emit as inline JSON (YAML is a superset of JSON)
  return JSON.stringify(value);
}

/** Recursively emit YAML lines for a plain object at the given indent level. */
function yamlLines(obj: Record<string, unknown>, indent: number): string[] {
  const prefix = "  ".repeat(indent);
  const out: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      out.push(`${prefix}${key}:`);
      out.push(...yamlLines(value as Record<string, unknown>, indent + 1));
    } else {
      out.push(`${prefix}${key}: ${yamlValue(value)}`);
    }
  }
  return out;
}

/** Set a deeply nested key in `obj` via its split path segments. */
function setNested(
  obj: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): void {
  const key = path[0];
  if (path.length === 1) {
    obj[key] = value;
    return;
  }
  const child = obj[key];
  const next: Record<string, unknown> =
    child !== null && typeof child === "object" && !Array.isArray(child)
      ? (child as Record<string, unknown>)
      : {};
  obj[key] = next;
  setNested(next, path.slice(1), value);
}

interface Node {
  line: string;
  key?: string;
  inline: boolean;
  kids: Node[];
}

const KEY_RE = /^(\s*)(?:"((?:[^"\\]|\\.)*)"|([^\s:#"-][^:]*?)):(?=\s|$)/;

/** Indentation tree over generated YAML lines (2-space blocks, no multi-line scalars). */
function parseTree(lines: readonly string[]): Node[] {
  const root: Node[] = [];
  const stack: { indent: number; node: Node }[] = [];
  for (const line of lines) {
    const m = KEY_RE.exec(line);
    const node: Node = {
      line,
      key: m ? (m[2] ?? m[3]) : undefined,
      inline: m ? line.slice(m[0].length).trim() !== "" : false,
      kids: [],
    };
    if (line.trim() === "") {
      root.push(node); // blank separator: never a parent
      continue;
    }
    const indent = line.length - line.trimStart().length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack.length ? stack[stack.length - 1].node.kids : root).push(node);
    stack.push({ indent, node });
  }
  return root;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function mergeInto(kids: Node[], depth: number, obj: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    const existing = kids.find((k) => k.key === key);
    if (!existing) {
      for (const line of yamlLines({ [key]: value }, depth)) kids.push({ line, inline: false, kids: [] });
    } else if (
      isPlainObject(value) &&
      !existing.inline &&
      !existing.kids.some((k) => k.line.trimStart().startsWith("- "))
    ) {
      mergeInto(existing.kids, depth + 1, value);
    } // else: the overlay already decided this key — Fcode wins
  }
}

function flatten(nodes: readonly Node[]): string[] {
  return nodes.flatMap((n) => [n.line, ...flatten(n.kids)]);
}

/**
 * Merge `advanced` (dotted omp id → value) into the overlay `lines`.
 * Fcode-owned ids and ids the overlay already sets are left as the overlay has them.
 */
export function mergeAdvancedIntoOverlay(
  lines: readonly string[],
  advanced: OmpAdvancedSettings,
): string[] {
  const nested: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(advanced)) {
    if (FCODE_OWNED_OMP_KEYS[id]) continue;
    if (value === undefined || value === null) continue;
    setNested(nested, id.split("."), value);
  }
  if (Object.keys(nested).length === 0) return [...lines];
  const root = parseTree(lines);
  mergeInto(root, 0, nested);
  return flatten(root);
}
