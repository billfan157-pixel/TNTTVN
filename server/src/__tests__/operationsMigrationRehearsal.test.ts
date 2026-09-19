import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { client } from '../db/index.js'
import { rehearseOperationsMigrations } from '../db/operationsMigrationRehearsal.js'
import { MIGRATIONS } from '../db/migrations.js'

const directory = mkdtempSync(join(tmpdir(), 'catevia-operations-rehearsal-test-'))
const sourceBackup = join(directory, 'finalized-backup.sqlite')

beforeAll(async () => {
  await client.execute(`
    INSERT OR IGNORE INTO operation_events (
      id, parish_id, title, event_type, starts_at, ends_at, timezone,
      status, visibility, version, created_by, updated_by
    ) VALUES (
      'event-rehearsal', 'parish-a', 'Migration rehearsal', 'MEETING',
      '2027-01-01T01:00:00.000Z', '2027-01-01T02:00:00.000Z', 'Asia/Ho_Chi_Minh',
      'DRAFT', 'INTERNAL', 1, 'operator', 'operator'
    )
  `)
  const target = sourceBackup.replace(/\\/g, '/').replace(/'/g, "''")
  await client.execute(`VACUUM INTO '${target}'`)
})

afterAll(async () => {
  await client.execute("DELETE FROM operation_events WHERE parish_id = 'parish-a' AND id = 'event-rehearsal'")
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe('Operations migration and recovery rehearsal', () => {
  it('verifies a finalized backup on an isolated copy and preserves all Operations data', async () => {
    const manifest = await rehearseOperationsMigrations({
      sourceBackupPath: sourceBackup,
      liveDatabasePath: join(directory, 'live.sqlite'),
    })

    expect(manifest.status).toBe('verified')
    expect(manifest.sourceBackup).toBe('finalized-backup.sqlite')
    expect(manifest.sourceUnchanged).toBe(true)
    expect(manifest.migrationMarkers.latest).toBe(MIGRATIONS.map(migration => migration.version).sort().at(-1))
    expect(manifest.migrationMarkers.after).toBeGreaterThanOrEqual(manifest.migrationMarkers.before)
    const eventTable = manifest.operationTables.find(table => table.table === 'operation_events')
    expect(eventTable?.rowsBefore).toBeGreaterThanOrEqual(1)
    expect(eventTable).toMatchObject({ rowsAfter: eventTable?.rowsBefore, preservedDigest: true })
    expect(eventTable?.digestSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(manifest.recoverySnapshot.matchesMigratedCopy).toBe(true)
    expect(manifest.recoverySnapshot.operationTableCount).toBeGreaterThan(0)
  })

  it('refuses to rehearse against the configured live database path', async () => {
    await expect(rehearseOperationsMigrations({ sourceBackupPath: sourceBackup, liveDatabasePath: sourceBackup }))
      .rejects.toThrow(/refuses the live\/default database path/i)
  })

  it('reports duplicate active boards before migration without changing the legacy backup', async () => {
    const legacyBackup = join(directory, 'duplicate-boards.sqlite')
    copyFileSync(sourceBackup, legacyBackup)
    const target = legacyBackup.replace(/\\/g, '/').replace(/'/g, "''")
    await client.execute(`ATTACH DATABASE '${target}' AS legacy_rehearsal`)
    try {
      await client.execute('DROP INDEX legacy_rehearsal.idx_parish_units_one_active_board')
      await client.execute("DELETE FROM legacy_rehearsal.schema_migrations WHERE version = '20260910-251'")
      for (const id of ['board-first', 'board-second']) {
        await client.execute({
          sql: `INSERT INTO legacy_rehearsal.parish_organization_units
            (id, parish_id, name, unit_type, is_active, created_by, updated_by, created_at, updated_at)
            VALUES (?, 'private-parish', 'Private board', 'BOARD', 1, 'operator', 'operator', '2026-09-10', '2026-09-10')`,
          args: [id],
        })
      }
    } finally {
      await client.execute('DETACH DATABASE legacy_rehearsal')
    }
    const digest = () => createHash('sha256').update(readFileSync(legacyBackup)).digest('hex')
    const before = digest()
    const error = await rehearseOperationsMigrations({
      sourceBackupPath: legacyBackup, liveDatabasePath: join(directory, 'live.sqlite'),
    }).catch((failure: Error) => failure)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('1 parish(es) have duplicate active BOARD units')
    expect((error as Error).message).not.toContain('private-parish')
    expect(digest()).toBe(before)
  })

  it('fails before migration when the backup contains foreign-key violations', async () => {
    const corruptBackup = join(directory, 'foreign-key-invalid.sqlite')
    copyFileSync(sourceBackup, corruptBackup)
    await client.execute('PRAGMA foreign_keys = OFF')
    const target = corruptBackup.replace(/\\/g, '/').replace(/'/g, "''")
    await client.execute(`ATTACH DATABASE '${target}' AS corrupt_rehearsal`)
    try {
      await client.execute(`
        INSERT INTO corrupt_rehearsal.operation_event_template_versions (
          parish_id, template_id, version, source_event_id, snapshot_json, created_by
        ) VALUES ('parish-a', 'missing-template', 1, 'missing-event', '{}', 'operator')
      `)
    } finally {
      await client.execute('DETACH DATABASE corrupt_rehearsal')
      await client.execute('PRAGMA foreign_keys = ON')
    }

    await expect(rehearseOperationsMigrations({
      sourceBackupPath: corruptBackup,
      liveDatabasePath: join(directory, 'live.sqlite'),
    })).rejects.toThrow(/pre-migration backup foreign_key_check/i)
  })
})
