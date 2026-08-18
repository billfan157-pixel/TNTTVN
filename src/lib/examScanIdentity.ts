import type { ExamCodeScanResult } from './examCodeScanner'

export const EXAM_CODE_LOCK_TTL_MS = 5_000

export interface ExamCodeLock {
  sessionId: string
  studentId: string
  source: 'qr' | 'barcode' | 'manual'
  expiresAt: number
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
