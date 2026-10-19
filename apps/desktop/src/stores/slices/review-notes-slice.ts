import { composeReviewNotesPrompt, type ReviewNote } from "../../lib/review-notes-prompt";
import type { AppState } from "../app-state";
import type { StoreAccess } from "./types";

export type { ReviewNote } from "../../lib/review-notes-prompt";

export function createReviewNotesSlice({ get, set }: StoreAccess): Pick<
  AppState,
  | "addReviewNote"
  | "updateReviewNote"
  | "resolveReviewNote"
  | "removeReviewNote"
  | "sendReviewNotes"
> {
  return {
    addReviewNote: (note) => {
      const id = crypto.randomUUID();
      const full: ReviewNote = { ...note, id, resolved: false, createdAt: Date.now() };
      set((state) => ({
        reviewNotes: {
          ...state.reviewNotes,
          [note.snapshotId]: [...(state.reviewNotes[note.snapshotId] ?? []), full],
        },
      }));
      return id;
    },

    updateReviewNote: (id, body) => {
      set((state) => {
        const updated: Record<string, ReviewNote[]> = {};
        for (const [sid, arr] of Object.entries(state.reviewNotes)) {
          updated[sid] = arr.map((n) => (n.id === id ? { ...n, body } : n));
        }
        return { reviewNotes: updated };
      });
    },

    resolveReviewNote: (id, resolved) => {
      set((state) => {
        const updated: Record<string, ReviewNote[]> = {};
        for (const [sid, arr] of Object.entries(state.reviewNotes)) {
          updated[sid] = arr.map((n) => (n.id === id ? { ...n, resolved } : n));
        }
        return { reviewNotes: updated };
      });
    },

    removeReviewNote: (id) => {
      set((state) => {
        const updated: Record<string, ReviewNote[]> = {};
        for (const [sid, arr] of Object.entries(state.reviewNotes)) {
          updated[sid] = arr.filter((n) => n.id !== id);
        }
        return { reviewNotes: updated };
      });
    },

    sendReviewNotes: async (snapshotIds) => {
      const state = get();
      const allUnresolved = snapshotIds
        .flatMap((sid) => state.reviewNotes[sid] ?? [])
        .filter((n) => !n.resolved);
      if (allUnresolved.length === 0) return false;

      const content = composeReviewNotesPrompt(allUnresolved);
      const sent = await state.sendPrompt(content);
      if (sent) {
        set((s) => {
          const updated: Record<string, ReviewNote[]> = { ...s.reviewNotes };
          for (const sid of snapshotIds) {
            if (updated[sid]) {
              updated[sid] = updated[sid]!.map((n) => (!n.resolved ? { ...n, resolved: true } : n));
            }
          }
          return { reviewNotes: updated };
        });
      }
      return sent;
    },
  };
}
