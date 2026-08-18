import { beforeEach, describe, expect, it, vi } from 'vitest'

const values = new Map<string, string>()
vi.mock('../db', () => ({
  dexieStorage: {
    getItem: vi.fn(async (name: string) => values.get(name) ?? null),
    setItem: vi.fn(async (name: string, value: string) => { values.set(name, value) }),
    removeItem: vi.fn(async (name: string) => { values.delete(name) }),
  },
}))

import { deleteScanReviewSnapshot, loadScanReviewSnapshot, purgeExpiredScanReviewSnapshots } from '../scanReviewStorage'

describe('scan review storage retention', () => {
  beforeEach(() => values.clear())

  it('không trả ảnh hết hạn và xóa cả registry', async () => {
    values.set('exam_scan_review_v1:EXS-1:ST-1', JSON.stringify({ sessionId: 'EXS-1', studentId: 'ST-1', createdAt: '2026-01-01T00:00:00Z', expiresAt: '2026-01-02T00:00:00Z', dataUrl: 'data:image/jpeg;base64,AA' }))
    values.set('exam_scan_review_v1:registry', JSON.stringify([{ sessionId: 'EXS-1', studentId: 'ST-1', expiresAt: '2026-01-02T00:00:00Z' }]))
    expect(await loadScanReviewSnapshot('EXS-1', 'ST-1')).toBeNull()
    expect(values.has('exam_scan_review_v1:EXS-1:ST-1')).toBe(false)
    expect(JSON.parse(values.get('exam_scan_review_v1:registry')!)).toEqual([])
  })

  it('purge chỉ xóa ảnh hết hạn, giữ ảnh còn hạn', async () => {
    values.set('exam_scan_review_v1:EXS-old:ST-1', 'old')
    values.set('exam_scan_review_v1:EXS-new:ST-2', 'new')
    values.set('exam_scan_review_v1:registry', JSON.stringify([
      { sessionId: 'EXS-old', studentId: 'ST-1', expiresAt: '2026-01-01T00:00:00Z' },
      { sessionId: 'EXS-new', studentId: 'ST-2', expiresAt: '2027-01-01T00:00:00Z' },
    ]))
    expect(await purgeExpiredScanReviewSnapshots(Date.parse('2026-06-01T00:00:00Z'))).toBe(1)
    expect(values.has('exam_scan_review_v1:EXS-old:ST-1')).toBe(false)
    expect(values.get('exam_scan_review_v1:EXS-new:ST-2')).toBe('new')
  })

  it('xóa thủ công xóa snapshot và registry entry', async () => {
    values.set('exam_scan_review_v1:EXS-1:ST-1', 'image')
    values.set('exam_scan_review_v1:registry', JSON.stringify([{ sessionId: 'EXS-1', studentId: 'ST-1', expiresAt: '2027-01-01T00:00:00Z' }]))
    await deleteScanReviewSnapshot('EXS-1', 'ST-1')
    expect(values.has('exam_scan_review_v1:EXS-1:ST-1')).toBe(false)
    expect(JSON.parse(values.get('exam_scan_review_v1:registry')!)).toEqual([])
  })
})
