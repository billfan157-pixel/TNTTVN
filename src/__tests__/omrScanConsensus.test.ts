import { describe, expect, it } from 'vitest'
import { advanceOmrConsensus, fingerprintOmrResult, shouldAutoAnalyzeOmrFrame } from '../lib/omrScanConsensus'
import type { OmrResult } from '../lib/omr'

const scoreResult = (score: number): OmrResult => ({
  ok: true,
  score,
  confidence: 0.4,
  cells: [],
  reason: 'OK',
})

describe('OMR temporal consensus', () => {
  it('không tự phân tích camera khi đã chọn sẵn học sinh', () => {
    expect(shouldAutoAnalyzeOmrFrame(true)).toBe(false)
    expect(shouldAutoAnalyzeOmrFrame(false)).toBe(true)
  })

  it('không xác nhận một frame OMR đơn lẻ', () => {
    const first = advanceOmrConsensus(null, scoreResult(8), 1_000)
    expect(first.confirmed).toBe(false)
    expect(first.state.confirmations).toBe(1)
  })

  it('xác nhận hai frame gần nhau có cùng kết quả', () => {
    const first = advanceOmrConsensus(null, scoreResult(8), 1_000)
    const second = advanceOmrConsensus(first.state, scoreResult(8), 1_500)
    expect(second.confirmed).toBe(true)
    expect(second.state.confirmations).toBe(2)
  })

  it('đổi điểm hoặc quá thời gian đều reset consensus', () => {
    const first = advanceOmrConsensus(null, scoreResult(8), 1_000)
    const changed = advanceOmrConsensus(first.state, scoreResult(7), 1_300)
    const stale = advanceOmrConsensus(changed.state, scoreResult(7), 4_000)
    expect(changed.confirmed).toBe(false)
    expect(changed.state.confirmations).toBe(1)
    expect(stale.confirmed).toBe(false)
    expect(stale.state.confirmations).toBe(1)
  })

  it('fingerprint không phụ thuộc confidence dao động', () => {
    const first = scoreResult(8)
    const second = { ...first, confidence: 0.2 }
    expect(fingerprintOmrResult(first)).toBe(fingerprintOmrResult(second))
  })
})
