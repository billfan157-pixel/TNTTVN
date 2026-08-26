import { describe, expect, it } from 'vitest'
import { createLogicalSnapshot, decryptLogicalSnapshot, encryptLogicalSnapshot } from '../../services/remoteBackup.js'

const TEST_KEY = '11'.repeat(32)

describe('encrypted Turso logical backup', () => {
  it('captures every table row and round-trips AES-GCM without plaintext PII', async () => {
    const executor = {
      execute: async (statement: unknown) => {
        const sql = typeof statement === 'string' ? statement : ''
        if (sql.includes('sqlite_schema')) return { rows: [{ name: 'students' }], columns: ['name'] }
        return {
          rows: [{ id: 'ST-1', full_name: 'Nguyễn Văn A', avatar: new Uint8Array([1, 2, 3]) }],
          columns: ['id', 'full_name', 'avatar'],
        }
      },
    }
    const snapshot = await createLogicalSnapshot(executor as any, '2026-08-26T00:00:00.000Z')
    expect(snapshot.rowCount).toBe(1)

    const encrypted = encryptLogicalSnapshot(snapshot, TEST_KEY)
    expect(encrypted.toString('utf8')).not.toContain('Nguyễn Văn A')
    expect(decryptLogicalSnapshot(encrypted, TEST_KEY)).toEqual(snapshot)
  })

  it('fails closed for the wrong encryption key', async () => {
    const snapshot = await createLogicalSnapshot({
      execute: async () => ({ rows: [], columns: [] }),
    } as any)
    const encrypted = encryptLogicalSnapshot(snapshot, TEST_KEY)
    expect(() => decryptLogicalSnapshot(encrypted, '22'.repeat(32))).toThrow()
  })
})
