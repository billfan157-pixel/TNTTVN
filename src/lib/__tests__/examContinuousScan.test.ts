import { describe, expect, it } from 'vitest'
import {
  EXISTING_RESULT_FINGERPRINT,
  advanceContinuousRearm,
  beginContinuousRearm,
  classifyContinuousAttempt,
  createContinuousAttemptFingerprint,
  isContinuousScanV2Enabled,
} from '../examContinuousScan'

const omr = {
  ok: true,
  status: 'accepted',
  reason: 'OK',
  score: 8,
  confidence: 0.9,
  rawCorrectCount: 2,
  questions: [
    { questionIndex: 1, selectedAnswer: 'A', isMultiFill: false },
    { questionIndex: 2, selectedAnswer: 'B', isMultiFill: false },
  ],
} as any

describe('examContinuousScan', () => {
  it('feature flag mặc định bật và có rollback false/off/0', () => {
    expect(isContinuousScanV2Enabled(undefined)).toBe(true)
    expect(isContinuousScanV2Enabled('false')).toBe(false)
    expect(isContinuousScanV2Enabled('off')).toBe(false)
    expect(isContinuousScanV2Enabled('0')).toBe(false)
  })

  it('fingerprint ổn định theo identity/template/version/answers', () => {
    const input = { sessionId: 'EXS-1', studentId: 'ST-1', examVersion: 'A', templateMode: 'integrated', omr }
    expect(createContinuousAttemptFingerprint(input)).toBe(createContinuousAttemptFingerprint(input))
    expect(createContinuousAttemptFingerprint({ ...input, studentId: 'ST-2' })).not.toBe(createContinuousAttemptFingerprint(input))
  })

  it('phân biệt new, duplicate và conflict kể cả result đã tồn tại', () => {
    const seen = new Map([['ST-1', 'FP-1'], ['ST-2', EXISTING_RESULT_FINGERPRINT]])
    expect(classifyContinuousAttempt(seen, 'ST-3', 'FP-3')).toEqual({ kind: 'new' })
    expect(classifyContinuousAttempt(seen, 'ST-1', 'FP-1')).toEqual({ kind: 'duplicate' })
    expect(classifyContinuousAttempt(seen, 'ST-1', 'FP-NEW').kind).toBe('conflict')
    expect(classifyContinuousAttempt(seen, 'ST-2', 'FP-2').kind).toBe('conflict')
  })

  it('không re-arm khi cùng identity còn trong khung', () => {
    const initial = beginContinuousRearm('ST-1', 'FP-1')
    const next = advanceContinuousRearm(initial, 'ST-1', 1_000, 2, 500)
    expect(next).toMatchObject({ rearmed: false, reason: 'same_sheet' })
    expect(next.state?.missingObservations).toBe(0)
  })

  it('re-arm ngay khi identity mới ổn định', () => {
    const next = advanceContinuousRearm(beginContinuousRearm('ST-1', 'FP-1'), 'ST-2', 1_000)
    expect(next).toEqual({ state: null, rearmed: true, reason: 'new_identity' })
  })

  it('chỉ re-arm sau cả số observation và thời gian vắng tối thiểu', () => {
    let state = beginContinuousRearm('ST-1', 'FP-1')
    let result = advanceContinuousRearm(state, null, 1_000, 3, 900)
    state = result.state!
    result = advanceContinuousRearm(state, null, 1_500, 3, 900)
    state = result.state!
    expect(result.rearmed).toBe(false)
    result = advanceContinuousRearm(state, null, 1_900, 3, 900)
    expect(result).toEqual({ state: null, rearmed: true, reason: 'sheet_absent' })
  })
})
