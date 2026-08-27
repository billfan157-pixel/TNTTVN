import { describe, expect, it } from 'vitest'
import {
  getOmrScanIntervalMs,
  getNextOmrScanAt,
  OMR_CONFIRMATION_SCAN_INTERVAL_MS,
  OMR_FAST_FRAME_WIDTH,
  OMR_MAX_SCAN_INTERVAL_MS,
  OMR_VERIFICATION_FRAME_WIDTH,
  QR_LIVE_RECOVERY_EVERY_ATTEMPTS,
  selectExamCodeScanMode,
  selectOmrFrameWidth,
} from '../omrFrameScheduler'

describe('OMR frame scheduler', () => {
  it('giữ độ phân giải QR trước identity và khi đến nhịp recheck', () => {
    expect(selectOmrFrameWidth({ sourceWidth: 1920, hasIdentity: false, fixedStudent: false, codeRecheckDue: true, consensusConfirmations: 0 }))
      .toBe(OMR_VERIFICATION_FRAME_WIDTH)
    expect(selectOmrFrameWidth({ sourceWidth: 1920, hasIdentity: true, fixedStudent: false, codeRecheckDue: true, consensusConfirmations: 0 }))
      .toBe(OMR_VERIFICATION_FRAME_WIDTH)
  })

  it('dùng frame nhanh cho candidate đầu rồi frame production để xác nhận', () => {
    expect(selectOmrFrameWidth({ sourceWidth: 1920, hasIdentity: true, fixedStudent: false, codeRecheckDue: false, consensusConfirmations: 0 }))
      .toBe(OMR_FAST_FRAME_WIDTH)
    expect(selectOmrFrameWidth({ sourceWidth: 1920, hasIdentity: true, fixedStudent: false, codeRecheckDue: false, consensusConfirmations: 1 }))
      .toBe(OMR_VERIFICATION_FRAME_WIDTH)
  })

  it('không upscale source nhỏ và giữ manual capture ở frame xác nhận', () => {
    expect(selectOmrFrameWidth({ sourceWidth: 720, hasIdentity: true, fixedStudent: false, codeRecheckDue: false, consensusConfirmations: 0 })).toBe(720)
    expect(selectOmrFrameWidth({ sourceWidth: 1920, hasIdentity: true, fixedStudent: true, codeRecheckDue: false, consensusConfirmations: 0 }))
      .toBe(OMR_VERIFICATION_FRAME_WIDTH)
  })

  it('rút nhịp xác nhận nhưng tự tạo backpressure trên thiết bị chậm', () => {
    expect(getOmrScanIntervalMs(12, true)).toBe(OMR_CONFIRMATION_SCAN_INTERVAL_MS)
    expect(getOmrScanIntervalMs(300, false)).toBe(405)
    expect(getOmrScanIntervalMs(2_000, true)).toBe(OMR_MAX_SCAN_INTERVAL_MS)
    expect(getNextOmrScanAt(2_000, 2_000, true)).toBe(2_000 + OMR_MAX_SCAN_INTERVAL_MS)
  })

  it('xen một recovery sau ba fast attempt kể cả khi counter tiếp tục qua identity recheck', () => {
    expect(Array.from({ length: 8 }, (_, index) => selectExamCodeScanMode(false, index))).toEqual([
      'live_fast',
      'live_fast',
      'live_fast',
      'live_recovery',
      'live_fast',
      'live_fast',
      'live_fast',
      'live_recovery',
    ])
    expect(QR_LIVE_RECOVERY_EVERY_ATTEMPTS).toBe(4)
    expect(selectExamCodeScanMode(true, 0)).toBe('exhaustive')
    expect(selectExamCodeScanMode(false, Number.NaN)).toBe('live_fast')
  })
})
