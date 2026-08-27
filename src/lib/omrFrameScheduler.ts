import type { ExamCodeScanMode } from './examCodeScanner'

export const OMR_FAST_FRAME_WIDTH = 960
export const OMR_VERIFICATION_FRAME_WIDTH = 1280
export const OMR_BASE_SCAN_INTERVAL_MS = 280
export const OMR_CONFIRMATION_SCAN_INTERVAL_MS = 220
export const OMR_MAX_SCAN_INTERVAL_MS = 650
export const QR_LIVE_RECOVERY_EVERY_ATTEMPTS = 4

export interface OmrFrameScheduleInput {
  sourceWidth: number
  hasIdentity: boolean
  fixedStudent: boolean
  codeRecheckDue: boolean
  consensusConfirmations: number
}

/**
 * Hai tầng phân giải: frame đầu của OMR dùng 960px để bắt candidate nhanh;
 * frame xác nhận cuối và mọi lần đọc QR dùng 1280px. Vì vậy kết quả auto-accept
 * luôn được đối chiếu lại ở độ phân giải production, không hạ gate an toàn.
 */
export function selectOmrFrameWidth(input: OmrFrameScheduleInput): number {
  const needsVerificationFrame = input.fixedStudent
    || !input.hasIdentity
    || input.codeRecheckDue
    || input.consensusConfirmations > 0
  const ceiling = needsVerificationFrame ? OMR_VERIFICATION_FRAME_WIDTH : OMR_FAST_FRAME_WIDTH
  return Math.max(1, Math.min(Math.round(input.sourceWidth), ceiling))
}

/**
 * Backpressure cho pipeline đồng bộ: frame candidate được xác nhận sớm hơn,
 * còn thiết bị chậm tự giãn nhịp để không chiếm liên tục main thread.
 */
export function getOmrScanIntervalMs(lastDurationMs: number, hasCandidate: boolean): number {
  const floor = hasCandidate ? OMR_CONFIRMATION_SCAN_INTERVAL_MS : OMR_BASE_SCAN_INTERVAL_MS
  const workloadDelay = Number.isFinite(lastDurationMs) ? Math.max(0, lastDurationMs) * 1.35 : floor
  return Math.min(OMR_MAX_SCAN_INTERVAL_MS, Math.max(floor, Math.round(workloadDelay)))
}

/** Neo nhịp kế tiếp vào lúc phân tích đã hoàn tất để lượt chậm không chạy dồn. */
export function getNextOmrScanAt(completedAtMs: number, lastDurationMs: number, hasCandidate: boolean): number {
  const safeCompletedAt = Number.isFinite(completedAtMs) ? Math.max(0, completedAtMs) : 0
  return safeCompletedAt + getOmrScanIntervalMs(lastDurationMs, hasCandidate)
}

/**
 * Mỗi lượt đọc mã thứ tư dùng đúng một crop recovery 2x. Counter độc lập với
 * identity lock nên recheck 1,2 giây cũng định kỳ được recovery, thay vì mãi chỉ
 * chạy fast-path rồi có thể giữ nhầm tờ cũ tới hết TTL.
 */
export function selectExamCodeScanMode(explicitCapture: boolean, attemptIndex: number): ExamCodeScanMode {
  if (explicitCapture) return 'exhaustive'
  const safeAttemptIndex = Number.isFinite(attemptIndex) ? Math.max(0, Math.trunc(attemptIndex)) : 0
  return (safeAttemptIndex + 1) % QR_LIVE_RECOVERY_EVERY_ATTEMPTS === 0
    ? 'live_recovery'
    : 'live_fast'
}
