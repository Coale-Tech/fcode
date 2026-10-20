import { composeReviewNotesPrompt, type ReviewNote } from "../../lib/review-notes-prompt";
import { saveReviewNotes } from "../../lib/review-notes-storage";
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
  const persisted: StoreAccess["set"] = (partial) => {
    set(partial);
    saveReviewNotes(get().reviewNotes);
  };
  return {
    addReviewNote: (note) => {
      const id = crypto.randomUUID();
      const full: ReviewNote = { ...note, id, resolved: false, createdAt: Date.now() };
      persisted((state) => ({
        reviewNotes: {
          ...state.reviewNotes,
          [note.snapshotId]: [...(state.reviewNotes[note.snapshotId] ?? []), full],
        },
      }));
      return id;
    },

    updateReviewNote: (id, body) => {
      persisted((state) => {
        const updated: Record<string, ReviewNote[]> = {};
        for (const [sid, arr] of Object.entries(state.reviewNotes)) {
          updated[sid] = arr.map((n) => {
            if (n.id !== id) return n;
            // Body changed: re-queue note (clear sentAt and resolved so it counts as unsent again).
            const bodyChanged = n.body !== body;
            return bodyChanged
              ? { ...n, body, sentAt: undefined, resolved: false }
              : { ...n, body };
          });
        }
        return { reviewNotes: updated };
      });
    },

    resolveReviewNote: (id, resolved) => {
      persisted((state) => {
        const updated: Record<string, ReviewNote[]> = {};
        for (const [sid, arr] of Object.entries(state.reviewNotes)) {
          updated[sid] = arr.map((n) => (n.id === id ? { ...n, resolved } : n));
        }
        return { reviewNotes: updated };
      });
    },

    removeReviewNote: (id) => {
      persisted((state) => {
        const updated: Record<string, ReviewNote[]> = {};
        for (const [sid, arr] of Object.entries(state.reviewNotes)) {
          updated[sid] = arr.filter((n) => n.id !== id);
        }
        return { reviewNotes: updated };
      });
    },

    sendReviewNotes: async (snapshotIds, target = "current") => {
      const state = get();
      const allUnresolved = snapshotIds
        .flatMap((sid) => state.reviewNotes[sid] ?? [])
        .filter((n) => !n.resolved && !n.sentAt);
      if (allUnresolved.length === 0) return false;

      const content = composeReviewNotesPrompt(allUnresolved);

      // For new-session target: create a session in the same project first.
      let targetSessionId: string | undefined;
      if (target === "new") {
        try {
          const projectPath = get().workspace?.path ?? null;
          await get().newSession({ projectPath });
          targetSessionId = get().activeSessionId;
        } catch {
          return false;
        }
      }

      const sent = await state.sendPrompt(content, undefined, targetSessionId);
      if (sent) {
        // Only what was composed: a note added or edited while sendPrompt awaited was never sent.
        const sentBodies: Record<string, string> = Object.fromEntries(allUnresolved.map((n) => [n.id, n.body]));
        persisted((s) => {
          const updated: Record<string, ReviewNote[]> = {};
          for (const [sid, arr] of Object.entries(s.reviewNotes)) {
            updated[sid] = arr.map((n) =>
              (!n.resolved && !n.sentAt && sentBodies[n.id] === n.body)
                ? { ...n, sentAt: Date.now() }
                : n,
            );
          }
          return { reviewNotes: updated };
        });
      }
      return sent;
    },
  };
}
