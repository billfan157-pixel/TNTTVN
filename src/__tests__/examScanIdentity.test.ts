import { describe, expect, it } from 'vitest'
import { createManualExamIdentity, resolveExamIdentity } from '../lib/examScanIdentity'
import type { ExamCodeScanResult } from '../lib/examCodeScanner'

const validCode: ExamCodeScanResult = {
  rawText: 'TE:12345678:ABCDEF12',
  payload: { sessionId: 'EXS-12345678', studentId: 'ST-abcdef12' },
  source: 'qr',
}

describe('exam scan identity lock', () => {
  it('giữ mã đã đọc để OMR có thể thành công ở frame kế tiếp không còn QR', () => {
    const first = resolveExamIdentity(null, validCode, 'EXS-12345678', 1_000)
    expect(first.kind).toBe('acquired')
    expect(first.lock?.studentId).toBe('ST-abcdef12')

    const second = resolveExamIdentity(first.lock, null, 'EXS-12345678', 1_350)
    expect(second.kind).toBe('retained')
    expect(second.lock?.studentId).toBe('ST-abcdef12')
  })

  it('giữ mã mặc định 20 giây để đủ thời gian chuyển từ cận cảnh QR sang toàn tờ A4', () => {
    const first = resolveExamIdentity(null, validCode, 'EXS-12345678', 1_000)
    const retained = resolveExamIdentity(first.lock, null, 'EXS-12345678', 20_999)
    const expired = resolveExamIdentity(first.lock, null, 'EXS-12345678', 21_001)
    expect(retained.kind).toBe('retained')
    expect(expired).toEqual({ kind: 'missing', lock: null })
  })

  it('hết hạn khóa để không gán nhầm tờ giấy tiếp theo', () => {
    const first = resolveExamIdentity(null, validCode, 'EXS-12345678', 1_000, 2_000)
    const expired = resolveExamIdentity(first.lock, null, 'EXS-12345678', 3_001, 2_000)
    expect(expired).toEqual({ kind: 'missing', lock: null })
  })

  it('từ chối ngay mã của phiên chấm khác', () => {
    const result = resolveExamIdentity(null, validCode, 'EXS-other', 1_000)
    expect(result).toEqual({
      kind: 'wrong_session',
      lock: null,
      scannedSessionId: 'EXS-12345678',
    })
  })

  it('giữ danh tính được chọn thủ công để quét OMR mà không cần QR', () => {
    const manual = createManualExamIdentity('EXS-12345678', 'ST-abcdef12')
    const result = resolveExamIdentity(manual, null, 'EXS-12345678', 99_999_999)
    expect(result.kind).toBe('retained')
    expect(result.lock).toMatchObject({ studentId: 'ST-abcdef12', source: 'manual' })
  })
})
