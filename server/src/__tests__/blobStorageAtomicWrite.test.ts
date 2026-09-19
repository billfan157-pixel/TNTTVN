import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { putObject, getObject, listObjects } from '../services/blobStorage.js'

const TEST_BLOB_DIR = path.join(process.cwd(), 'blobs-test-atomic')

describe('local blob storage atomic publish (DR-P2-002)', () => {
  beforeEach(() => {
    process.env.BLOB_LOCAL_DIR = TEST_BLOB_DIR
    if (fs.existsSync(TEST_BLOB_DIR)) {
      fs.rmSync(TEST_BLOB_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
    fs.mkdirSync(TEST_BLOB_DIR, { recursive: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (fs.existsSync(TEST_BLOB_DIR)) {
      fs.rmSync(TEST_BLOB_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })

  it('stores and reads back an object through the local backend', async () => {
    await putObject('probe/object.bin', 'content-v1')
    expect((await getObject('probe/object.bin'))?.toString()).toBe('content-v1')
  })

  it('keeps the previous object intact and leaves no temp residue when a write fails', async () => {
    await putObject('probe/object.bin', 'content-v1')

    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('injected disk-full failure')
    })
    await expect(putObject('probe/object.bin', 'content-v2')).rejects.toThrow('injected disk-full failure')
    writeSpy.mockRestore()

    expect((await getObject('probe/object.bin'))?.toString()).toBe('content-v1')
    const residue = fs.readdirSync(path.join(TEST_BLOB_DIR, 'probe')).filter((name) => name.includes('.tmp-'))
    expect(residue).toEqual([])
  })

  it('overwrites an existing object with the new content on a successful write', async () => {
    await putObject('probe/object.bin', 'content-v1')
    await putObject('probe/object.bin', 'content-v2')
    expect((await getObject('probe/object.bin'))?.toString()).toBe('content-v2')
  })

  it('never publishes partial bytes if a write fails after writing a prefix', async () => {
    await putObject('probe/object.bin', 'original-complete-object')
    const write = fs.writeFileSync.bind(fs)
    const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation((file, _data, options) => {
      write(file, 'BAD', options)
      throw new Error('Synthetic interrupted write')
    })
    await expect(putObject('probe/object.bin', 'replacement')).rejects.toThrow('Synthetic interrupted write')
    spy.mockRestore()
    expect((await getObject('probe/object.bin'))?.toString()).toBe('original-complete-object')
    expect(fs.readdirSync(path.join(TEST_BLOB_DIR, 'probe'))).toEqual(['object.bin'])
  })

  it('keeps incomplete objects out of backup listing/retention after an interrupted process', async () => {
    vi.stubEnv('BACKUP_DIR', TEST_BLOB_DIR)
    try {
      fs.writeFileSync(path.join(TEST_BLOB_DIR, 'complete.sqlite'), 'complete')
      fs.writeFileSync(path.join(TEST_BLOB_DIR, 'incomplete.sqlite.tmp-probe'), 'partial')
      fs.writeFileSync(path.join(TEST_BLOB_DIR, 'incomplete.sqlite.partial-probe'), 'partial')
      expect((await listObjects('backups/')).map(object => object.key)).toEqual(['backups/complete.sqlite'])
    } finally { vi.unstubAllEnvs() }
  })

  it('preserves the previous object if publication rename fails', async () => {
    await putObject('probe/object.bin', 'original')
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('Synthetic rename failure') })
    await expect(putObject('probe/object.bin', 'replacement')).rejects.toThrow('Synthetic rename failure')
    rename.mockRestore()
    expect((await getObject('probe/object.bin'))?.toString()).toBe('original')
    expect(fs.readdirSync(path.join(TEST_BLOB_DIR, 'probe'))).toEqual(['object.bin'])
  })
})
