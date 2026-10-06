import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { app, dialog, shell, WebContentsView, type BrowserWindow } from "electron";
import { IPC } from "@pi-desktop/shared";
import type { FileBird } from "@pi-desktop/filebird/src/main/embed";
import { applyContentSecurityPolicy, guardNavigation } from "@pi-desktop/filebird/src/main/security";
import type { IpcRegistrar } from "./types";

export type FileBirdIpcDependencies = {
  registrar: IpcRegistrar;
  dataDir: string;
  getMainWindow: () => BrowserWindow | null;
  sendToRenderer: (channel: string, payload: unknown) => void;
};

type Bounds = { x: number; y: number; width: number; height: number };

/** FileBird's built preload + renderer: packaged under resources/filebird, else the workspace build. */
function fileBirdOut(): string {
  const packaged = join(process.resourcesPath || "", "filebird");
  return existsSync(packaged) ? packaged : join(__dirname, "../../../filebird/out");
}

function downloadsFolder(): string {
  try {
    return app.getPath("downloads");
  } catch {
    return homedir();
  }
}

/**
 * FileBird (apps/filebird) inside Fcode: its services and IPC run here, its UI
 * runs verbatim in a `persist:filebird` view with its own preload. Its terminal
 * service also backs Fcode's integrated terminal (`IPC.invoke.terminal*`).
 */
export function registerFileBirdIpc({ registrar, dataDir, getMainWindow, sendToRenderer }: FileBirdIpcDependencies): void {
  let view: WebContentsView | null = null;
  let bounds: Bounds = { x: 0, y: 0, width: 0, height: 0 };
  let fileBird: FileBird | null = null;

  const send = (channel: string, payload: unknown) => {
    if (view && !view.webContents.isDestroyed()) view.webContents.send(channel, payload);
    // Terminal output also reaches Fcode's own terminal panel, which filters by session id.
    if (channel === IPC.event.terminalData || channel === IPC.event.terminalExit) sendToRenderer(channel, payload);
  };

  // A dynamic import keeps FileBird's native modules (node-pty, keyring) out of
  // Fcode's startup path: if one fails to load, only FileBird and the terminal are lost.
  void import("@pi-desktop/filebird/src/main/embed")
    .then(({ installFileBird }) => {
      const folder = join(dataDir, "filebird");
      mkdirSync(folder, { recursive: true });
      fileBird = installFileBird({
        dataDir: folder,
        keychainService: app.isPackaged ? "Fcode FileBird" : "Fcode FileBird (development)",
        home: homedir(),
        downloads: downloadsFolder(),
        trash: (path) => shell.trashItem(path),
        send,
        // FileBird's menu shortcuts are not installed in Fcode, so there is nothing to suppress.
        setTerminalFocus: () => undefined,
        pickPrivateKey: async () => {
          const options = {
            title: "Choose a private key",
            buttonLabel: "Choose",
            defaultPath: join(homedir(), ".ssh"),
            properties: ["openFile", "showHiddenFiles"] as Array<"openFile" | "showHiddenFiles">,
          };
          const window = getMainWindow();
          const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
          return result.canceled ? null : (result.filePaths[0] ?? null);
        },
      });
      // Kill every PTY before Electron tears down (node-pty aborts on a late exit).
      // will-quit, not before-quit: before-quit also fires for a quit the user then
      // cancels in Fcode's confirm dialog, which would kill live terminals.
      // Electron exits once will-quit handlers return, so hold the quit until
      // cancelled transfers have removed their temp files and connections closed;
      // the second app.quit() passes because Fcode's before-quit is already done.
      // It must run after this dispatch returns: an idle FileBird settles within
      // the same microtask drain, where Electron is still quitting and drops it.
      // ponytail: running transfers are cancelled without FileBird's "stop transfers?" prompt.
      app.once("will-quit", (event) => {
        if (!fileBird) return;
        event.preventDefault();
        void Promise.race([fileBird.shutdown(), sleep(10_000)]).finally(() => setImmediate(() => app.quit()));
      });
    })
    .catch((error: unknown) => {
      console.error("[filebird] failed to start:", error);
    });

  function ensureView(): WebContentsView {
    if (view && !view.webContents.isDestroyed()) return view;
    const out = fileBirdOut();
    view = new WebContentsView({
      webPreferences: {
        preload: join(out, "preload/preload.js"),
        partition: "persist:filebird",
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        navigateOnDragDrop: false,
        spellcheck: false,
      },
    });
    view.setBackgroundColor("#0b0d12");
    const index = join(out, "renderer/index.html");
    applyContentSecurityPolicy(view.webContents.session);
    guardNavigation(view, { exactUrl: pathToFileURL(index).href });
    void view.webContents.loadFile(index, { query: { embedded: "1" } });
    return view;
  }

  // Same clamp as ravenSetBounds: the pane only shows on the full-width FileBird route.
  registrar.handle(IPC.invoke.fileBirdSetBounds, async (next: Bounds) => {
    const window = getMainWindow();
    if (!window) return { ok: false };
    const content = window.getContentBounds();
    const x = Math.min(Math.max(0, Math.round(next.x)), content.width);
    const y = Math.min(Math.max(0, Math.round(next.y)), content.height);
    bounds = {
      x,
      y,
      width: Math.max(0, Math.min(Math.round(next.width), content.width - x)),
      height: Math.max(0, Math.min(Math.round(next.height), content.height - y)),
    };
    view?.setBounds(bounds);
    return { ok: true };
  });

  registrar.handle(IPC.invoke.fileBirdSetVisible, async (input: { visible?: boolean } = {}) => {
    const window = getMainWindow();
    if (!window || window.isDestroyed()) return { ok: false };
    if (input.visible !== true) {
      if (view && window.contentView.children.includes(view)) window.contentView.removeChildView(view);
      return { ok: true };
    }
    if (!fileBird) return { ok: false };
    const pane = ensureView();
    // Re-adding moves the view to the top, above any plugin view attached since.
    window.contentView.addChildView(pane);
    pane.setBounds(bounds);
    return { ok: true };
  });
}
