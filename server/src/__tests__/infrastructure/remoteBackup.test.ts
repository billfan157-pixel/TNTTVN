import { describe, expect, it } from 'vitest'
import { createDisposableRestoreTarget } from '../helpers/restoreTarget.js'
import { createLogicalSnapshot, decryptLogicalSnapshot, encryptLogicalSnapshot, restoreLogicalSnapshot } from '../../services/remoteBackup.js'

const TEST_KEY = '11'.repeat(32)

const createMemoryClient = createDisposableRestoreTarget

describe('encrypted Turso logical backup', () => {
  it('rejects a checksum-valid snapshot missing a target table before any writes', async () => {
    const target = createMemoryClient()
    try {
      await target.executeMultiple('CREATE TABLE academic_years (id TEXT PRIMARY KEY, status TEXT);')
      await target.execute("INSERT INTO academic_years VALUES ('year', 'FINALIZED')")
      const snapshot = await createLogicalSnapshot(target as any)
      await target.execute('DELETE FROM academic_years')
      await target.execute('CREATE TABLE academic_year_snapshots (id TEXT PRIMARY KEY)')
      await expect(restoreLogicalSnapshot(target, snapshot)).rejects.toThrow(/missing target tables/)
      expect((await target.execute('SELECT * FROM academic_years')).rows).toHaveLength(0)
    } finally { target.close() }
  })

  it('does not certify equal row counts when a target trigger changes restored content', async () => {
    const target = createMemoryClient()
    try {
      await target.execute('CREATE TABLE academic_years (id TEXT PRIMARY KEY, policy TEXT)')
      await target.execute("INSERT INTO academic_years VALUES ('year', 'original-policy')")
      const snapshot = await createLogicalSnapshot(target as any)
      await target.execute('DELETE FROM academic_years')
      await target.execute("CREATE TRIGGER corrupt_policy AFTER INSERT ON academic_years BEGIN UPDATE academic_years SET policy = 'changed'; END")
      await expect(restoreLogicalSnapshot(target, snapshot)).rejects.toThrow(/content mismatch.*discard this target/)
    } finally { target.close() }
  })

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

  it('restores only into an empty compatible target and verifies counts/FKs', async () => {
    const target = createMemoryClient()
    try {
      const ddl = `
        DROP TABLE IF EXISTS children;
        DROP TABLE IF EXISTS parents;
        DROP TABLE IF EXISTS items;
        CREATE TABLE parents (id TEXT PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE children (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parents(id));
      `
      await target.executeMultiple(ddl)
      await target.execute("INSERT INTO parents(id,name) VALUES ('P1','Parent')")
      await target.execute("INSERT INTO children(id,parent_id) VALUES ('C1','P1')")
      const snapshot = await createLogicalSnapshot(target as any)
      await target.execute('DELETE FROM children')
      await target.execute('DELETE FROM parents')
      const result = await restoreLogicalSnapshot(target, snapshot)
      expect(result).toEqual({ restoredRows: 2, tableCounts: { children: 1, parents: 1 }, foreignKeyViolations: 0 })
    } finally {
      target.close()
    }
  })

  it('refuses a non-empty target before deleting any target data', async () => {
    const target = createMemoryClient()
    try {
      await target.executeMultiple('DROP TABLE IF EXISTS children; DROP TABLE IF EXISTS parents; DROP TABLE IF EXISTS items; CREATE TABLE items (id TEXT PRIMARY KEY);')
      await target.execute("INSERT INTO items(id) VALUES ('SOURCE')")
      const snapshot = await createLogicalSnapshot(target as any)
      await target.execute('DELETE FROM items')
      await target.execute("INSERT INTO items(id) VALUES ('TARGET')")

      await expect(restoreLogicalSnapshot(target, snapshot)).rejects.toThrow(/target is not empty/i)
      const rows = await target.execute('SELECT id FROM items')
      expect(rows.rows.map((row) => row.id)).toEqual(['TARGET'])
    } finally {
      target.close()
    }
  })

  it('fails post-restore validation when the snapshot contains FK violations', async () => {
    const target = createMemoryClient()
    try {
      const ddl = `
        DROP TABLE IF EXISTS children;
        DROP TABLE IF EXISTS parents;
        DROP TABLE IF EXISTS items;
        CREATE TABLE parents (id TEXT PRIMARY KEY);
        CREATE TABLE children (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parents(id));
      `
      await target.executeMultiple(ddl)
      await target.execute('PRAGMA foreign_keys=OFF')
      await target.execute("INSERT INTO children(id,parent_id) VALUES ('C1','MISSING')")
      const snapshot = await createLogicalSnapshot(target as any)
      await target.execute('DELETE FROM children')

      await expect(restoreLogicalSnapshot(target, snapshot)).rejects.toThrow(/foreign_key_check.*discard this target/i)
    } finally {
      target.close()
    }
  })
})
