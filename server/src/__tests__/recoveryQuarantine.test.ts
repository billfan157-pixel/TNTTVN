// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { createDisposableRestoreTarget } from './helpers/restoreTarget.js'
import { createLogicalSnapshot, restoreLogicalSnapshot } from '../services/remoteBackup.js'
import { assertNotRecoveryQuarantined, RECOVERY_QUARANTINE_KEY } from '../db/recoveryQuarantine.js'
import { prepareEmptyRestoreTarget } from '../db/restorePreparation.js'
import { assertDatabaseReady } from '../db/schemaHealth.js'

const targetIdentity = { parishId: 'synthetic-parish', targetFingerprint: 'a'.repeat(64) }
const settingsDDL = `CREATE TABLE system_settings (
  key TEXT, value TEXT NOT NULL, description TEXT, updated_by TEXT,
  updated_at TEXT NOT NULL, parish_id TEXT NOT NULL, PRIMARY KEY (key, parish_id)
)`

async function fixture() {
  const source = createDisposableRestoreTarget()
  const directory = mkdtempSync(join(tmpdir(), 'catevia-quarantine-'))
  const dbPath = join(directory, 'target.sqlite').replace(/\\/g, '/')
  const target = createClient({ url: `file:${dbPath}` })
  for (const client of [source, target]) {
    await client.execute(settingsDDL)
    await client.execute('CREATE TABLE facts (id TEXT PRIMARY KEY, value TEXT)')
  }
  await source.execute("INSERT INTO facts VALUES ('identity-session-job', 'snapshot-state')")
  await source.execute("INSERT INTO system_settings VALUES ('purge_version', '3', NULL, NULL, '2026-09-19', 'synthetic-parish')")
  const snapshot = await createLogicalSnapshot(source)
  return { source, target, snapshot, dbPath }
}

