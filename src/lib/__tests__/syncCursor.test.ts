import { beforeEach, describe, expect, it, vi } from 'vitest'

const rows = new Map<string, { key: string; value: string }>()
let activeScopeKey: string | null
vi.mock('../db', () => ({
  getDB: () => ({
    syncMeta: {
      get: async (key: string) => rows.get(key),
      put: async (row: { key: string; value: string }) => { rows.set(row.key, row) },
      delete: async (key: string) => { rows.delete(key) },
    },
  }),
}))

vi.mock('../tenantScope', () => ({
  scopedStorageKey: (key: string) => activeScopeKey ? `${key}:${activeScopeKey}` : null,
}))

import {
  captureSyncCursorScope,
  clearSyncCursor,
  readSyncCursor,
  writeSyncCursor,
  writeSyncCursorIfScopeMatches,
} from '../syncCursor'

describe('tenant-scoped durable sync cursor', () => {
  beforeEach(() => {
    rows.clear()
    activeScopeKey = 'P1:U1'
  })

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

  it('does not commit an in-flight pull after logout or account switch', async () => {
    const expectedScope = captureSyncCursorScope()

    activeScopeKey = null
    await expect(writeSyncCursorIfScopeMatches('2026-09-01T10:00:00.000Z', expectedScope)).resolves.toBe(false)

    activeScopeKey = 'P2:U2'
    await expect(writeSyncCursorIfScopeMatches('2026-09-01T10:00:00.000Z', expectedScope)).resolves.toBe(false)
    expect(rows.size).toBe(0)
  })

  it('commits only to the exact scope that started the pull', async () => {
    const expectedScope = captureSyncCursorScope()
    await expect(writeSyncCursorIfScopeMatches('2026-09-01T10:00:00.000Z', expectedScope)).resolves.toBe(true)
    expect(rows.get('sync_cursor_v1:P1:U1')?.value).toBe('2026-09-01T10:00:00.000Z')
  })
})
