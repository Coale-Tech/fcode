import { api } from "../../lib/api";
import type { AnnotationIntent, ElementGrab } from "../../lib/element-grab";
import { formatElementGrabPrompt } from "../../lib/element-grab-format";
import type { ComposerDraftSnapshot } from "../../lib/composer-smart-stop";
import type { AppState } from "../app-state";
import type { StoreAccess } from "./types";

export type DesignAnnotation = {
  id: string;
  grab: ElementGrab;
  comment: string;
  intent: AnnotationIntent;
  createdAt: number;
};

export function createDesignAnnotationsSlice({ get, set }: StoreAccess): Pick<
  AppState,
  | "addDesignAnnotation"
  | "updateAnnotationComment"
  | "updateAnnotationIntent"
  | "updateAnnotationScreenshot"
  | "removeDesignAnnotation"
  | "clearDesignAnnotations"
  | "sendDesignAnnotations"
> {
  return {
    addDesignAnnotation: (grab) => {
      const annotation: DesignAnnotation = {
        id: crypto.randomUUID(),
        grab,
        comment: "",
        intent: "change",
        createdAt: Date.now(),
      };
      set((state) => ({ designAnnotations: [...state.designAnnotations, annotation] }));
    },

    updateAnnotationComment: (id, comment) => {
      set((state) => ({
        designAnnotations: state.designAnnotations.map((a) =>
          a.id === id ? { ...a, comment } : a,
        ),
      }));
    },

    updateAnnotationIntent: (id, intent) => {
      set((state) => ({
        designAnnotations: state.designAnnotations.map((a) =>
          a.id === id ? { ...a, intent } : a,
        ),
      }));
    },

    updateAnnotationScreenshot: (id, dataBase64) => {
      set((state) => ({
        designAnnotations: state.designAnnotations.map((a) =>
          a.id === id && a.grab.screenshot
            ? { ...a, grab: { ...a.grab, screenshot: { ...a.grab.screenshot, dataBase64 } } }
            : a,
        ),
      }));
    },

    removeDesignAnnotation: (id) => {
      set((state) => ({
        designAnnotations: state.designAnnotations.filter((a) => a.id !== id),
      }));
    },

    clearDesignAnnotations: () => {
      set({ designAnnotations: [] });
    },

    sendDesignAnnotations: async (supportsImages, target = "current") => {
      const state = get();
      const pending = state.designAnnotations;
      if (pending.length === 0) return false;

      // Snapshot id→{comment,intent} so we only clear what was actually composed.
      type Snap = { comment: string; intent: AnnotationIntent };
      const sentSnapshot: Record<string, Snap> = {};
      for (const a of pending) sentSnapshot[a.id] = { comment: a.comment, intent: a.intent };

      // Build prompt: one section per annotation.
      const sections = pending.map((a, i) => {
        const header = `## Element ${i + 1}${a.comment ? `\n> ${a.comment}` : ""}`;
        return `${header}\n\n${formatElementGrabPrompt(a.grab, a.intent)}`;
      });
      const promptText = sections.join("\n\n---\n\n");

      // For new-session target: create the session first so screenshots are pasted
      // into (and valid for) the session that receives the prompt.
      let targetSessionId: string | undefined;
      if (target === "new") {
        try {
          const projectPath = get().workspace?.path ?? null;
          await get().newSession({ projectPath });
          targetSessionId = get().activeSessionId;
        } catch {
          // Failed to create session — leave all annotations in the tray.
          return false;
        }
      }

      // Attach screenshots when the active model supports images.
      let draft: ComposerDraftSnapshot | undefined;
      if (supportsImages) {
        const sessionId = targetSessionId ?? get().activeSessionId;
        if (sessionId) {
          const screenshots = pending
            .map((a) => a.grab.screenshot)
            .filter((s): s is NonNullable<typeof s> => s != null);

          if (screenshots.length > 0) {
            try {
              const pasteFiles = screenshots.map((s, i) => ({
                name: `element-${i + 1}.${s.mimeType === "image/png" ? "png" : "jpg"}`,
                mimeType: s.mimeType,
                data: base64ToArrayBuffer(s.dataBase64),
              }));
              const result = await api.pasteFiles(sessionId, pasteFiles);
              draft = {
                text: "",
                fileReferences: result.files.map((f) => ({
                  path: f.path,
                  name: f.name,
                  kind: "image" as const,
                  mimeType: f.mimeType,
                })),
              };
            } catch {
              // Image upload failed; fall through to text-only send.
            }
          }
        }
      }

      const sent = await state.sendPrompt(promptText, draft, targetSessionId);
      if (sent) {
        // Only clear annotations whose id+comment+intent match what was sent.
        set((s) => ({
          designAnnotations: s.designAnnotations.filter((a) => {
            const snap = sentSnapshot[a.id];
            return !(snap && snap.comment === a.comment && snap.intent === a.intent);
          }),
        }));
      }
      return sent;
    },
  };
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
