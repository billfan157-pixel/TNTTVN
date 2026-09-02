import { beforeEach, describe, expect, it, vi } from 'vitest'

const rows = new Map<string, { key: string; value: string }>()
vi.mock('../db', () => ({
  getDB: () => ({
    syncMeta: {
      get: async (key: string) => rows.get(key),
      put: async (row: { key: string; value: string }) => { rows.set(row.key, row) },
      delete: async (key: string) => { rows.delete(key) },
    },
  }),
}))

vi.mock('../tenantScope', () => ({ scopedStorageKey: (key: string) => `${key}:P1:U1` }))

import { clearSyncCursor, readSyncCursor, writeSyncCursor } from '../syncCursor'

describe('tenant-scoped durable sync cursor', () => {
  beforeEach(() => rows.clear())

  it('persists only valid server watermarks', async () => {
    await writeSyncCursor('2026-09-01T10:00:00.000Z')
    await expect(readSyncCursor()).resolves.toBe('2026-09-01T10:00:00.000Z')
    await expect(writeSyncCursor('device-clock')).rejects.toThrow('Invalid server sync watermark')
  })

  it('can be cleared for a forced full resync', async () => {
    await writeSyncCursor('2026-09-01T10:00:00.000Z')
    await clearSyncCursor()
    await expect(readSyncCursor()).resolves.toBeNull()
  })
})
