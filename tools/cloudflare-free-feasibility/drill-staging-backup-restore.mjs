// Restore the downloaded R2 fixture into an isolated, new temporary database.
// No existing Turso database or local application database is modified.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'

process.env.DEPLOYMENT_PARISH_ID = 'gia-ton'
const [{ decryptLogicalSnapshot, restoreLogicalSnapshot }, { prepareEmptyRestoreTarget },
  { assertDatabaseReady }, { assertNotRecoveryQuarantined }] = await Promise.all([
  import('../../server/src/services/remoteBackup.ts'),
  import('../../server/src/db/restorePreparation.ts'),
  import('../../server/src/db/schemaHealth.ts'),
  import('../../server/src/db/recoveryQuarantine.ts'),
])

const values = Object.fromEntries(readFileSync(new URL('./.dev.vars.catevia-staging', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/).map((line) => {
    const equal = line.indexOf('=')
    return [line.slice(0, equal), line.slice(equal + 1)]
  }))
if (!values.TURSO_URL?.includes('catevia-cloudflare-probe-20260924') || !values.BACKUP_ENCRYPTION_KEY) {
  throw new Error('Disposable staging credentials required')
}
const snapshot = decryptLogicalSnapshot(readFileSync(new URL('./.backup-probe.enc', import.meta.url)), values.BACKUP_ENCRYPTION_KEY)
const targetPath = fileURLToPath(new URL(`./.backup-probe-restore-${randomUUID()}.sqlite`, import.meta.url))
const target = createClient({ url: `file:${targetPath.replace(/\\/g, '/')}` })
const start = Date.now()
try {
  await prepareEmptyRestoreTarget(target)
  const restored = await restoreLogicalSnapshot(target, snapshot, {
    parishId: 'gia-ton',
    targetFingerprint: createHash('sha256').update(`isolated-staging-restore-${targetPath}`).digest('hex'),
  })
  await assertDatabaseReady(target)
  let quarantineBlocksStartup = false
  try { await assertNotRecoveryQuarantined(target) } catch (error) {
    quarantineBlocksStartup = String(error?.message).includes('RECOVERY_QUARANTINED')
  }
  if (!quarantineBlocksStartup || !restored.quarantined || restored.restoredRows !== snapshot.rowCount
      || restored.foreignKeyViolations !== 0) throw new Error('Restore drill verification failed')
  const result = {
    capturedAt: new Date().toISOString(), scope: 'downloaded-disposable-r2-to-isolated-temporary-sqlite',
    verified: true, rowCount: restored.restoredRows, tableCount: Object.keys(restored.tableCounts).length,
    foreignKeyViolations: restored.foreignKeyViolations, quarantineBlocksStartup,
    durationMs: Date.now() - start,
  }
  writeFileSync(new URL('./results/2026-09-24-catevia-staging-restore-drill.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(result)}\n`)
} finally {
  try {
    await target.close()
  } catch (error) {
    console.error(`Failed to close isolated restore target: ${error?.code || error?.name || 'unknown error'}`)
    process.exitCode = 1
  }
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(`${targetPath}${suffix}`)) {
      try { unlinkSync(`${targetPath}${suffix}`) } catch (error) {
        if (error?.code !== 'EBUSY') {
          console.error(`Failed to remove isolated restore file: ${error?.code || error?.name || 'unknown error'}`)
          process.exitCode = 1
        }
      }
    }
  }
}