describe('DR-P2-005 restored-target quarantine', () => {
  it('keeps full current-schema readiness compatible with the quarantined metadata overlay', async () => {
    const source = createDisposableRestoreTarget(), target = createDisposableRestoreTarget()
    try {
      await prepareEmptyRestoreTarget(source)
      await prepareEmptyRestoreTarget(target)
      const snapshot = await createLogicalSnapshot(source)
      const result = await restoreLogicalSnapshot(target, snapshot, targetIdentity)
      expect(result.quarantined).toBe(true)
      expect(result.restoredRows).toBe(snapshot.rowCount)
      await expect(assertDatabaseReady(target)).resolves.toBeUndefined()
      await expect(assertNotRecoveryQuarantined(target)).rejects.toThrow('RECOVERY_QUARANTINED')
    } finally { source.close(); target.close() }
  }, 30_000)

  it('persists one declared metadata delta, preserving every source fact, and blocks the application bootstrap', async () => {
    const { source, target, snapshot, dbPath } = await fixture()
    try {
      const result = await restoreLogicalSnapshot(target, snapshot, targetIdentity)
      expect(result.quarantined).toBe(true)
      expect(result.restoredRows).toBe(snapshot.rowCount)
      expect(result.tableCounts.system_settings).toBe(2)
      await expect(assertNotRecoveryQuarantined(target)).rejects.toThrow('RECOVERY_QUARANTINED')
      const restored = await createLogicalSnapshot(target)
      for (const table of snapshot.tables) {
        const actual = restored.tables.find(item => item.name === table.name)!
        const keyIndex = actual.columns.indexOf('key')
        expect(actual.rows.filter(row => table.name !== 'system_settings' || row[keyIndex] !== RECOVERY_QUARANTINE_KEY)).toEqual(table.rows)
      }
      const marker = (await target.execute({ sql: 'SELECT value FROM system_settings WHERE key = ?', args: [RECOVERY_QUARANTINE_KEY] })).rows[0]
      expect(JSON.parse(String(marker.value))).toMatchObject({ status: 'QUARANTINED', sourceChecksum: snapshot.checksum, targetFingerprint: targetIdentity.targetFingerprint })

      // Real application DB import in a separate process: the fence must run
      // before even bootstrap DDL, not just before an eventual HTTP request.
      for (const entry of ['./server/src/db/index.ts', './server/src/index.ts']) {
        const boot = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
          `await import('${entry}'); console.log('UNSAFE_BOOTSTRAP_COMPLETED')`], {
          cwd: resolve('.'), encoding: 'utf8', timeout: 20_000,
          env: { ...process.env, NODE_ENV: 'test', DB_PATH: dbPath, TURSO_URL: '', TURSO_AUTH_TOKEN: '',
            R2_ENDPOINT: '', R2_BUCKET: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '',
            SENTRY_DSN: '', TELEGRAM_BOT_TOKEN: '', SERVER_PORT: '0', HOST: '127.0.0.1' },
        })
        expect(boot.error, entry).toBeUndefined()
        expect(boot.status, entry).toBe(1)
        expect(boot.stderr, entry).toContain('RECOVERY_QUARANTINED')
        expect(boot.stdout, entry).not.toContain('UNSAFE_BOOTSTRAP_COMPLETED')
        expect(boot.stdout, entry).not.toContain('Server running at')
      }
      expect((await createLogicalSnapshot(target, restored.createdAt)).checksum).toBe(restored.checksum)
    } finally { source.close(); target.close() }
  }, 30_000)

  it('rolls back restored rows if the quarantine cannot be persisted', async () => {
    const { source, target, snapshot } = await fixture()
    try {
      await target.execute(`CREATE TRIGGER reject_quarantine BEFORE INSERT ON system_settings
        WHEN NEW.key = '${RECOVERY_QUARANTINE_KEY}' BEGIN SELECT RAISE(ABORT, 'QUARANTINE_WRITE_FAILED'); END`)
      await expect(restoreLogicalSnapshot(target, snapshot, targetIdentity)).rejects.toThrow('QUARANTINE_WRITE_FAILED')
      expect((await target.execute('SELECT * FROM facts')).rows).toHaveLength(0)
      expect((await target.execute('SELECT * FROM system_settings')).rows).toHaveLength(0)
      expect((await target.execute("SELECT name FROM sqlite_schema WHERE type='trigger'")).rows).toEqual([{ name: 'reject_quarantine' }])
    } finally { source.close(); target.close() }
  })

  it('remains quarantined if post-commit verification fails or the caller loses its acknowledgement', async () => {
    const { source, target, snapshot } = await fixture()
    try {
      let committed = false
      const interrupted = new Proxy(target, {
        get(client, property) {
          if (property === 'transaction') return async (...args: Parameters<typeof target.transaction>) => {
            const tx = await client.transaction(...args)
            return new Proxy(tx, { get(transaction, key) {
              if (key === 'commit') return async () => { await transaction.commit(); committed = true }
              const value = Reflect.get(transaction, key)
              return typeof value === 'function' ? value.bind(transaction) : value
            } })
          }
          if (property === 'execute') return async (...args: Parameters<typeof target.execute>) => {
            if (committed && String(args[0]).includes('SELECT count')) throw new Error('READBACK_UNAVAILABLE')
            return client.execute(...args)
          }
          const value = Reflect.get(client, property)
          return typeof value === 'function' ? value.bind(client) : value
        },
      })
      await expect(restoreLogicalSnapshot(interrupted, snapshot, targetIdentity)).rejects.toThrow('READBACK_UNAVAILABLE')
      expect((await target.execute('SELECT * FROM facts')).rows).toHaveLength(1)
      await expect(assertNotRecoveryQuarantined(target)).rejects.toThrow('RECOVERY_QUARANTINED')
      await expect(restoreLogicalSnapshot(target, snapshot, targetIdentity)).rejects.toThrow('not empty')
    } finally { source.close(); target.close() }
  })

  it.each(['not-json', '{"status":"RELEASED"}', ''])('does not trust marker contents or another parish to bypass quarantine (%s)', async value => {
    const target = createDisposableRestoreTarget()
    try {
      await target.execute(settingsDDL)
      await target.execute({ sql: 'INSERT INTO system_settings VALUES (?, ?, NULL, NULL, ?, ?)', args: [RECOVERY_QUARANTINE_KEY, value, '2026-09-19', 'another-parish'] })
      await expect(assertNotRecoveryQuarantined(target)).rejects.toThrow('RECOVERY_QUARANTINED')
    } finally { target.close() }
  })

  it('allows new and ordinary databases; query failures do not fail open', async () => {
    const target = createDisposableRestoreTarget()
    try {
      await expect(assertNotRecoveryQuarantined(target)).resolves.toBeUndefined()
      await target.execute(settingsDDL)
      await expect(assertNotRecoveryQuarantined(target)).resolves.toBeUndefined()
      await expect(assertNotRecoveryQuarantined({ execute: async () => { throw new Error('DB_UNAVAILABLE') } })).rejects.toThrow('DB_UNAVAILABLE')
    } finally { target.close() }
  })

  it('rejects an already-quarantined source instead of laundering its marker', async () => {
    const { source, target, snapshot } = await fixture()
    const next = createDisposableRestoreTarget()
    try {
      await restoreLogicalSnapshot(target, snapshot, targetIdentity)
      await expect(restoreLogicalSnapshot(next, await createLogicalSnapshot(target), targetIdentity)).rejects.toThrow('already recovery-quarantined')
    } finally { source.close(); target.close(); next.close() }
  })

  it('keeps quarantine mandatory in the production CLI and the guard ahead of migrations', () => {
    const cli = readFileSync('server/src/scripts/restoreRemoteBackup.ts', 'utf8')
    expect(cli).toContain('restoreLogicalSnapshot(target, snapshot, { parishId, targetFingerprint: fingerprint })')
    const connection = readFileSync('server/src/db/connection.ts', 'utf8')
    expect(connection.indexOf('await assertNotRecoveryQuarantined(client)')).toBeLessThan(connection.indexOf("await client.execute('PRAGMA foreign_keys=ON')"))
    const bootstrap = readFileSync('server/src/db/index.ts', 'utf8')
    expect(bootstrap).toContain("import { client } from './connection.js'")
  })
})
