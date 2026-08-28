import { fingerprintOmrResult } from './omrScanConsensus'
import type { OmrMultipleChoiceResult, OmrResult } from './omr'

export const CONTINUOUS_REARM_MIN_MISSING_OBSERVATIONS = 3
export const CONTINUOUS_REARM_MIN_MISSING_MS = 900
export const EXISTING_RESULT_FINGERPRINT = '__existing_result__'

export interface ContinuousRearmState {
  studentId: string
  attemptFingerprint: string
  missingObservations: number
  missingSince: number | null
}

export interface ContinuousRearmResolution {
  state: ContinuousRearmState | null
  rearmed: boolean
  reason: 'same_sheet' | 'new_identity' | 'sheet_absent' | 'waiting_absence'
}

export type ContinuousAttemptDecision =
  | { kind: 'new' }
  | { kind: 'duplicate' }
  | { kind: 'conflict'; previousFingerprint: string }

export function isContinuousScanV2Enabled(
  configured = import.meta.env.VITE_CONTINUOUS_SCAN_V2,
): boolean {
  const normalized = String(configured ?? 'true').trim().toLowerCase()
  return normalized !== 'false' && normalized !== '0' && normalized !== 'off'
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function createContinuousAttemptFingerprint(input: {
  sessionId: string
  studentId: string
  examVersion: string
  templateMode: string
  omr: OmrResult | OmrMultipleChoiceResult
}): string {
  return `omr-cont-v1:${fnv1a([
    input.sessionId,
    input.studentId,
    input.examVersion,
    input.templateMode,
    fingerprintOmrResult(input.omr),
  ].join('|'))}`
}

export function classifyContinuousAttempt(
  previousByStudent: ReadonlyMap<string, string>,
  studentId: string,
  attemptFingerprint: string,
): ContinuousAttemptDecision {
  const previous = previousByStudent.get(studentId)
  if (!previous) return { kind: 'new' }
  if (previous === attemptFingerprint) return { kind: 'duplicate' }
  return { kind: 'conflict', previousFingerprint: previous }
}

export function beginContinuousRearm(studentId: string, attemptFingerprint: string): ContinuousRearmState {
  return { studentId, attemptFingerprint, missingObservations: 0, missingSince: null }
}

/**
 * Re-arm only after a distinct identity or sustained QR absence. Absence alone
 * is not a dedupe guarantee: classifyContinuousAttempt remains the second guard
 * if the same sheet is presented again after re-arm.
 */
export function advanceContinuousRearm(
  state: ContinuousRearmState,
  observedStudentId: string | null,
  now: number,
  minMissingObservations = CONTINUOUS_REARM_MIN_MISSING_OBSERVATIONS,
  minMissingMs = CONTINUOUS_REARM_MIN_MISSING_MS,
): ContinuousRearmResolution {
  if (observedStudentId && observedStudentId !== state.studentId) {
    return { state: null, rearmed: true, reason: 'new_identity' }
  }
  if (observedStudentId === state.studentId) {
    return {
      state: { ...state, missingObservations: 0, missingSince: null },
      rearmed: false,
      reason: 'same_sheet',
    }
  }

  const missingSince = state.missingSince ?? now
  const next: ContinuousRearmState = {
    ...state,
    missingSince,
    missingObservations: state.missingObservations + 1,
  }
  if (
    next.missingObservations >= Math.max(1, minMissingObservations)
    && now - missingSince >= Math.max(0, minMissingMs)
  ) {
    return { state: null, rearmed: true, reason: 'sheet_absent' }
  }
  return { state: next, rearmed: false, reason: 'waiting_absence' }
}
