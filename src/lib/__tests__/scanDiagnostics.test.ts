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
    expect(JSON.stringify(result)).not.toMatch(/student|session|image|base64/i)
  })
})
