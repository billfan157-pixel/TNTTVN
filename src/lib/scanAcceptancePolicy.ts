import type { OmrMultipleChoiceResult, OmrResult } from './omr'
import type { ScanQualityAssessment } from './scanQuality'

export type ScanAcceptanceDecision =
  | { status: 'accepted'; reason: 'OK' }
  | { status: 'review_required'; reason: 'OMR_REVIEW_REQUIRED' | 'QUALITY_REVIEW_REQUIRED' }
  | { status: 'rejected'; reason: 'OMR_REJECTED' | 'QUALITY_REJECTED' }

/**
 * Một SSOT cho live scan + batch scan.
 *
 * - OMR rejected luôn fail-closed.
 * - quality=bad luôn fail-closed, kể cả OMR đồng thời có câu cần review.
 * - OMR review_required cần người chấm xử lý khi ảnh vẫn đủ chất lượng.
 * - quality=review được route review thay vì silently accept.
 */
export function decideScanAcceptance(
  omr: OmrResult | OmrMultipleChoiceResult,
  quality: ScanQualityAssessment,
): ScanAcceptanceDecision {
  if (!omr.ok || omr.score === null) return { status: 'rejected', reason: 'OMR_REJECTED' }
  if (quality.status === 'bad') return { status: 'rejected', reason: 'QUALITY_REJECTED' }
  if ('status' in omr && omr.status === 'review_required') {
    return { status: 'review_required', reason: 'OMR_REVIEW_REQUIRED' }
  }
  if (quality.status === 'review') return { status: 'review_required', reason: 'QUALITY_REVIEW_REQUIRED' }
  return { status: 'accepted', reason: 'OK' }
}
