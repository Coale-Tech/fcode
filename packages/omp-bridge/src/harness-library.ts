/**
 * harness-library.ts — Per-domain experience library (strength 4 + 6).
 *
 * Stores adopted harnesses with their experience records so future tasks in the
 * same domain can read what earlier tasks produced.  Ported from
 * google-research/harness2 library.py (Apache-2.0).
 *
 * Layout:  <root>/<domainDir>/
 *            INDEX.md
 *            harnesses/<slug>/
 *              harness/**          (adopted harness tree files)
 *              EXPERIENCE.md       (why chosen + lesson)
 *
 * Strength 4 (reflection): edits and verdicts recorded per experience entry.
 * Strength 6 (fact vs procedure): only reusable procedure goes into skills;
 *   project facts are labelled as workspace-specific in EXPERIENCE.md.
 *
 * Writes are synchronous (small files, offline path).
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { HarnessTree } from "@pi-desktop/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The transferable lesson captured after a successful adoption round.
 * Ported from harness2 selection.py `_distil` output shape.
 * Strength 4: per-edit verdict + one transferable lesson with honest attribution.
 */
export interface Experience {
  cue: string;        // shape of situation the lesson applies to
  lesson: string;     // transferable operation naming the component
  evidence: string;   // edit rows this lesson rests on
  confidence?: string;
  edits?: string;     // per-edit verdict block (<component>: helped|hurt|no observed effect|confounded>)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert a task id to a safe single-level directory name. */
export function slug(taskId: string): string {
  return taskId.replace(/\//g, "__");
}

/**
 * Convert a domain string to a safe directory name.
 * Path separators and surrounding whitespace collapse to "__".
 * Ported from harness2 library.py domain_dir().
 */
export function domainDir(domain: string): string {
  return domain.replace(/\s*[/\\]\s*/g, "__").trim() || "unknown";
}

/**
 * Return true if `exp` has all three required fields (cue, lesson, evidence)
 * as non-empty strings.  Ported from harness2 library.py has_experience().
 */
export function hasExperience(exp: unknown): exp is Experience {
  if (!exp || typeof exp !== "object") return false;
  const e = exp as Record<string, unknown>;
  return ["cue", "lesson", "evidence"].every(
    (k) => typeof e[k] === "string" && (e[k] as string).trim().length > 0,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Library class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One (run, domain) library: read before each task, appended after.
 * Ported from harness2 library.py Library.
 */
export class Library {
  readonly root: string;
  readonly domain: string;

  constructor(root: string, domain: string) {
    this.root = root;
    this.domain = domain;
  }

  /** Library directory for this domain. */
  get dir(): string {
    return join(this.root, domainDir(this.domain));
  }

  /** INDEX.md path. */
  get index(): string {
    return join(this.dir, "INDEX.md");
  }

  /** Directory for a specific task's entry. */
  entryDir(taskId: string): string {
    return join(this.dir, "harnesses", slug(taskId));
  }

  /** True if INDEX.md exists. */
  exists(): boolean {
    return existsSync(this.index);
  }

  /**
   * The directory to pass to an improver session, or null when empty.
   * Null when no EXPERIENCE.md files exist in this domain.
   */
  contextDir(): string | null {
    if (!this.exists()) return null;
    try {
      const found = _findFiles(this.dir, "EXPERIENCE.md");
      return found.length > 0 ? this.dir : null;
    } catch {
      return null;
    }
  }

  /** Slug names of all entries on disk (sorted). */
  entries(): string[] {
    const d = join(this.dir, "harnesses");
    if (!existsSync(d)) return [];
    try {
      return readdirSync(d, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Add an entry for taskId with the given harness and experience.
   * Returns the entry directory path, or null when experience is invalid
   * (cue/lesson/evidence required — ported from harness2 library.py add()).
   *
   * Strength 4: edits and verdicts recorded via the experience object.
   */
  add(
    taskId: string,
    harness: HarnessTree,
    opts: {
      why?: string;
      label?: string;
      runId?: string;
      experience?: Experience | null;
    } = {},
  ): string | null {
    if (!hasExperience(opts.experience)) return null;
    const exp = opts.experience as Experience;

    const d = this.entryDir(taskId);
    const harnessDir = join(d, "harness");
    mkdirSync(harnessDir, { recursive: true });

    // Write harness files
    for (const [rel, content] of Object.entries(harness)) {
      const target = join(harnessDir, rel);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, content, "utf8");
    }

    // Build EXPERIENCE.md
    const lines: string[] = [
      `# ${taskId}`,
      "",
      `- adopted: \`${opts.label ?? ""}\`${opts.runId ? `  (run \`${opts.runId}\`)` : ""}`,
      "",
    ];
    if (opts.why?.trim()) {
      lines.push("## Why this was chosen", opts.why.trim(), "");
    }
    if (exp.edits?.trim()) {
      lines.push("## What each edit did", exp.edits.trim(), "");
    }
    if (exp.lesson) {
      lines.push("## Transferable lesson");
      for (const f of ["cue", "lesson", "evidence", "confidence"] as const) {
        if (exp[f]) lines.push(`- **${f}**: ${exp[f]}`);
      }
      lines.push("");
    }
    writeFileSync(join(d, "EXPERIENCE.md"), lines.join("\n"), "utf8");

    this.rebuildIndex();
    return d;
  }

  /**
   * Drop entries for the given task ids and rebuild INDEX.md.
   * Unknown task ids are ignored.
   */
  forget(taskIds: string[]): void {
    let removed = false;
    for (const tid of taskIds) {
      const d = this.entryDir(tid);
      if (existsSync(d)) {
        rmSync(d, { recursive: true, force: true });
        removed = true;
      }
    }
    if (removed) this.rebuildIndex();
  }

  /**
   * Regenerate INDEX.md from what is on disk.
   * Ported from harness2 library.py rebuild_index().
   */
  rebuildIndex(): string {
    const names = this.entries();
    const rows: string[] = [
      `# Library — ${this.domain}`,
      "",
      "Each entry is an earlier task in THIS domain whose harness was chosen, stored " +
        "with its FULL component tree and why it was picked. Browse this index, then " +
        "open the entries that look relevant to the matter in front of you.",
      "",
    ];

    if (names.length === 0) {
      rows.push("_(empty — this is the first task in this domain)_");
    }

    for (const name of names) {
      const ed = join(this.dir, "harnesses", name);
      const cue = _readField(join(ed, "EXPERIENCE.md"), "cue");
      rows.push(
        `## \`harnesses/${name}/\``,
        `- harness: \`harnesses/${name}/harness/\``,
        `- why:     \`harnesses/${name}/EXPERIENCE.md\``,
      );
      if (cue) rows.push(`- cue:     ${cue}`);
      rows.push("");
    }

    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.index, rows.join("\n"), "utf8");
    return this.index;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the value after the first `field: ` line in a file. */
function _readField(filePath: string, field: string): string {
  if (!existsSync(filePath)) return "";
  try {
    const text = readFileSync(filePath, "utf8");
    const m = text.match(new RegExp(`^-\\s*\\*\\*${field}\\*\\*:\\s*(.+)$`, "m"));
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
}

/** Recursively find all files with a given basename under dir. */
function _findFiles(dir: string, name: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) results.push(..._findFiles(full, name));
      else if (entry.name === name) results.push(full);
    }
  } catch { /* ignore unreadable dirs */ }
  return results;
}
