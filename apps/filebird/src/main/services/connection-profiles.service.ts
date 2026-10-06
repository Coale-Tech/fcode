import { randomUUID } from 'node:crypto'
import type { ConnectOutcome, ConnectRequest } from '../../shared/types/connection'
import type {
  ConnectionInput,
  ConnectionProfile,
  ConnectionSummary,
  SecretEntry
} from '../../shared/types/connections'
import { AppError } from '../errors'
import { createLogger } from '../logger'
import { type SecretKind, type SecretStore, secretAccount } from '../secrets/secret-store'
import type { ConnectionStorage } from '../storage/connection-storage'
import { mapLimit } from '../utils/map-limit'
import type { ConnectHooks } from './connection.service'
import { APP_NAME } from '../../shared/constants/app'

const log = createLogger('profiles')

export interface Connector {
  connect(request: ConnectRequest, hooks?: ConnectHooks): Promise<ConnectOutcome>
}

export interface ConnectionProfilesServiceOptions {
  storage: ConnectionStorage
  secrets: SecretStore
  connections: Connector
  now?: () => Date
}

const kindFor = (profile: Pick<ConnectionProfile, 'auth'>): SecretKind =>
  profile.auth.type === 'password' ? 'password' : 'passphrase'

const notFound = (): AppError => new AppError('NOT_FOUND', 'This saved connection no longer exists.')

/**
 * Saved connections and their secrets (spec sections 8 and 9).
 *
 * Secrets are saved only after the server has accepted them, so a mistyped
 * password is never remembered. They are read from the keychain here, in the
 * main process, and never sent to the renderer.
 */
export class ConnectionProfilesService {
  private readonly options: ConnectionProfilesServiceOptions
  private readonly now: () => Date

  constructor(options: ConnectionProfilesServiceOptions) {
    this.options = options
    this.now = options.now ?? (() => new Date())
  }

  async list(): Promise<ConnectionSummary[]> {
    const profiles = await this.options.storage.list()
    const summaries = await mapLimit(profiles, 4, (profile) => this.summarise(profile))
    return summaries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
  }

  async create(input: ConnectionInput, importedFrom?: ConnectionProfile['importedFrom']): Promise<ConnectionSummary> {
    const stamp = this.now().toISOString()
    const profile: ConnectionProfile = { id: randomUUID(), ...input, savedSecretKind: null, createdAt: stamp, updatedAt: stamp }
    if (importedFrom !== undefined) profile.importedFrom = importedFrom
    await this.options.storage.save(profile)
    log.info('Connection saved', { id: profile.id })
    return { ...profile, savedSecret: null }
  }

  async update(id: string, input: ConnectionInput): Promise<ConnectionSummary> {
    const previous = await this.options.storage.get(id)
    if (previous === null) throw notFound()

    // Determine whether the stored secret still applies before building next.
    const keyChanged =
      previous.auth.type === 'privateKey' &&
      (input.auth.type !== 'privateKey' || input.auth.privateKeyPath !== previous.auth.privateKeyPath)
    const secretInvalidated = previous.auth.type !== input.auth.type || keyChanged

    const next: ConnectionProfile = {
      ...previous,
      ...input,
      updatedAt: this.now().toISOString(),
      savedSecretKind: secretInvalidated ? null : previous.savedSecretKind
    }
    await this.options.storage.save(next)

    if (secretInvalidated) {
      await this.deleteSecretQuietly(secretAccount(id, kindFor(previous)))
    }
    return this.summarise(next)
  }

  async delete(id: string): Promise<void> {
    await this.forgetSecrets(id)
    await this.options.storage.remove(id)
    log.info('Connection deleted', { id })
  }

  async forgetSecret(id: string): Promise<void> {
    if ((await this.options.storage.get(id)) === null) throw notFound()
    await this.forgetSecrets(id)
  }

