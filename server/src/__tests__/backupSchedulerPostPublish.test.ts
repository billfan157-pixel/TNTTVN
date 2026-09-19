import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { runBackupNow } from '../services/backupScheduler.js'
import { client } from '../db/index.js'

// DR-P2-002: a failure during the post-publish blob upload must not leave a
// corrupted artifact under the published backup name. The scheduler reads the
// completed snapshot from its partial path before publishing; the local blob
// backend publishes atomically. Inject a putObject failure to prove the
// published file survives intact.
vi.mock('../services/blobStorage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/blobStorage.js')>()
  return {
    ...actual,
    putObject: async () => {
      throw new Error('injected post-publish blob failure')
    },
  }
})

const TEST_BACKUP_DIR = path.join(process.cwd(), 'backups-test-postpublish')

describe('backup artifact survives post-publish blob failure (DR-P2-002)', () => {
  beforeEach(() => {
    process.env.BACKUP_DIR = TEST_BACKUP_DIR
    if (fs.existsSync(TEST_BACKUP_DIR)) {
      fs.rmSync(TEST_BACKUP_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
    fs.mkdirSync(TEST_BACKUP_DIR, { recursive: true })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (fs.existsSync(TEST_BACKUP_DIR)) {
      fs.rmSync(TEST_BACKUP_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })

  it('reports failure but leaves a valid published SQLite artifact and no partial residue', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const res = await runBackupNow()
    expect(res.success).toBe(false)
    expect(res.error).toContain('injected post-publish blob failure')

    const artifacts = fs.readdirSync(TEST_BACKUP_DIR).filter((name) => name.endsWith('.sqlite'))
    expect(artifacts).toHaveLength(1)

    const buffer = fs.readFileSync(path.join(TEST_BACKUP_DIR, artifacts[0]))
    expect(buffer.length).toBeGreaterThan(100)
    expect(buffer.slice(0, 16).toString('utf8')).toContain('SQLite format 3')

    const snapshotPath = path.resolve(path.join(TEST_BACKUP_DIR, artifacts[0])).replace(/\\/g, '/').replace(/'/g, "''")
    await client.execute(`ATTACH DATABASE '${snapshotPath}' AS postpublish_verify`)
    try {
      const integrity = await client.execute('PRAGMA postpublish_verify.integrity_check')
      expect((integrity.rows[0] as Record<string, unknown>).integrity_check).toBe('ok')
    } finally {
      await client.execute('DETACH DATABASE postpublish_verify')
    }

    // No half-written residue under the backup name or temp/partial patterns.
    const residue = fs.readdirSync(TEST_BACKUP_DIR)
      .filter((name) => name.includes('.partial-') || name.includes('.tmp-'))
    expect(residue).toEqual([])
  })
})
