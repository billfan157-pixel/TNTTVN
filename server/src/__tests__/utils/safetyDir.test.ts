import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, writeFileSync, readdirSync, rmSync, utimesSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * A-NEW-34 (2026-08-11): retention + permission cho safety snapshot.
 * Trước đây purge/restore ghi file JSON không giới hạn — tích lũy vô hạn trên
 * volume; test này đảm bảo pruneSafetySnapshots (ADR-041: qua blobStorage) giữ
 * N bản/parish/prefix. tryChmod600 vẫn nằm ở safetyDir.ts.
 */

const ORIGINAL_SAFETY_DIR = process.env.SAFETY_BACKUP_DIR
const TEST_DIR = join(tmpdir(), `safety-prune-test-${Date.now()}`)

async function loadModule(dir: string) {
  process.env.SAFETY_BACKUP_DIR = dir
  return await import('../../services/safetySnapshot.js')
}

beforeEach(async () => {
  mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(async () => {
  if (ORIGINAL_SAFETY_DIR === undefined) {
    delete process.env.SAFETY_BACKUP_DIR
  } else {
    process.env.SAFETY_BACKUP_DIR = ORIGINAL_SAFETY_DIR
  }
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
})

function writeSnapshot(dir: string, name: string, mtime?: string): void {
  const file = join(dir, name)
  writeFileSync(file, JSON.stringify({ data: 'x' }))
  // Ép mtime rõ ràng (CI ghi nhanh → mtime trùng ms → thứ tự "mới nhất" không xác định — flaky)
  if (mtime) utimesSync(file, new Date(mtime), new Date(mtime))
}

describe('A-NEW-34 — pruneSafetySnapshots retention', () => {
  it('giữ N=2 bản mới nhất / parish / prefix, xóa bản cũ hơn (mtime)', async () => {
    const { pruneSafetySnapshots } = await loadModule(TEST_DIR)
    // 3 bản pre-restore của parish A (cũ → mới, mtime cách nhau 1 ngày)
    writeSnapshot(TEST_DIR, 'pre-restore-safety-pa-2026-01-01T00-00-00-000Z.json', '2026-01-01T00:00:00Z')
    writeSnapshot(TEST_DIR, 'pre-restore-safety-pa-2026-01-02T00-00-00-000Z.json', '2026-01-02T00:00:00Z')
    writeSnapshot(TEST_DIR, 'pre-restore-safety-pa-2026-01-03T00-00-00-000Z.json', '2026-01-03T00:00:00Z')
    // 1 bản pre-restore của parish B (không đụng tới)
    writeSnapshot(TEST_DIR, 'pre-restore-safety-pb-2026-01-01T00-00-00-000Z.json', '2026-01-01T00:00:00Z')
    // 1 bản purge-safety parish A (prefix riêng — giữ độc lập)
    writeSnapshot(TEST_DIR, 'purge-safety-pa-2026-01-01T00-00-00-000Z.json', '2026-01-01T00:00:00Z')
    // File không phải safety (không bao giờ xóa)
    writeSnapshot(TEST_DIR, 'other-file.json')

    await pruneSafetySnapshots(2)

    const remaining = readdirSync(TEST_DIR).sort()
    expect(remaining).toEqual([
      'other-file.json',
      'pre-restore-safety-pa-2026-01-02T00-00-00-000Z.json',
      'pre-restore-safety-pa-2026-01-03T00-00-00-000Z.json',
      'pre-restore-safety-pb-2026-01-01T00-00-00-000Z.json',
      'purge-safety-pa-2026-01-01T00-00-00-000Z.json',
    ])
  })

  it('không giữ < N nếu chưa đủ bản (không xóa gì thừa)', async () => {
    const { pruneSafetySnapshots } = await loadModule(TEST_DIR)
    writeSnapshot(TEST_DIR, 'pre-restore-safety-pa-2026-01-01T00-00-00-000Z.json')

    await pruneSafetySnapshots(5)

    expect(readdirSync(TEST_DIR)).toEqual(['pre-restore-safety-pa-2026-01-01T00-00-00-000Z.json'])
  })

  it('thư mục không tồn tại → no-op (không throw)', async () => {
    const { pruneSafetySnapshots } = await loadModule(join(TEST_DIR, 'missing'))
    await expect(pruneSafetySnapshots(5)).resolves.not.toThrow()
  })

  it('tên file không khớp regex timestamp chuẩn → KHÔNG bị xóa nhầm', async () => {
    const { pruneSafetySnapshots } = await loadModule(TEST_DIR)
    writeSnapshot(TEST_DIR, 'pre-restore-safety-pa-2026-01-01.json') // thiếu millis
    writeSnapshot(TEST_DIR, 'pre-restore-safety-pa.txt')

    await pruneSafetySnapshots(1)

    expect(readdirSync(TEST_DIR).sort()).toEqual([
      'pre-restore-safety-pa-2026-01-01.json',
      'pre-restore-safety-pa.txt',
    ])
  })
})

describe('A-NEW-34 — tryChmod600', () => {
  it('không throw trên mọi FS (no-op an toàn)', async () => {
    const { tryChmod600 } = await import('../../utils/safetyDir.js')
    const f = join(TEST_DIR, 'snap.json')
    writeSnapshot(TEST_DIR, 'snap.json')
    expect(() => tryChmod600(f)).not.toThrow()
    expect(existsSync(f)).toBe(true)
  })
})
