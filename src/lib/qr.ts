import qrcode from 'qrcode-generator'

/**
 * Smart Exam Grading — QR payload & generation (Phase 1).
 * Payload: tntt-exam:{sessionId}:{studentId}
 * Dùng `qrcode-generator` (npm, MIT) — KHÔNG tự viết encoder Reed-Solomon.
 */
export const EXAM_QR_PREFIX = 'tntt-exam'
export const CERTIFICATE_QR_PREFIX = 'tntt-cert'

export function buildExamQrPayload(sessionId: string, studentId: string): string {
  return `${EXAM_QR_PREFIX}:${sessionId}:${studentId}`
}

export function buildCertificateQrPayload(certId: string, studentId: string, certType: 'completion' | 'promotion'): string {
  return `${CERTIFICATE_QR_PREFIX}:${certId}:${studentId}:${certType}`
}

export function parseExamQrPayload(payload: string): { sessionId: string; studentId: string } | null {
  const parts = payload.split(':')
  if (parts.length < 3 || parts[0] !== EXAM_QR_PREFIX) return null
  return { sessionId: parts[1], studentId: parts.slice(2).join(':') }
}

export function parseCertificateQrPayload(payload: string): { certId: string; studentId: string; certType: 'completion' | 'promotion' } | null {
  const parts = payload.split(':')
  if (parts.length < 4 || parts[0] !== CERTIFICATE_QR_PREFIX) return null
  return { certId: parts[1], studentId: parts[2], certType: parts[3] as 'completion' | 'promotion' }
}

/** Sinh SVG QR code (error correction M — đủ cho ảnh in). */
export function generateExamQrSvg(payload: string, cellSize = 4): string {
  const qr = createQr(payload)
  return qr.createSvgTag(cellSize, 0)
}

/** Số module mỗi cạnh của QR. Bản in phải dùng đúng số này làm SVG viewBox;
 * hard-code 37 sẽ cắt QR khi session/student ID dài hơn. */
export function getExamQrModuleCount(payload: string): number {
  return createQr(payload).getModuleCount()
}

export function generateCertificateQrSvg(payload: string, cellSize = 4): string {
  const qr = createQr(payload)
  return qr.createSvgTag(cellSize, 0)
}

/** Sinh ma trận QR (số 0/1) cho test decode roundtrip (không cần canvas). */
export function generateExamQrMatrix(payload: string): number[][] {
  const qr = createQr(payload)
  const size = qr.getModuleCount()
  const matrix: number[][] = []
  for (let row = 0; row < size; row++) {
    matrix[row] = []
    for (let col = 0; col < size; col++) {
      matrix[row][col] = qr.isDark(row, col) ? 1 : 0
    }
  }
  return matrix
}

export interface QrCodeSpec {
  payload: string
  svg: string
  cellCount: number
}

export function generateExamQrCodes(sessionId: string, students: { id: string; name: string; code: string }[]): QrCodeSpec[] {
  return students.map(st => {
    const payload = buildExamQrPayload(sessionId, st.id)
    return { payload, svg: generateExamQrSvg(payload), cellCount: getExamQrModuleCount(payload) }
  })
}

function createQr(payload: string) {
  const qr = qrcode(0, 'M')
  qr.addData(payload)
  qr.make()
  return qr
}
