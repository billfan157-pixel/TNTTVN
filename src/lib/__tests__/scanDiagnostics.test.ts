import { describe, expect, it } from 'vitest'
import { readScanDiagnostics, recordScanDiagnostic } from '../scanDiagnostics'

describe('privacy-safe scan diagnostics', () => {
  it('chỉ cộng counter/timing, không cần ảnh hay định danh', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }
    recordScanDiagnostic({
      outcome: 'review_required',
      reason: 'MULTIPLE_MARKS',
      templateMode: 'integrated',
      qualityStatus: 'review',
      durationMs: 123.4,
    }, storage)
    const result = readScanDiagnostics(storage)
    expect(result.total).toBe(1)
    expect(result.reasons.MULTIPLE_MARKS).toBe(1)
    expect(result.durationTotalMs).toBe(123)
    expect(result.durationBuckets.lte150).toBe(1)
    expect(JSON.stringify(result)).not.toMatch(/student|session|image|base64/i)
  })

  it('migrate counter v1 mà không bịa histogram lịch sử', () => {
    const legacy = {
      version: 1,
      total: 2,
      outcomes: { accepted: 2 },
      reasons: { OK: 2 },
      templates: { integrated: 2 },
      quality: { good: 2 },
      durationTotalMs: 180,
      durationSamples: 2,
      updatedAt: '2026-08-01T00:00:00.000Z',
    }
    const storage = {
      getItem: (key: string) => key.endsWith('.v1') ? JSON.stringify(legacy) : null,
    }
    const result = readScanDiagnostics(storage)
    expect(result.version).toBe(2)
    expect(result.total).toBe(2)
    expect(Object.values(result.durationBuckets).reduce((sum, count) => sum + count, 0)).toBe(0)
  })
})