  /** Connects a saved profile, using a saved secret unless one is given. */
  async connect(id: string, secret?: SecretEntry): Promise<ConnectOutcome> {
    const profile = await this.options.storage.get(id)
    if (profile === null) throw notFound()
    return this.connectWith(profile, secret, secretAccount(id, kindFor(profile)), id)
  }

  /** "Connect without saving": nothing is stored, including the secret. */
  connectUnsaved(input: ConnectionInput, secret?: SecretEntry): Promise<ConnectOutcome> {
    return this.connectWith(input, secret === undefined ? undefined : { value: secret.value, remember: false }, null, null)
  }

  private async connectWith(
    target: ConnectionInput,
    typed: SecretEntry | undefined,
    account: string | null,
    profileId: string | null
  ): Promise<ConnectOutcome> {
    const kind = kindFor(target)

    let value = typed?.value
    if (value === undefined && account !== null) {
      value = (await this.readSecretQuietly(account)) ?? undefined
    }

    if (target.auth.type === 'password' && value === undefined) {
      return { status: 'secret-required', kind, reason: 'not-saved' }
    }

    const request: ConnectRequest = {
      host: target.host,
      port: target.port,
      username: target.username,
      auth:
        target.auth.type === 'password'
          ? { type: 'password', password: value ?? '' }
          : { type: 'privateKey', privateKeyPath: target.auth.privateKeyPath, passphrase: value }
    }

    const hooks: ConnectHooks = {
      onConnected: async () => {
        if (account === null || typed === undefined) return undefined
        if (!typed.remember) {
          await this.deleteSecretQuietly(account)
          if (profileId !== null) await this.options.storage.setSecretKind(profileId, null)
          return undefined
        }
        try {
          await this.options.secrets.set(account, typed.value)
          if (profileId !== null) await this.options.storage.setSecretKind(profileId, kind)
          return undefined
        } catch {
          return `Connected, but ${APP_NAME} couldn't save the ${kind} to the keychain.`
        }
      }
    }

    try {
      return await this.options.connections.connect(request, hooks)
    } catch (error) {
      if (error instanceof AppError) {
        if (error.code === 'KEY_PASSPHRASE_REQUIRED') return { status: 'secret-required', kind: 'passphrase', reason: 'not-saved' }
        if (error.code === 'KEY_PASSPHRASE_INCORRECT') return { status: 'secret-required', kind: 'passphrase', reason: 'rejected' }
        if (error.code === 'AUTH_FAILED' && target.auth.type === 'password') {
          return { status: 'secret-required', kind: 'password', reason: 'rejected' }
        }
      }
      throw error
    }
  }

  private async summarise(profile: ConnectionProfile): Promise<ConnectionSummary> {
    if (profile.savedSecretKind !== undefined) {
      return { ...profile, savedSecret: profile.savedSecretKind }
    }
    // Legacy profile: read the keychain once, then persist the result unless a
    // connect stored a fresher one while the read was pending.
    const kind = kindFor(profile)
    const saved = await this.readSecretQuietly(secretAccount(profile.id, kind))
    const savedSecretKind = saved === null ? null : kind
    await this.options.storage.setSecretKind(profile.id, savedSecretKind, true)
    return { ...profile, savedSecret: savedSecretKind }
  }

  private async forgetSecrets(id: string): Promise<void> {
    await this.deleteSecretQuietly(secretAccount(id, 'password'))
    await this.deleteSecretQuietly(secretAccount(id, 'passphrase'))
    await this.options.storage.setSecretKind(id, null)
  }

  /** A keychain outage must not make saved connections unusable; it is logged by the store. */
  private async readSecretQuietly(account: string): Promise<string | null> {
    try {
      return await this.options.secrets.get(account)
    } catch {
      return null
    }
  }

  private async deleteSecretQuietly(account: string): Promise<void> {
    try {
      await this.options.secrets.delete(account)
    } catch {
      // Logged by the store; an orphaned keychain item is harmless and unreachable.
    }
  }
}
