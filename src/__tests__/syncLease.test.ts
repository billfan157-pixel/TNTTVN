import { beforeEach, describe, expect, it } from 'vitest'
import { acquireSyncLease, releaseSyncLease, syncLeaseConfig } from '../lib/syncLease'

describe('sync lease', () => {
  beforeEach(() => {
    localStorage.clear()
    releaseSyncLease()
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
})
