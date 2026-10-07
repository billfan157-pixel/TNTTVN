import { createClient } from '@libsql/client'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// libSQL transactions use another connection: anonymous :memory: does not
// preserve the schema there. Each drill gets a private OS-temp file instead.
export async function createDisposableRestoreTarget() {
  const directory = mkdtempSync(join(tmpdir(), 'catevia-restore-test-'))
  const filename = join(directory, 'target.sqlite')
  const client = createClient({ url: `file:${filename.replace(/\\/g, '/')}` })
  // Match the local application's WAL/NORMAL settings. DELETE/FULL performs
  // hundreds of durable disk flushes while replaying the complete schema;
  // those fixture writes can exhaust a recovery test's budget before restore
  // and quarantine verification even begin.
  try {
    await client.execute('PRAGMA journal_mode=WAL')
    await client.execute('PRAGMA synchronous=NORMAL')
    await client.execute('PRAGMA busy_timeout=5000')
  } catch (error) {
    client.close()
    throw error
  }
  // Keep the isolated fixture in OS-temp, as with the suite's main test DB.
  // libSQL's local transaction connection survives commit/client.close until
  // native GC/process exit; synchronous unlink in finally masks assertions with
  // EBUSY on Windows. This helper never targets a workspace/production database.
  return client
}
