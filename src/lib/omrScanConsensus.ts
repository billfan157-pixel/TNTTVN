import type { OmrMultipleChoiceResult, OmrResult } from './omr'

export const OMR_REQUIRED_CONFIRMATIONS = 2
export const OMR_CONSENSUS_MAX_GAP_MS = 1_800

export interface OmrConsensusState {
  fingerprint: string
  confirmations: number
  lastSeenAt: number
}

export interface OmrConsensusResolution {
  state: OmrConsensusState
  confirmed: boolean
}

/** Fixed identity là luồng có giám sát: chỉ phân tích khi người dùng bấm chụp. */
export function shouldAutoAnalyzeOmrFrame(hasFixedStudentIdentity: boolean): boolean {
  return !hasFixedStudentIdentity
}

/** Fingerprint chỉ gồm dữ liệu quyết định điểm, không gồm confidence dao động. */
export function fingerprintOmrResult(result: OmrResult | OmrMultipleChoiceResult): string {
  if ('questions' in result) {
    const answers = result.questions.map(question => (
      question.isMultiFill
        ? 'MULTI'
        : question.selectedAnswer ?? 'BLANK'
    )).join(',')
    return `mc:${result.score}:${answers}`
  }
  return `score:${result.score}`
}

/**
 * Auto scanner chỉ chấp nhận khi hai frame gần nhau cho cùng một kết quả.
 * Một frame nhiễu đơn lẻ không còn đủ để chuyển sang màn hình ghi điểm.
 */
export function advanceOmrConsensus(
  previous: OmrConsensusState | null,
  result: OmrResult | OmrMultipleChoiceResult,
  now: number,
  requiredConfirmations = OMR_REQUIRED_CONFIRMATIONS,
  maxGapMs = OMR_CONSENSUS_MAX_GAP_MS,
): OmrConsensusResolution {
  const fingerprint = fingerprintOmrResult(result)
  const sameCandidate = previous
    && previous.fingerprint === fingerprint
    && now - previous.lastSeenAt <= maxGapMs
  const state: OmrConsensusState = sameCandidate
    ? { ...previous, confirmations: previous.confirmations + 1, lastSeenAt: now }
    : { fingerprint, confirmations: 1, lastSeenAt: now }

  return {
    state,
    confirmed: state.confirmations >= Math.max(1, requiredConfirmations),
  }
}
