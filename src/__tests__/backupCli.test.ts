import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  execute: vi.fn(), close: vi.fn(), renameSync: vi.fn(), unlinkSync: vi.fn(),
  readFileSync: vi.fn(), writeFileSync: vi.fn(), readdirSync: vi.fn(),
}))
vi.mock('fs', () => ({ default: {
  existsSync: () => true, mkdirSync: vi.fn(), statSync: () => ({ mtimeMs: 1 }), ...mocks,
} }))
vi.mock('@libsql/client', () => ({ createClient: () => ({ execute: mocks.execute, close: mocks.close }) }))
// This is the production CLI entry's exported function; filesystem and SQL are isolated.
import { performBackup } from '../../scripts/backup-db.mjs'

describe('XD-09 manual backup CLI snapshot safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execute.mockReset().mockResolvedValue({})
    mocks.renameSync.mockReset()
    mocks.readdirSync.mockReturnValue([])
  })

  it('publishes only after VACUUM success, even if checkpoint fails; quotes destination paths', async () => {
    mocks.execute.mockImplementation(async (sql: string) => {
      if (sql.startsWith('PRAGMA')) throw new Error('checkpoint unavailable')
      expect(mocks.renameSync).not.toHaveBeenCalled()
      return {}
    })
    expect(await performBackup({ backupDir: "C:/synthetic/o'brien", dbFile: 'C:/synthetic/source.sqlite' })).toBe(true)
    expect(mocks.execute.mock.calls[1][0]).toContain("o''brien")
    expect(mocks.renameSync).toHaveBeenCalledWith(expect.stringMatching(/\.partial$/), expect.stringMatching(/\.sqlite$/))
    expect(mocks.readFileSync).not.toHaveBeenCalled()
    expect(mocks.writeFileSync).not.toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('fails without publishing, copying source or deleting prior backups when VACUUM fails', async () => {
    mocks.execute.mockRejectedValue(new Error('synthetic failure'))
    expect(await performBackup()).toBe(false)
    expect(mocks.renameSync).not.toHaveBeenCalled()
    expect(mocks.readFileSync).not.toHaveBeenCalled()
    expect(mocks.writeFileSync).not.toHaveBeenCalled()
    expect(mocks.readdirSync).not.toHaveBeenCalled()
    expect(mocks.unlinkSync).toHaveBeenCalledWith(expect.stringMatching(/parish-backup-.*\.sqlite\.partial$/))
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('does not report success if publishing the partial snapshot fails', async () => {
    mocks.renameSync.mockImplementation(() => { throw new Error('rename denied') })
    expect(await performBackup()).toBe(false)
    expect(mocks.writeFileSync).not.toHaveBeenCalled()
    expect(mocks.readdirSync).not.toHaveBeenCalled()
  })
})
