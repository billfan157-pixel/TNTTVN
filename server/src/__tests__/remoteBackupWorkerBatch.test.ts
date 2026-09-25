import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLogicalSnapshot } from '../services/remoteBackup.js'

const originalRuntime = process.env.CATEVIA_RUNTIME

beforeAll(() => {
  process.env.CATEVIA_RUNTIME = 'cloudflare-worker'
  vi.stubGlobal('WebSocketPair', class {})
})

afterAll(() => {
  if (originalRuntime === undefined) delete process.env.CATEVIA_RUNTIME
  else process.env.CATEVIA_RUNTIME = originalRuntime
  vi.unstubAllGlobals()
})

describe('Worker logical backup read batching', () => {
  it('reads table rows in one batch while preserving table order and content', async () => {
    const execute = vi.fn(async () => ({ rows: [{ name: 'alpha' }, { name: 'beta' }], columns: ['name'] }))
    const batch = vi.fn(async () => [
      { rows: [{ id: 'a1' }], columns: ['id'] },
      { rows: [{ id: 'b1' }, { id: 'b2' }], columns: ['id'] },
    ])
    const snapshot = await createLogicalSnapshot({ execute, batch } as any)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(batch).toHaveBeenCalledWith(['SELECT * FROM "alpha"', 'SELECT * FROM "beta"'])
    expect(snapshot.tables.map(table => [table.name, table.rows])).toEqual([
      ['alpha', [['a1']]], ['beta', [['b1'], ['b2']]],
    ])
    expect(snapshot.rowCount).toBe(3)
  })

  it('refuses an incomplete result rather than producing a partial backup', async () => {
    await expect(createLogicalSnapshot({
      execute: async () => ({ rows: [{ name: 'alpha' }, { name: 'beta' }], columns: ['name'] }),
      batch: async () => [{ rows: [], columns: [] }],
    } as any)).rejects.toThrow('Incomplete logical backup read batch')
  })
})
