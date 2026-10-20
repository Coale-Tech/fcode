import { BrowserWindow, type WebContents } from "electron";
import {
  KEYBOARD_SHORTCUTS,
  keybindingMatchesEvent,
  resolveKeybinding,
  type KeybindingOverrides,
  type ShortcutPlatform,
} from "@pi-desktop/shared";

const platform = process.platform as ShortcutPlatform;
let binding: string | null = null;

/** Resolve the (possibly rebound) element-picker chord for the main process. */
export function applyPickerShortcut(keybindings?: KeybindingOverrides): void {
  const shortcut = KEYBOARD_SHORTCUTS.find((candidate) => candidate.id === "toggleElementPicker");
  binding = shortcut ? resolveKeybinding(shortcut, keybindings, platform) : null;
}

/**
 * The renderer only sees keys while the app chrome has focus. After a pick,
 * focus sits in the guest page (or the browser plugin view), so those
 * contents get the chord here. The main window's own contents are skipped:
 * its renderer already handles it.
 */
export function watchPickerShortcut(contents: WebContents, toggle: () => void): void {
  contents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !binding) return;
    if (BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.webContents === contents)) return;
    const chord = {
      key: input.key,
      code: input.code,
      metaKey: input.meta,
      ctrlKey: input.control,
      altKey: input.alt,
      shiftKey: input.shift,
    };
    if (!keybindingMatchesEvent(binding, chord, platform)) return;
    event.preventDefault();
    toggle();
  });
}
