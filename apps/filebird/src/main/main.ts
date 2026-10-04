import { app, BrowserWindow, dialog, Menu, shell, type OpenDialogOptions } from 'electron'
import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP_NAME } from '../shared/constants/app'
import { IPC_EVENTS } from '../shared/constants/channels'
import { downloadDirectory, splashDuration, stopTransfersQuestion, userDataFolder } from './app-lifecycle'
import { installFileBird, type FileBird } from './embed'
import { buildApplicationMenu, TERMINAL_SUPPRESSED_COMMANDS, menuItemId } from './menu'
import { keychainService } from './secrets/secret-store'
import { devTrash } from './services/dev-trash'
import { applyContentSecurityPolicy, guardNavigation } from './security'
import { openSplash } from './splash-window'
import { logger } from './logger'

const isDev = !app.isPackaged

// Before anything touches app data, and before the name changes: Electron names
// the data folder after the app, so pin it (unpackaged runs keep their own, plan D6).
const dataFolder = userDataFolder({
  isPackaged: app.isPackaged,
  hasUserDataSwitch: app.commandLine.hasSwitch('user-data-dir'),
  appData: app.getPath('appData')
})
if (dataFolder !== null) app.setPath('userData', dataFolder)
// The name in the macOS app menu (About, Hide, Quit); package.json's "fly" otherwise.
app.setName(APP_NAME)
const rendererUrl = process.env['ELECTRON_RENDERER_URL']

let fileBird: FileBird | null = null
/** Set once quitting is confirmed and cleanup has begun; later quit and close events pass through. */
let readyToQuit = false
let askingToQuit = false

/**
 * The home folder Fly starts in and reads ~/.ssh/config from. Unpackaged builds
 * accept FLY_DEV_HOME so the smoke test can use a fixture folder: overriding HOME
 * instead would also hide the macOS login keychain. Packaged builds ignore it.
 */
const appHome = !app.isPackaged && process.env['FLY_DEV_HOME'] ? process.env['FLY_DEV_HOME'] : homedir()

function systemDownloads(): string | null {
  // Unpackaged runs must never write into the real Downloads folder, so tests
  // name their own (FLY_DEV_DOWNLOADS) and otherwise keep to their fixture home.
  if (!app.isPackaged && process.env['FLY_DEV_HOME']) return process.env['FLY_DEV_DOWNLOADS'] ?? null
  try {
    return app.getPath('downloads')
  } catch {
    // Some systems have no such folder; the home folder is then the place to put it.
    return null
  }
}

/**
 * Where a download goes when the user hasn't chosen a folder by dragging it
 * somewhere: the Downloads folder, as a browser would. The local pane still
 * opens in the home folder, which is also what ~/.ssh/config is read from and
 * what deletes are guarded against.
 */
const downloadFolder = downloadDirectory({
  home: appHome,
  downloads: systemDownloads(),
  isDirectory: (path) => {
    try {
      return statSync(path).isDirectory()
    } catch {
      return false
    }
  }
})

/**
 * Local deletes go to the system Trash. Unpackaged builds accept FLY_DEV_TRASH_DIR
 * so tests never put files in the user's real Trash; packaged builds ignore it.
 */
const trashDirectory = !app.isPackaged ? process.env['FLY_DEV_TRASH_DIR'] : undefined
const trash = trashDirectory ? devTrash(trashDirectory) : (path: string): Promise<void> => shell.trashItem(path)

