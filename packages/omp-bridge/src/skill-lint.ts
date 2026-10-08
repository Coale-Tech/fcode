/**
 * Skill-content linter for the omp-bridge side.
 *
 * Pure logic lives in @pi-desktop/shared so the Electron main process can also
 * import it without depending on this bundle.  We re-export from there so that
 * REVIEW (and any other agent slice) can `import { lintSkillContent } from
 * "./skill-lint.js"` with the exact contract signature.
 */
import { lintSkillContent } from "@pi-desktop/shared";
export { lintSkillContent };

import { readFile, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";

/** Per-skill lint result. */
export interface SkillLintResult {
  skill: string;
  errors: string[];
  warnings: string[];
}

/**
 * Lint every `.md` file in `files` that lives under `dir`.
 * `files` is the list of git-changed paths (relative to `dir`); pass
 * `skillPackStatus().files` from the desktop or the bridge's own diff.
 * Silently skips files that no longer exist on disk (deleted in the branch).
 */
export async function lintSkillFiles(dir: string, files: string[]): Promise<SkillLintResult[]> {
  const results: SkillLintResult[] = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    try {
      const content = await readFile(join(dir, file), "utf8");
      const { errors, warnings } = lintSkillContent(content);
      results.push({ skill: file, errors, warnings });
    } catch {
      // deleted or unreadable — skip
    }
  }
  return results;
}

/**
 * Lint all `SKILL.md` files found anywhere under `dir` (recursive).
 * Useful for a full-pack audit; for changed-only, use `lintSkillFiles`.
 */
export async function lintAllSkillsInDir(dir: string): Promise<SkillLintResult[]> {
  const results: SkillLintResult[] = [];
  const scan = async (current: string, rel: string) => {
    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await scan(join(current, e.name), childRel);
      } else if (e.name === "SKILL.md") {
        try {
          const content = await readFile(join(current, e.name), "utf8");
          const { errors, warnings } = lintSkillContent(content);
          results.push({ skill: childRel, errors, warnings });
        } catch {
          // skip unreadable
        }
      }
    }
  };
  await scan(dir, "");
  return results;
}
