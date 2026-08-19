import type { ExamCodeScanResult } from './examCodeScanner'
import type { ExamFormTemplateMode, ExamVersionCode } from './qr'

/**
 * Đủ thời gian để đưa QR lại gần camera rồi lùi ra căn khung OMR, nhưng ngắn
 * hơn đáng kể so với 20s cũ để giảm cửa sổ gán đáp án của tờ kế tiếp vào học sinh trước.
 */
export const EXAM_CODE_LOCK_TTL_MS = 8_000

/**
 * Khi camera đang giữ một identity QR, vẫn đọc lại mã theo nhịp nhẹ để phát hiện
 * người chấm đã đổi sang tờ khác trước khi TTL cũ hết hạn. Không áp dụng cho
 * identity do giáo lý viên chọn thủ công.
 */
export const EXAM_CODE_RECHECK_INTERVAL_MS = 1_200

export interface ExamCodeLock {
  sessionId: string
  studentId: string
  source: 'qr' | 'barcode' | 'manual'
  expiresAt: number
  protocolVersion?: 2 | 3
  templateMode?: ExamFormTemplateMode
  questionCount?: number
  examVersion?: ExamVersionCode
  formChecksum?: string
}

export type ExamIdentityResolution =
  | { kind: 'missing'; lock: null }
  | { kind: 'wrong_session'; lock: null; scannedSessionId: string }
  | { kind: 'acquired' | 'retained'; lock: ExamCodeLock }

/** Danh tính do giáo lý viên chọn rõ ràng từ danh sách lớp, không cần QR. */
export function createManualExamIdentity(sessionId: string, studentId: string): ExamCodeLock {
  return {
    sessionId,
    studentId,
    source: 'manual',
    expiresAt: Number.POSITIVE_INFINITY,
  }
}

/**
 * Chỉ so sánh phần identity/protocol của tờ giấy; `expiresAt` thay đổi mỗi lần
 * QR được refresh nên không được dùng để quyết định đổi tờ.
 */
export function isSameExamIdentity(left: ExamCodeLock | null, right: ExamCodeLock | null): boolean {
  if (!left || !right) return left === right
  return left.sessionId === right.sessionId
    && left.studentId === right.studentId
    && left.source === right.source
    && left.protocolVersion === right.protocolVersion
    && left.templateMode === right.templateMode
    && left.questionCount === right.questionCount
    && left.examVersion === right.examVersion
    && left.formChecksum === right.formChecksum
}

export function shouldRecheckExamCode(
  lock: ExamCodeLock | null,
  lastCheckedAt: number,
  now: number,
  intervalMs = EXAM_CODE_RECHECK_INTERVAL_MS,
): boolean {
  if (!lock) return true
  if (lock.source === 'manual') return false
  return now - lastCheckedAt >= intervalMs
}

/**
 * Giữ định danh QR/Barcode qua nhiều frame camera. QR và OMR không nhất thiết
 * rõ nét trong cùng một frame; TTL ngắn hạn cho OMR vài giây để hoàn tất nhưng
 * tránh dùng nhầm mã cũ khi người chấm đổi sang tờ giấy khác.
 */
export function resolveExamIdentity(
  previous: ExamCodeLock | null,
  current: ExamCodeScanResult | null,
  activeSessionId: string,
  now: number,
  ttlMs = EXAM_CODE_LOCK_TTL_MS,
): ExamIdentityResolution {
  if (current?.payload) {
    if (current.payload.sessionId !== activeSessionId) {
      return { kind: 'wrong_session', lock: null, scannedSessionId: current.payload.sessionId }
    }

    return {
      kind: 'acquired',
      lock: {
        ...current.payload,
        source: current.source ?? 'qr',
        expiresAt: now + ttlMs,
      },
    }
  }

  if (previous && previous.sessionId === activeSessionId && previous.expiresAt > now) {
    return { kind: 'retained', lock: previous }
  }

  return { kind: 'missing', lock: null }
}
