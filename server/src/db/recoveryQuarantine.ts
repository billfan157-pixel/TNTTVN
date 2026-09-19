import { randomUUID } from 'node:crypto'
import type { InStatement, ResultSet } from '@libsql/client'

type Executor = { execute(statement: InStatement): Promise<ResultSet> }

export const RECOVERY_QUARANTINE_KEY = '__recovery_quarantine'

export interface RecoveryQuarantineTarget {
  parishId: string
  targetFingerprint: string
}

/** Internal recovery metadata, never an ordinary settings/API command. */
export function createRecoveryQuarantine(target: RecoveryQuarantineTarget, sourceChecksum: string) {
  if (!target.parishId.trim() || !/^[a-f0-9]{64}$/.test(target.targetFingerprint)) {
    throw new Error('Recovery quarantine requires a parish and normalized target fingerprint')
  }
  const id = randomUUID()
  return {
    key: RECOVERY_QUARANTINE_KEY,
    value: JSON.stringify({ id, status: 'QUARANTINED', targetFingerprint: target.targetFingerprint, sourceChecksum }),
    description: 'Full restore: cutover reconciliation and explicit release required',
    updated_by: null,
    updated_at: new Date().toISOString(),
    parish_id: target.parishId,
  }
}

/** Run on the application connection BEFORE bootstrap/migrations or any worker. */
export async function assertNotRecoveryQuarantined(executor: Executor): Promise<void> {
  const table = await executor.execute("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'system_settings'")
  if (table.rows.length === 0) return // Genuine new database; bootstrap still owns creation.
  const marker = await executor.execute({
    sql: 'SELECT key FROM system_settings WHERE key = ? LIMIT 1',
    args: [RECOVERY_QUARANTINE_KEY],
  })
  // Presence alone blocks: malformed JSON, a different parish, or a forged
  // "released" value must not bypass the fence. No env-var override exists.
  if (marker.rows.length > 0) {
    throw new Error('RECOVERY_QUARANTINED: restored database cannot start the application before approved cutover reconciliation')
  }
}