/** `reveal` decides when the window appears; by default as soon as it has painted. */
function createMainWindow(reveal: (window: BrowserWindow) => void = (window) => window.show()): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: APP_NAME,
    backgroundColor: '#0b0d12',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      // Spec section 20 — these five lines are the security boundary.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // A file dropped on the window must never replace our UI (already Electron's default; pinned).
      navigateOnDragDrop: false,
      spellcheck: false
    }
  })

  // Avoid the white flash: hold the window back until React has painted.
  window.once('ready-to-show', () => reveal(window))

  // Closing the window disconnects, so transfers still running would be cancelled: ask first.
  let closeConfirmed = false
  window.on('close', (event) => {
    if (closeConfirmed || readyToQuit) return
    const question = stopTransfersQuestion(fileBird?.transfers.activeCount() ?? 0, 'close')
    if (question === null) return
    event.preventDefault()
    void dialog.showMessageBox(window, question).then(async ({ response }) => {
      if (response !== 1) return
      closeConfirmed = true
      await fileBird?.transfers.cancelAll()
      window.close()
    })
  })

  if (isDev && rendererUrl !== undefined) {
    guardNavigation(window, { origin: new URL(rendererUrl).origin })
    void window.loadURL(rendererUrl)
    window.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexHtml = join(__dirname, '../renderer/index.html')
    guardNavigation(window, { exactUrl: pathToFileURL(indexHtml).href })
    void window.loadFile(indexHtml)
  }

  return window
}

/** The native file dialog, opened by the main process so the renderer only ever receives a path. */
async function pickPrivateKey(): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: 'Choose a private key',
    buttonLabel: 'Choose',
    defaultPath: join(appHome, '.ssh'),
    properties: ['openFile', 'showHiddenFiles']
  }
  const window = BrowserWindow.getFocusedWindow()
  const result = window === null ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(window, options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

void app.whenReady().then(() => {
  app.setAppUserModelId('com.titansoft.fly')

  applyContentSecurityPolicy()
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildApplicationMenu({
        platform: process.platform,
        isDev,
        send: (command) => {
          const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
          window?.webContents.send(IPC_EVENTS.MENU_COMMAND, { command })
        }
      })
    )
  )
  fileBird = installFileBird({
    dataDir: app.getPath('userData'),
    keychainService: keychainService(app.isPackaged),
    home: appHome,
    downloads: downloadFolder,
    trash,
    send: (channel, payload) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
    },
    setTerminalFocus: (focused) => {
      const menu = Menu.getApplicationMenu()
      for (const command of TERMINAL_SUPPRESSED_COMMANDS) {
        const item = menu?.getMenuItemById(menuItemId(command))
        if (item !== null && item !== undefined) item.enabled = !focused
      }
    },
    pickPrivateKey
  })

  // Unpackaged, the Dock would show Electron's own icon; the packaged app's icon comes from its bundle.
  const showDevDockIcon = (): void => {
    if (isDev && process.platform === 'darwin') app.dock?.setIcon(join(__dirname, '../../resources/icon.png'))
  }
  showDevDockIcon()

  // The FileBird start screen shows while the main window loads out of sight.
  const splashMs = splashDuration({ isPackaged: app.isPackaged, override: process.env['FLY_SPLASH_MS'] })
  const splash = splashMs > 0 ? openSplash({ rendererUrl: isDev ? rendererUrl : undefined, durationMs: splashMs }) : null
  createMainWindow(splash === null ? undefined : (window) => void splash.handOff(window).then(showDevDockIcon))

  logger.info('Application ready', {
    mode: isDev ? 'development' : 'production',
    electron: process.versions.electron,
    platform: process.platform,
    arch: process.arch
  })

  // macOS: clicking the dock icon with no windows open reopens one.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  // No window means no one can see or use a connection or a terminal.
  fileBird?.terminals.closeAll()
  void fileBird?.connections.disconnectAll()
  // macOS apps conventionally stay running with no windows; other platforms quit.
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (readyToQuit) return
  event.preventDefault()
  if (askingToQuit) return

  void (async () => {
    // Transfers still running would be cancelled: ask first (plan D5).
    const question = stopTransfersQuestion(fileBird?.transfers.activeCount() ?? 0, 'quit')
    if (question !== null) {
      askingToQuit = true
      const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const { response } = window === undefined ? await dialog.showMessageBox(question) : await dialog.showMessageBox(window, question)
      askingToQuit = false
      if (response !== 1) return
    }
    readyToQuit = true
    await fileBird?.shutdown()
  })()
    // A later task, not a microtask: quitting again while Electron is still inside
    // the quit that was just prevented leaves the app running with no windows.
    .finally(() => {
      if (readyToQuit) setTimeout(() => app.quit(), 0)
    })
})
