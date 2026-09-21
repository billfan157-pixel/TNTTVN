import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// NEW-F-02 (AUDIT04 unknowns closure): local full-DB backups under `backups/`
// must be restricted like `safety/` snapshots — chmod 0600 on both the temp
// write and the published file. The chmod call itself is asserted (POSIX modes
// are not enforceable on Windows; tryChmod600 is the cross-platform seam).

const tryChmod600 = vi.fn()

vi.mock('../../utils/safetyDir.js', () => ({
  getSafetyBackupDir: () => join(tmpdir(), 'blob-perm-safety-test'),
  tryChmod600: (filePath: string) => tryChmod600(filePath),
}))

describe('local PII object write permissions (NEW-F-02)', () => {
  let backupDir: string
  let blobDir: string

  beforeEach(() => {
    tryChmod600.mockClear()
    backupDir = mkdtempSync(join(tmpdir(), 'blob-perm-backup-'))
    blobDir = mkdtempSync(join(tmpdir(), 'blob-perm-misc-'))
    process.env.BACKUP_DIR = backupDir
    process.env.BLOB_LOCAL_DIR = blobDir
    delete process.env.R2_ENDPOINT
    delete process.env.R2_BUCKET
    delete process.env.R2_ACCESS_KEY_ID
    delete process.env.R2_SECRET_ACCESS_KEY
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(backupDir, { recursive: true, force: true, maxRetries: 5 })
    rmSync(blobDir, { recursive: true, force: true, maxRetries: 5 })
    rmSync(join(tmpdir(), 'blob-perm-safety-test'), { recursive: true, force: true, maxRetries: 5 })
    vi.resetModules()
  })

  it('chmods local safety and full-backup objects but leaves non-PII keys alone', async () => {
    const { putObject } = await import('../../services/blobStorage.js')
    await putObject('backups/parish-backup-1.sqlite', Buffer.from('db-bytes'), 'application/x-sqlite3')
    await putObject('safety/purge-1.json', '{"v":1}', 'application/json')
    await putObject('misc/note.txt', Buffer.from('hello'), 'text/plain')

    const chmodPaths = tryChmod600.mock.calls.map(call => String(call[0]))
    // temp file + published file for the backup artifact
    expect(chmodPaths.filter(p => p.includes('parish-backup-1.sqlite')).length).toBeGreaterThanOrEqual(2)
    expect(chmodPaths.filter(p => p.includes('purge-1.json')).length).toBeGreaterThanOrEqual(2)
    expect(chmodPaths.some(p => p.includes('note.txt'))).toBe(false)

    // the published backup object exists under the configured BACKUP_DIR
    expect(existsSync(join(backupDir, 'parish-backup-1.sqlite'))).toBe(true)
    expect(readFileSync(join(backupDir, 'parish-backup-1.sqlite')).toString()).toBe('db-bytes')
  })
})
