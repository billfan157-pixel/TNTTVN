import { describe, expect, it } from 'vitest'
import { decideScanAcceptance } from '../scanAcceptancePolicy'
import type { OmrMultipleChoiceResult } from '../omr'
import type { ScanQualityAssessment } from '../scanQuality'

function omr(status: OmrMultipleChoiceResult['status']): OmrMultipleChoiceResult {
  return {
    ok: status !== 'rejected',
    status,
    score: status === 'rejected' ? null : 8,
    rawCorrectCount: 8,
    totalQuestions: 10,
    confidence: 0.4,
    questions: [],
    reason: status === 'accepted' ? 'OK' : status === 'review_required' ? 'REVIEW_REQUIRED' : 'LOW_CONFIDENCE',
  }
}

function quality(status: ScanQualityAssessment['status']): ScanQualityAssessment {
  return {
    status,
    meanLuma: 180,
    highlightRatio: 0,
    shadowRatio: 0,
    edgeEnergy: 8,
    reasons: status === 'good' ? [] : status === 'review' ? ['GLARE'] : ['LOW_DETAIL'],
  }
}

describe('scan acceptance policy', () => {
  it('accepts only accepted OMR + good quality', () => {
    expect(decideScanAcceptance(omr('accepted'), quality('good'))).toEqual({ status: 'accepted', reason: 'OK' })
  })

  it('routes accepted OMR with review quality to review', () => {
    expect(decideScanAcceptance(omr('accepted'), quality('review'))).toEqual({
      status: 'review_required',
      reason: 'QUALITY_REVIEW_REQUIRED',
    })
  })

  it('rejects accepted OMR when image quality is bad', () => {
    expect(decideScanAcceptance(omr('accepted'), quality('bad'))).toEqual({
      status: 'rejected',
      reason: 'QUALITY_REJECTED',
    })
  })

  it('never lets good quality override OMR review/reject', () => {
    expect(decideScanAcceptance(omr('review_required'), quality('good')).status).toBe('review_required')
    expect(decideScanAcceptance(omr('rejected'), quality('good')).status).toBe('rejected')
  })
})
