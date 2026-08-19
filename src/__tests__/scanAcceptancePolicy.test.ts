import { describe, expect, it } from 'vitest'
import { decideScanAcceptance } from '../lib/scanAcceptancePolicy'
import type { OmrMultipleChoiceResult } from '../lib/omr'
import type { ScanQualityAssessment, ScanQualityStatus } from '../lib/scanQuality'

function quality(status: ScanQualityStatus): ScanQualityAssessment {
  return {
    status,
    meanLuma: status === 'bad' ? 10 : 180,
    highlightRatio: 0,
    shadowRatio: status === 'bad' ? 0.9 : 0,
    edgeEnergy: status === 'bad' ? 0.5 : 8,
    reasons: status === 'bad' ? ['TOO_DARK'] : status === 'review' ? ['GLARE'] : [],
  }
}

function omr(status: OmrMultipleChoiceResult['status']): OmrMultipleChoiceResult {
  return {
    ok: status !== 'rejected',
    status,
    score: status === 'rejected' ? null : 8,
    rawCorrectCount: 8,
    totalQuestions: 10,
    confidence: 0.2,
    questions: [],
    reason: status === 'review_required' ? 'REVIEW_REQUIRED' : status === 'rejected' ? 'ALL_BLANK' : 'OK',
  }
}

describe('shared scan acceptance policy', () => {
  it('accepts only a valid OMR on a good image', () => {
    expect(decideScanAcceptance(omr('accepted'), quality('good'))).toEqual({ status: 'accepted', reason: 'OK' })
  })

  it('routes usable-but-imperfect image quality to manual review', () => {
    expect(decideScanAcceptance(omr('accepted'), quality('review'))).toEqual({
      status: 'review_required',
      reason: 'QUALITY_REVIEW_REQUIRED',
    })
  })

  it('routes ambiguous OMR to review when image quality remains usable', () => {
    expect(decideScanAcceptance(omr('review_required'), quality('good'))).toEqual({
      status: 'review_required',
      reason: 'OMR_REVIEW_REQUIRED',
    })
  })

  it('bad image quality fails closed even when OMR also requests review', () => {
    expect(decideScanAcceptance(omr('review_required'), quality('bad'))).toEqual({
      status: 'rejected',
      reason: 'QUALITY_REJECTED',
    })
  })

  it('rejected OMR always fails closed', () => {
    expect(decideScanAcceptance(omr('rejected'), quality('good'))).toEqual({
      status: 'rejected',
      reason: 'OMR_REJECTED',
    })
  })
})
