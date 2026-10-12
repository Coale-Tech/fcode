/**
 * Expands `OmpAdvancedSettings` (dotted omp setting ids → values) into the
 * nested YAML lines that omp reads in its overlay config.
 *
 * Curated settings (those already emitted by makeOmpOverlay / ompSettingsYaml)
 * are skipped here; passing a `curatedIds` set prevents duplicate YAML keys.
 *
 * ponytail: hand-written YAML avoids a yaml dep for a small config file.
 */
import type { OmpAdvancedSettings } from "@pi-desktop/shared";

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

/**
 * Expand `advanced` into overlay YAML lines.
 *
 * @param advanced  Dotted omp id → value map (from `OmpSettingsValues.advanced`).
 * @param curatedIds  Ids already emitted by the curated writer; skipped here so
 *   there are no duplicate YAML keys.  Pass `{ [id]: true }` for each curated
 *   key that is configured (i.e. will be emitted by the curated writer).
 * @returns  Array of YAML lines to append to the overlay; empty when `advanced`
 *   is empty or all entries are curated.
 */
export function overlayAdvancedLines(
  advanced: OmpAdvancedSettings,
  curatedIds: Readonly<Record<string, true>>,
): string[] {
  const nested: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(advanced)) {
    if (curatedIds[id]) continue; // curated wins
    if (value === undefined || value === null) continue; // skip missing
    setNested(nested, id.split("."), value);
  }
  if (Object.keys(nested).length === 0) return [];
  return ["", "# omp advanced settings (from OmpSettingsValues.advanced)", ...yamlLines(nested, 0)];
}
