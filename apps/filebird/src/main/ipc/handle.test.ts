import { describe, expect, it, vi } from 'vitest'
import type { IpcChannel } from '../../shared/constants/channels'

type Listener = (event: { sender: object }, ...args: unknown[]) => Promise<unknown>
const listeners = vi.hoisted(() => new Map<string, Listener>())
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, listener: Listener) => listeners.set(channel, listener) }
}))

import { handle, trustSenders } from './handle'

describe('FileBird IPC sender guard', () => {
  it('serves trusted pages and refuses every other page', async () => {
    const fileBirdView = {}
    const otherPage = {}
    trustSenders((sender) => sender === fileBirdView)
    handle('connections:list' as IpcChannel, () => 'profiles')
    const listener = listeners.get('connections:list')!

    await expect(listener({ sender: fileBirdView })).resolves.toBe('profiles')
    await expect(listener({ sender: otherPage })).rejects.toThrow(/PERMISSION_DENIED.*Unauthorized sender/)
  })
})
