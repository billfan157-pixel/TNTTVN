import crypto from 'crypto'

/**
 * Lấy secret key dùng để ký HMAC.
 * Ưu tiên REPORT_HMAC_SECRET, fallback sang JWT_SECRET hoặc secret mặc định an toàn cho môi trường test/dev.
 */
function getHmacSecret(): string {
  return process.env.REPORT_HMAC_SECRET || process.env.JWT_SECRET || 'brave-davinci-default-hmac-secret-2026'
}

/**
 * Tạo chữ ký HMAC-SHA256 cho payload phiếu điểm / chứng nhận.
 * Dữ liệu ký: parishId:studentId:academicYear:certId
 */
export function signReportPayload(parishId: string, studentId: string, academicYear: string, certId: string): string {
  const secret = getHmacSecret()
  const data = `${parishId}:${studentId}:${academicYear}:${certId}`
  return crypto.createHmac('sha256', secret).update(data).digest('hex')
}

/**
 * Kiểm tra tính hợp lệ của chữ ký HMAC.
 */
export function verifyReportSignature(parishId: string, studentId: string, academicYear: string, certId: string, signature: string): boolean {
  try {
    const expectedSignature = signReportPayload(parishId, studentId, academicYear, certId)
    // Dùng timingSafeEqual để chống timing attack
    const sigBuffer = Buffer.from(signature, 'hex')
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')
    if (sigBuffer.length !== expectedBuffer.length) return false
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  } catch {
    return false
  }
}
