import { hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import { IPC_EVENTS } from '../shared/constants/channels'
import { registerConnectionsIpc } from './ipc/connections.ipc'
import { registerContextMenuIpc } from './ipc/context-menu.ipc'
import { registerFilesIpc } from './ipc/files.ipc'
import { registerLocalFilesIpc } from './ipc/local-files.ipc'
import { registerSftpIpc } from './ipc/sftp.ipc'
import { registerSystemIpc } from './ipc/system.ipc'
import { registerTerminalIpc } from './ipc/terminal.ipc'
import { registerTransfersIpc } from './ipc/transfers.ipc'
import { KeyringSecretStore } from './secrets/keyring-secret-store'
import { ConnectionProfilesService } from './services/connection-profiles.service'
import { ConnectionService } from './services/connection.service'
import { FileOperationsService } from './services/file-operations.service'
import { SshConfigImportService } from './services/ssh-config-import.service'
import { HostKeyStore } from './sftp/host-keys'
import { Ssh2SftpProvider } from './sftp/ssh2-provider'
import { SshConfigImporter } from './ssh/ssh-config'
import { TerminalService } from './terminal/terminal.service'
import { TransferQueue } from './transfers/queue'
import { ConnectionStorage } from './storage/connection-storage'

export interface FileBirdHost {
  /** Folder for connections.json and known-hosts.json. */
  dataDir: string
  keychainService: string
  /** The home folder the local pane starts in and ~/.ssh/config is read from. */
  home: string
  downloads: string
  trash: (path: string) => Promise<void>
  /** Delivers one main-to-renderer event to FileBird's UI. */
  send: (channel: string, payload: unknown) => void
  setTerminalFocus: (focused: boolean) => void
  pickPrivateKey: () => Promise<string | null>
}

export interface FileBird {
  connections: ConnectionService
  terminals: TerminalService
  transfers: TransferQueue
  /** Closes terminals, cancels transfers, then disconnects, as quitting does. */
  shutdown: () => Promise<void>
}

/**
 * FileBird's services and IPC, without any app-global setup (name, menu,
 * windows, CSP). The standalone app and an embedding host both start here.
 * Registers ipcMain handlers, so call it once, after app.whenReady().
 */
export function installFileBird(host: FileBirdHost): FileBird {
  registerSystemIpc()
  registerContextMenuIpc()
  registerLocalFilesIpc(host.home, host.downloads)

  let transfers: TransferQueue | null = null
  let terminals: TerminalService | null = null

  const connections = new ConnectionService({
    hostKeys: new HostKeyStore(join(host.dataDir, 'known-hosts.json')),
    createProvider: () => new Ssh2SftpProvider(),
    onConnectionClosed: (event) => {
      void transfers?.connectionClosed(event.connectionId, 'lost')
      // A terminal on a connection that has gone cannot carry on.
      terminals?.closeForConnection(event.connectionId)
      host.send(IPC_EVENTS.SFTP_CONNECTION_CLOSED, event)
    }
  })
  registerSftpIpc(connections, {
    beforeDisconnect: async (id) => {
      terminals?.closeForConnection(id)
      await transfers?.connectionClosed(id, 'disconnected')
    }
  })

  terminals = new TerminalService({
    openRemoteShell: (connectionId, shellOptions) => connections.providerFor(connectionId).openShell(shellOptions),
    homeDirectory: host.home,
    // Terminal output is never logged: it carries passwords, keys and whole environments.
    onData: (id, data) => host.send(IPC_EVENTS.TERMINAL_DATA, { id, data }),
    onExit: (id, end) => host.send(IPC_EVENTS.TERMINAL_EXIT, { id, ...end })
  })
  registerTerminalIpc(terminals, { setTerminalFocus: host.setTerminalFocus })

  const profiles = new ConnectionProfilesService({
    storage: new ConnectionStorage(join(host.dataDir, 'connections.json')),
    secrets: new KeyringSecretStore(host.keychainService),
    connections
  })
  const imports = new SshConfigImportService(
    new SshConfigImporter({ home: host.home, localUser: userInfo().username, localHost: hostname() }),
    profiles
  )
  registerConnectionsIpc({ profiles, imports, pickPrivateKey: host.pickPrivateKey })

  transfers = new TransferQueue({
    connections: {
      providerFor: (connectionId) => connections.providerFor(connectionId),
      serverOf: (connectionId) => connections.serverOf(connectionId),
      findLive: (server) => connections.findLive(server)
    },
    emit: (update) => host.send(IPC_EVENTS.TRANSFER_UPDATE, update)
  })
  registerTransfersIpc(transfers)

  registerFilesIpc(
    new FileOperationsService({
      localHome: host.home,
      platform: process.platform,
      trash: host.trash,
      providerFor: (connectionId) => connections.providerFor(connectionId),
      remoteHomeOf: (connectionId) => connections.homeOf(connectionId)
    })
  )

  const liveTerminals = terminals
  const liveTransfers = transfers
  return {
    connections,
    terminals: liveTerminals,
    transfers: liveTransfers,
    shutdown: async () => {
      liveTerminals.closeAll()
      // Give cancelled transfers a moment to remove their temporary files before
      // the connections close under them (bounded by the queue's settle timeout).
      await liveTransfers.cancelAll()
      await connections.disconnectAll()
    }
  }
}
