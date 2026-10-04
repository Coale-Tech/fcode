import type { BrowserWindow } from "electron";
import { IPC, type RavenSettings } from "@pi-desktop/shared";
import type { BrowserPane } from "../browser-view";
import { readRavenSettings, validateRavenSettings, writeRavenSettings } from "../runtime/raven-settings";
import type { IpcRegistrar } from "./types";

export type RavenIpcDependencies = {
  registrar: IpcRegistrar;
  dataDir: string;
  /** The `persist:raven` pane. Never CDP-attached: the agent cannot script the user's Frappe session. */
  pane: Pick<BrowserPane, "setWindow" | "navigate" | "setBounds" | "setVisible" | "dispose" | "getWebContents">;
  getMainWindow: () => BrowserWindow | null;
  sendChanged: () => void;
};

type Bounds = { x: number; y: number; width: number; height: number };

export function registerRavenIpc({ registrar, dataDir, pane, getMainWindow, sendChanged }: RavenIpcDependencies): void {
  // URL the live pane was loaded with; leaving and re-entering the route keeps the page.
  let loadedUrl: string | null = null;

  registrar.handle(IPC.invoke.ravenSettingsGet, async () => ({ settings: readRavenSettings(dataDir) }));

  registrar.handle(IPC.invoke.ravenSettingsSet, async (input: { settings?: Partial<RavenSettings> } = {}) => {
    const previous = readRavenSettings(dataDir);
    const settings = validateRavenSettings({ ...previous, ...input.settings });
    writeRavenSettings(dataDir, settings);
    // Disabling or pointing at another site drops the page, so the next open loads the new site.
    if (!settings.enabled || settings.url !== previous.url) {
      pane.dispose();
      loadedUrl = null;
    }
    sendChanged(); // NavRail refetches `enabled` on this event
    return { settings };
  });

  // Accepted, unlike browserSetBounds: this pane only ever shows on the full-width
  // Raven route. Still clamped to the window content so it cannot cover chrome outside it.
  registrar.handle(IPC.invoke.ravenSetBounds, async (bounds: Bounds) => {
    const window = getMainWindow();
    if (!window) return { ok: false };
    const content = window.getContentBounds();
    const x = Math.min(Math.max(0, bounds.x), content.width);
    const y = Math.min(Math.max(0, bounds.y), content.height);
    pane.setBounds({
      x,
      y,
      width: Math.min(bounds.width, content.width - x),
      height: Math.min(bounds.height, content.height - y),
    });
    return { ok: true };
  });

  registrar.handle(IPC.invoke.ravenSetVisible, async (input: { visible?: boolean } = {}) => {
    if (input.visible !== true) {
      pane.setVisible(false);
      return { ok: true };
    }
    const settings = readRavenSettings(dataDir);
    if (!settings.enabled) return { ok: false };
    pane.setWindow(getMainWindow());
    const target = new URL("/raven", settings.url).toString();
    // A closed window can take the guest with it; reload then instead of attaching a dead view.
    if (loadedUrl !== target || !pane.getWebContents()) {
      pane.navigate(target);
      loadedUrl = target;
    }
    pane.setVisible(true);
    return { ok: true };
  });
}
