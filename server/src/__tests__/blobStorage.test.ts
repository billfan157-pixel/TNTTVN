import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  putObject,
  getObject,
  listObjects,
  deleteObject,
  isR2Enabled,
} from '../services/blobStorage.js'
import { getDbConfig } from '../db/dbConfig.js'

const SAFETY_DIR = join(tmpdir(), `blob-safety-${Date.now()}`)
const BACKUP_DIR = join(tmpdir(), `blob-backups-${Date.now()}`)

describe('blobStorage (ADR-041) — local fallback', () => {
  beforeEach(() => {
    process.env.SAFETY_BACKUP_DIR = SAFETY_DIR
    process.env.BACKUP_DIR = BACKUP_DIR
    fs.mkdirSync(SAFETY_DIR, { recursive: true })
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  })

  afterEach(() => {
    delete process.env.SAFETY_BACKUP_DIR
    delete process.env.BACKUP_DIR
    for (const d of [SAFETY_DIR, BACKUP_DIR]) {
      if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true })
    }
  })

  it('R2 chưa cấu hình → dùng local fallback', () => {
    expect(isR2Enabled).toBe(false)
  })

  it('put/get/delete roundtrip với prefix safety/ (map đúng thư mục)', async () => {
    const key = 'safety/pre-restore-safety-pa-2026-01-01T00-00-00-000Z.json'
    await putObject(key, '{"ok":true}', 'application/json')

    // file thực tế nằm trong SAFETY_DIR (không phải BLOB_LOCAL_DIR)
    expect(fs.existsSync(join(SAFETY_DIR, 'pre-restore-safety-pa-2026-01-01T00-00-00-000Z.json'))).toBe(true)

    const got = await getObject(key)
    expect(got?.toString()).toBe('{"ok":true}')

    const listed = await listObjects('safety/')
    expect(listed.map((o) => o.key)).toContain(key)

    await deleteObject(key)
    expect(await getObject(key)).toBeNull()
  })

  it('prefix backups/ map vào BACKUP_DIR', async () => {
    const key = 'backups/parish-backup-x.sqlite'
    await putObject(key, Buffer.from('sqlite-bytes'), 'application/x-sqlite3')
    expect(fs.existsSync(join(BACKUP_DIR, 'parish-backup-x.sqlite'))).toBe(true)
    const listed = await listObjects('backups/')
    expect(listed.map((o) => o.key)).toContain(key)
  })
})

describe('getDbConfig (ADR-041) — Turso detection', () => {
  const ORIG_TURSO_URL = process.env.TURSO_URL
  const ORIG_TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN

  afterEach(() => {
    if (ORIG_TURSO_URL === undefined) delete process.env.TURSO_URL
    else process.env.TURSO_URL = ORIG_TURSO_URL
    if (ORIG_TURSO_TOKEN === undefined) delete process.env.TURSO_AUTH_TOKEN
    else process.env.TURSO_AUTH_TOKEN = ORIG_TURSO_TOKEN
  })

  it('mặc định → SQLite local (isRemote=false)', () => {
    delete process.env.TURSO_URL
    const cfg = getDbConfig()
    expect(cfg.isRemote).toBe(false)
    expect(cfg.url.startsWith('file:')).toBe(true)
    expect(cfg.dbPath).toBeDefined()
  })

  it('set TURSO_URL → remote (isRemote=true) + authToken', () => {
    process.env.TURSO_URL = 'libsql://abc.turso.io'
    process.env.TURSO_AUTH_TOKEN = 'secret-token'
    const cfg = getDbConfig()
    expect(cfg.isRemote).toBe(true)
    expect(cfg.url).toBe('libsql://abc.turso.io')
    expect(cfg.authToken).toBe('secret-token')
  })
})
