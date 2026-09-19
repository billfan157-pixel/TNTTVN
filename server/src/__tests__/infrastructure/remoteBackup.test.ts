import { describe, expect, it } from 'vitest'
import { createDisposableRestoreTarget } from '../helpers/restoreTarget.js'
import { createLogicalSnapshot, decryptLogicalSnapshot, encryptLogicalSnapshot, restoreLogicalSnapshot } from '../../services/remoteBackup.js'
import { prepareEmptyRestoreTarget } from '../../db/restorePreparation.js'
import { assertDatabaseReady } from '../../db/schemaHealth.js'
import { drizzle } from 'drizzle-orm/libsql'
import { users, parishEvents, operationEvents, operationWorkstreams, operationTasks } from '../../db/schema.js'

const TEST_KEY = '11'.repeat(32)

const createMemoryClient = createDisposableRestoreTarget

describe('encrypted Turso logical backup', () => {
  it.each(['ACTIVE', 'LOCKED'] as const)('restores populated Operations and historical organizer state (%s) without replaying command triggers', async status => {
    const source = createMemoryClient(), target = createMemoryClient()
    try {
      await prepareEmptyRestoreTarget(source)
      await prepareEmptyRestoreTarget(target)
      const sourceDb = drizzle(source)
      const parishId = 'gia-ton'
      await sourceDb.insert(users).values({ id: 'organizer', parishId, username: 'synthetic', passwordHash: 'synthetic-hash', fullName: 'Synthetic', role: 'admin' })
      await sourceDb.insert(parishEvents).values({ id: 'calendar', parishId, title: 'Synthetic', date: '2026-09-19', category: 'OTHER' })
      const event = { id: 'event', parishId, title: 'Synthetic', eventType: 'OTHER', startsAt: '2026-09-19T00:00:00Z', endsAt: '2026-09-19T01:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'PLANNING' as const, visibility: 'PUBLIC_SUMMARY' as const, sourceParishEventId: 'calendar', organizerUserId: 'organizer', createdBy: 'organizer', updatedBy: 'organizer' }
      await sourceDb.insert(operationEvents).values(event)
      await sourceDb.insert(operationWorkstreams).values({ id: 'workstream', parishId, operationEventId: 'event', name: 'Synthetic', leaderUserId: 'organizer', createdBy: 'organizer', updatedBy: 'organizer' })
      await sourceDb.insert(operationTasks).values({ id: 'task', parishId, operationEventId: 'event', workstreamId: 'workstream', title: 'Synthetic', createdBy: 'organizer', updatedBy: 'organizer' })
      // Existing history is valid after an organizer is locked; new commands are not.
      await source.execute({ sql: 'UPDATE users SET status = ? WHERE id = ?', args: [status, 'organizer'] })
      expect((await source.execute('PRAGMA foreign_key_check')).rows).toHaveLength(0)
      const snapshot = await createLogicalSnapshot(source)
      const triggerQuery = "SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' ORDER BY rowid"
      const triggers = (await target.execute(triggerQuery)).rows
      const result = await restoreLogicalSnapshot(target, decryptLogicalSnapshot(encryptLogicalSnapshot(snapshot, TEST_KEY), TEST_KEY))
      expect(result.restoredRows).toBe(snapshot.rowCount)
      expect((await createLogicalSnapshot(target, snapshot.createdAt)).checksum).toBe(snapshot.checksum)
      expect((await target.execute(triggerQuery)).rows).toEqual(triggers)
      await assertDatabaseReady(target)
      await expect(drizzle(target).insert(operationEvents).values({ ...event, id: 'invalid', organizerUserId: 'missing' })).rejects.toMatchObject({ cause: { message: expect.stringContaining('INVALID_OPERATION_EVENT_ORGANIZER_USER') } })
    } finally { source.close(); target.close() }
  }, 30_000)

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

  it('does not replay trigger side effects while restoring facts, but reinstates normal writes', async () => {
    const target = createMemoryClient()
    try {
      await target.execute('CREATE TABLE academic_years (id TEXT PRIMARY KEY, policy TEXT)')
      await target.execute("INSERT INTO academic_years VALUES ('year', 'original-policy')")
      const snapshot = await createLogicalSnapshot(target as any)
      await target.execute('DELETE FROM academic_years')
      await target.execute("CREATE TRIGGER corrupt_policy AFTER INSERT ON academic_years BEGIN UPDATE academic_years SET policy = 'changed'; END")
      await restoreLogicalSnapshot(target, snapshot)
      expect((await target.execute('SELECT policy FROM academic_years')).rows[0].policy).toBe('original-policy')
      await target.execute("INSERT INTO academic_years VALUES ('new', 'new-policy')")
      expect((await target.execute('SELECT DISTINCT policy FROM academic_years')).rows).toEqual([{ policy: 'changed' }])
    } finally { target.close() }
  })

  it('still rejects equal row counts with content coerced by target affinity', async () => {
    const source = createMemoryClient(), target = createMemoryClient()
    try {
      await source.execute('CREATE TABLE facts (id TEXT PRIMARY KEY, value TEXT)')
      await source.execute("INSERT INTO facts VALUES ('fact', '001')")
      await target.execute('CREATE TABLE facts (id TEXT PRIMARY KEY, value NUMERIC)')
      await expect(restoreLogicalSnapshot(target, await createLogicalSnapshot(source))).rejects.toThrow(/content mismatch.*discard this target/)
    } finally { source.close(); target.close() }
  })

  it('rolls back rows and trigger suspension together on a failed load', async () => {
    const source = createMemoryClient(), target = createMemoryClient()
    try {
      await source.execute('CREATE TABLE facts (id TEXT PRIMARY KEY)')
      await source.execute("INSERT INTO facts VALUES ('valid'), ('invalid')")
      await target.execute("CREATE TABLE facts (id TEXT PRIMARY KEY CHECK(id <> 'invalid'))")
      await target.execute("CREATE TRIGGER guard BEFORE INSERT ON facts WHEN NEW.id = 'forbidden' BEGIN SELECT RAISE(ABORT, 'NORMAL_WRITE_GUARD'); END")
      const query = "SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' ORDER BY name"
      const triggers = (await target.execute(query)).rows
      await expect(restoreLogicalSnapshot(target, await createLogicalSnapshot(source))).rejects.toThrow(/CHECK constraint failed/)
      expect((await target.execute('SELECT * FROM facts')).rows).toHaveLength(0)
      expect((await target.execute(query)).rows).toEqual(triggers)
      await expect(target.execute("INSERT INTO facts VALUES ('forbidden')")).rejects.toThrow('NORMAL_WRITE_GUARD')
      expect((await target.execute('PRAGMA foreign_keys')).rows[0].foreign_keys).toBe(1)
    } finally { source.close(); target.close() }
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
