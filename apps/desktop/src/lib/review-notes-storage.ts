import type { ReviewNote } from "./review-notes-prompt";

const KEY = "pi.desktop.reviewNotes";
/** Oldest notes drop first so the entry cannot grow without bound. */
const MAX_NOTES = 500;

function isNote(value: unknown): value is ReviewNote {
  const n = value as Partial<ReviewNote> | null;
  return (
    !!n &&
    typeof n.id === "string" &&
    typeof n.snapshotId === "string" &&
    typeof n.path === "string" &&
    typeof n.body === "string" &&
    typeof n.resolved === "boolean" &&
    typeof n.createdAt === "number" &&
    (n.line === null || typeof n.line === "number") &&
    (n.sentAt === undefined || (typeof n.sentAt === "number" && isFinite(n.sentAt)))
  );
}

/** Strip a non-finite sentAt before persisting (shouldn't happen, but defence in depth). */
function sanitizeNote(n: ReviewNote): ReviewNote {
  if (n.sentAt !== undefined && !isFinite(n.sentAt)) {
    const { sentAt: _, ...rest } = n;
    return rest as ReviewNote;
  }
  return n;
}

export function loadReviewNotes(): Record<string, ReviewNote[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    const notes: Record<string, ReviewNote[]> = {};
    for (const [snapshotId, list] of Object.entries(parsed)) {
      const valid = Array.isArray(list) ? list.filter(isNote) : [];
      if (valid.length) notes[snapshotId] = valid;
    }
    return notes;
  } catch {
    return {};
  }
}

export function saveReviewNotes(notes: Record<string, ReviewNote[]>): void {
  const all = Object.values(notes).flat();
  const keep = all.length > MAX_NOTES ? new Set(all.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_NOTES)) : null;
  const out: Record<string, ReviewNote[]> = {};
  for (const [snapshotId, list] of Object.entries(notes)) {
    const kept = keep ? list.filter((n) => keep.has(n)) : list;
    if (kept.length) out[snapshotId] = kept.map(sanitizeNote);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch {
    // best-effort persistence
  }
}
