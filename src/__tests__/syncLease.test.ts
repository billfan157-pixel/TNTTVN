import { beforeEach, describe, expect, it, vi } from 'vitest'
import { acquireSyncLease, releaseSyncLease, runWithSyncLease, syncLeaseConfig } from '../lib/syncLease'

describe('sync lease', () => {
  beforeEach(() => {
    localStorage.clear()
    releaseSyncLease()
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  })

  it('acquires and releases its own lease', () => {
    expect(acquireSyncLease(1_000)).toBe(true)
    expect(JSON.parse(localStorage.getItem(syncLeaseConfig.key) || '{}').expiresAt).toBe(1_000 + syncLeaseConfig.ttlMs)
    releaseSyncLease()
    expect(localStorage.getItem(syncLeaseConfig.key)).toBeNull()
  })

  it('does not take over a non-expired lease owned by another tab', () => {
    localStorage.setItem(syncLeaseConfig.key, JSON.stringify({ owner: 'SYNC-other-tab', expiresAt: 61_000 }))
    expect(acquireSyncLease(1_000)).toBe(false)
  })

  it('takes over an expired lease', () => {
    localStorage.setItem(syncLeaseConfig.key, JSON.stringify({ owner: 'SYNC-other-tab', expiresAt: 999 }))
    expect(acquireSyncLease(1_000)).toBe(true)
  })

  it('uses an atomic Web Lock when the runtime supports it', async () => {
    const request = vi.fn(async (name: string, options: unknown, callback: (lock: unknown) => Promise<boolean>) => {
      expect(name).toBe(syncLeaseConfig.webLockName)
      expect(options).toEqual({ ifAvailable: true, mode: 'exclusive' })
      return callback({ name })
    })
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
    const task = vi.fn(async () => {})

    await expect(runWithSyncLease(task)).resolves.toBe(true)
    expect(task).toHaveBeenCalledOnce()
    expect(localStorage.getItem(syncLeaseConfig.key)).toBeNull()
  })

  it('does not run when another context owns the Web Lock', async () => {
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request: async (_name: string, _options: unknown, callback: (lock: null) => Promise<boolean>) => callback(null) },
    })
    const task = vi.fn(async () => {})

    await expect(runWithSyncLease(task)).resolves.toBe(false)
    expect(task).not.toHaveBeenCalled()
  })
})
