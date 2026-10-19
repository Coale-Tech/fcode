import type { DiffHunk } from "@pi-desktop/shared";

/** A note pinned to a specific line (or whole file) in a diff. */
export type ReviewNote = {
  id: string;
  snapshotId: string;
  path: string;
  /** New-file line for add/context; old-file line for del; null = whole-file note. */
  line: number | null;
  /** True when pinned to a del line (old-file side). */
  lineIsOld: boolean | null;
  /** Inclusive range end; equals `line` for a single-line note; null for whole-file. */
  endLine: number | null;
  /** Diff line body text at pin time (without sigil), for stale detection. null for whole-file notes. */
  anchorText: string | null;
  body: string;
  resolved: boolean;
  createdAt: number;
};

/**
 * Compose one batched prompt from all unresolved notes.
 * Pure — no side effects, no store access.
 */
export function composeReviewNotesPrompt(notes: ReviewNote[]): string {
  const unresolved = notes.filter((n) => !n.resolved);
  if (unresolved.length === 0) return "";

  // Group by path, preserving first-appearance order.
  const fileOrder: string[] = [];
  const byPath: Record<string, ReviewNote[]> = {};
  for (const note of unresolved) {
    if (!(note.path in byPath)) {
      fileOrder.push(note.path);
      byPath[note.path] = [];
    }
    byPath[note.path]!.push(note);
  }

  // Sort within each file: whole-file first, then ascending by line.
  for (const arr of Object.values(byPath)) {
    arr.sort((a, b) => {
      if (a.line === null && b.line === null) return 0;
      if (a.line === null) return -1;
      if (b.line === null) return 1;
      return a.line - b.line;
    });
  }

  const lines: string[] = [
    "Review notes on the changes you just made. Address every note, then report what you changed.",
    "",
  ];

  for (const path of fileOrder) {
    lines.push(`### ${path}`);
    for (const note of byPath[path]!) {
      const anchor = note.anchorText ? ` \`${note.anchorText}\`` : "";
      let prefix: string;
      if (note.line === null) {
        prefix = "- (whole file)";
      } else if (note.endLine !== null && note.endLine !== note.line) {
        prefix = `- L${note.line}-L${note.endLine}${anchor}`;
      } else {
        prefix = `- L${note.line}${anchor}`;
      }
      lines.push(prefix);
      lines.push(`  ${note.body}`);
    }
  }

  return lines.join("\n");
}

/**
 * Shift-click range extension on one diff side. The range never shrinks, and the
 * anchor text follows the start line when the range grows upward (otherwise the
 * note would be flagged outdated the moment it is saved).
 */
export function extendNoteRange(
  range: { line: number; endLine: number | null; anchorText: string | null },
  lineNo: number,
  lineText: string,
): { line: number; endLine: number | null; anchorText: string | null } {
  const line = Math.min(range.line, lineNo);
  const end = Math.max(range.endLine ?? range.line, lineNo);
  return {
    line,
    endLine: end > line ? end : null,
    anchorText: lineNo < range.line ? lineText : range.anchorText,
  };
}

/**
 * Return true when the note's anchor line is no longer present in the current
 * hunk set with matching text.  Whole-file notes (line === null) are never stale.
 */
export function isNoteOutdated(note: ReviewNote, hunks: DiffHunk[]): boolean {
  if (note.line === null || note.anchorText === null) return false;
  for (const hunk of hunks) {
    const m = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(hunk.header);
    let oldLine = m ? parseInt(m[1], 10) : 1;
    let newLine = m ? parseInt(m[2], 10) : 1;
    for (const line of hunk.lines) {
      const lineNo = line.type === "del" ? oldLine : newLine;
      const isOld = line.type === "del";
      if (lineNo === note.line && isOld === note.lineIsOld) {
        return line.text !== note.anchorText;
      }
      if (line.type === "del") oldLine++;
      else if (line.type === "add") newLine++;
      else { oldLine++; newLine++; }
    }
  }
  // Line not found in any hunk → outdated.
  return true;
}
