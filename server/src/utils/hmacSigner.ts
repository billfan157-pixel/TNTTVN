import crypto from 'crypto'

/**
 * Secret dùng để KÝ HMAC phiếu điểm / chứng nhận.
 *
 * Quy tắc (SEC-HMAC-1, 2026-08-24):
 * - Production: REPORT_HMAC_SECRET BẮT BUỘC — fail-closed lúc import module
 *   (chuẩn ADR-016/ADR-051 với JWT_SECRET). Không còn fallback hardcode public.
 * - Non-prod (dev/test): REPORT_HMAC_SECRET → JWT_SECRET → legacy literal.
 *
 * VERIFY giữ chuỗi fallback legacy để QR đã in/phát hành trước đây (ký bằng key
 * suy dẫn từ JWT_SECRET hoặc literal) vẫn xác thực được sau khi prod set
 * REPORT_HMAC_SECRET riêng. Ký mới LUÔN dùng secret hiện hành.
 */
const LEGACY_DEFAULT_HMAC_SECRET = 'brave-davinci-default-hmac-secret-2026'

function assertProductionSecretConfigured(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.REPORT_HMAC_SECRET) {
    throw new Error(
      'REPORT_HMAC_SECRET is required in production (QR report-card signing). '
      + 'Set a dedicated 32+ byte random secret before starting the server.',
    )
  }
}

// Fail-closed tại startup thay vì lỗi runtime ở request đầu tiên (khớp chuẩn
// auth.ts:14-30 với JWT_SECRET).
assertProductionSecretConfigured()

function getSigningSecret(): string {
  return process.env.REPORT_HMAC_SECRET || process.env.JWT_SECRET || LEGACY_DEFAULT_HMAC_SECRET
}

/**
 * Chuỗi secret candidate cho VERIFY, thứ tự ưu tiên: secret hiện hành trước,
 * rồi đến các derivation legacy. Dùng Set để tránh thử trùng.
 */
function getVerificationCandidates(): string[] {
  const candidates = new Set<string>()
  candidates.add(getSigningSecret())
  if (process.env.JWT_SECRET) candidates.add(process.env.JWT_SECRET)
  if (!process.env.REPORT_HMAC_SECRET) candidates.add(LEGACY_DEFAULT_HMAC_SECRET)
  return [...candidates]
}

function computeSignature(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex')
}

/**
 * Tạo chữ ký HMAC-SHA256 cho payload phiếu điểm / chứng nhận.
 * Dữ liệu ký: parishId:studentId:academicYear:certId
 */
export function signReportPayload(parishId: string, studentId: string, academicYear: string, certId: string): string {
  const data = `${parishId}:${studentId}:${academicYear}:${certId}`
  return computeSignature(getSigningSecret(), data)
}

/**
 * Kiểm tra tính hợp lệ của chữ ký HMAC.
 * Chấp nhận chữ ký khớp BẤT KỲ candidate nào (hiện hành + legacy) — timingSafeEqual
 * chống timing attack trên từng phép so sánh.
 */
export function verifyReportSignature(parishId: string, studentId: string, academicYear: string, certId: string, signature: string): boolean {
  try {
    const sigBuffer = Buffer.from(signature, 'hex')
    if (sigBuffer.length !== 32) return false // HMAC-SHA256 hex luôn 64 hex chars
    const data = `${parishId}:${studentId}:${academicYear}:${certId}`
    for (const secret of getVerificationCandidates()) {
      const expectedBuffer = Buffer.from(computeSignature(secret, data), 'hex')
      if (sigBuffer.length !== expectedBuffer.length) continue
      if (crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return true
    }
    return false
  } catch {
    return false
  }
}
