import { useEffect } from "react";
import {
  KEYBOARD_SHORTCUTS,
  keybindingMatchesEvent,
  resolveKeybinding,
  type KeyboardShortcutId,
  type ShortcutPlatform,
} from "@pi-desktop/shared";
import { useAppStore } from "../stores/app-store";

/**
 * True when the binding string contains at least one modifier (Mod / Ctrl / Alt / Shift).
 * Used by `useShortcut` to decide whether to ignore keypresses inside editable targets.
 */
export function bindingHasModifier(binding: string): boolean {
  return /^(Mod|Ctrl|Alt|Shift)\+/.test(binding);
}

/**
 * True when the event target is an editable element (input, textarea, select, or
 * contenteditable) where unmodified keypresses should not trigger shortcuts.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !("tagName" in target)) return false;
  const el = target as Element;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  const ce = el.getAttribute("contenteditable");
  return ce !== null && ce !== "false";
}

/**
 * Register a keyboard shortcut handler that:
 * - honours the user's keybinding overrides from settings
 * - ignores events inside editable targets (input/textarea/contenteditable) UNLESS
 *   the resolved binding has a modifier (Mod/Ctrl/Alt/Shift)
 * - is a no-op when `enabled` is false
 *
 * Usage in ReviewTab:
 * ```tsx
 * useShortcut("sendReviewNotes", () => sendAllNotes(), isReviewTabVisible);
 * ```
 */
export function useShortcut(
  id: KeyboardShortcutId,
  handler: () => void,
  enabled = true,
): void {
  const platform = (window.piDesktop?.platform ?? "darwin") as ShortcutPlatform;
  const keybindings = useAppStore((s) => s.settings?.keybindings);

  useEffect(() => {
    if (!enabled) return;
    const shortcut = KEYBOARD_SHORTCUTS.find((s) => s.id === id);
    if (!shortcut) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      const binding = resolveKeybinding(shortcut, keybindings, platform);
      if (!keybindingMatchesEvent(binding, e, platform)) return;
      if (isTypingTarget(e.target) && !bindingHasModifier(binding ?? "")) return;
      e.preventDefault();
      handler();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, enabled, keybindings, platform, handler]);
}
