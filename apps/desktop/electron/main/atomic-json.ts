import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The one JSON writer for settings files in dataDir: write a sibling temp file,
 * then rename over the target, so a crash leaves the old file or the new one,
 * never a torn write. Every settings reader here treats a parse error as
 * "use defaults", so a truncated file would silently reset the user's settings.
 */
export function writeJsonAtomicSync(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}
