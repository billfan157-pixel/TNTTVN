import qrcode from 'qrcode-generator'

/**
 * Smart Exam Grading — QR payload & generation (Phase 1).
 * Payload legacy: tntt-exam:{sessionId}:{studentId}
 * Payload production rút gọn: TE:{8 HEX session}:{8 HEX student}
 * Dùng `qrcode-generator` (npm, MIT) — KHÔNG tự viết encoder Reed-Solomon.
 */
export const EXAM_QR_PREFIX = 'tntt-exam'
export const EXAM_QR_COMPACT_PREFIX = 'TE'
export const CERTIFICATE_QR_PREFIX = 'tntt-cert'
export const QR_QUIET_ZONE_MODULES = 4

export function buildExamQrPayload(sessionId: string, studentId: string): string {
  const sessionMatch = /^EXS-([a-f0-9]{8})$/i.exec(sessionId)
  const studentMatch = /^ST-([a-f0-9]{8})$/i.exec(studentId)
  // ID production đã chứa đúng 8 hex entropy. Bỏ hai prefix lặp và prefix dài
  // + Alphanumeric mode giúp QR giảm từ 29 xuống 21 module/cạnh, tăng kích
  // thước mỗi module ~38%
  // khi in cùng một ô — khác biệt quyết định với camera điện thoại hơi mất nét.
  if (sessionMatch && studentMatch) {
    return `${EXAM_QR_COMPACT_PREFIX}:${sessionMatch[1].toUpperCase()}:${studentMatch[1].toUpperCase()}`
  }
  return `${EXAM_QR_PREFIX}:${sessionId}:${studentId}`
}

export function buildCertificateQrPayload(certId: string, studentId: string, certType: 'completion' | 'promotion'): string {
  return `${CERTIFICATE_QR_PREFIX}:${certId}:${studentId}:${certType}`
}

export function parseExamQrPayload(payload: string): { sessionId: string; studentId: string } | null {
  const parts = payload.split(':')
  if (
    parts.length === 3
    && parts[0].toUpperCase() === EXAM_QR_COMPACT_PREFIX
    && /^[a-f0-9]{8}$/i.test(parts[1])
    && /^[a-f0-9]{8}$/i.test(parts[2])
  ) {
    return {
      sessionId: `EXS-${parts[1].toLowerCase()}`,
      studentId: `ST-${parts[2].toLowerCase()}`,
    }
  }
  if (parts.length < 3 || parts[0] !== EXAM_QR_PREFIX) return null
  return { sessionId: parts[1], studentId: parts.slice(2).join(':') }
}

export function parseCertificateQrPayload(payload: string): { certId: string; studentId: string; certType: 'completion' | 'promotion' } | null {
  const parts = payload.split(':')
  if (parts.length < 4 || parts[0] !== CERTIFICATE_QR_PREFIX) return null
  return { certId: parts[1], studentId: parts[2], certType: parts[3] as 'completion' | 'promotion' }
}

/**
 * Sinh SVG QR code ở hệ tọa độ MODULE chuẩn, kèm quiet zone 4 module.
 * `qrcode-generator.createSvgTag(cellSize, 0)` dùng tọa độ pixel
 * (moduleCount × cellSize). Khi caller tách inner SVG rồi đặt viewBox theo
 * moduleCount, mã bị cắt còn 1/cellSize diện tích. Tự render ma trận giúp
 * viewBox không phụ thuộc cellSize và giữ cạnh module sắc nét khi in/camera.
 */
export function generateExamQrSvg(payload: string, cellSize = 4): string {
  return createQrSvg(payload, cellSize)
}

/** Số data module mỗi cạnh của QR (không gồm quiet zone). */
export function getExamQrModuleCount(payload: string): number {
  return createQr(payload).getModuleCount()
}

/** Kích thước viewBox gồm data modules + quiet zone 4 module mỗi cạnh. */
export function getExamQrViewBoxSize(payload: string): number {
  return getExamQrModuleCount(payload) + QR_QUIET_ZONE_MODULES * 2
}

export function generateCertificateQrSvg(payload: string, cellSize = 4): string {
  return createQrSvg(payload, cellSize)
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
  // Payload compact chỉ chứa tập ký tự QR Alphanumeric. Khai báo mode này thay
  // vì Byte giúp mã production giảm tiếp từ 25 xuống 21 module/cạnh (Version 1).
  if (/^TE:[A-F0-9]{8}:[A-F0-9]{8}$/.test(payload)) qr.addData(payload, 'Alphanumeric')
  else qr.addData(payload)
  qr.make()
  return qr
}

function createQrSvg(payload: string, cellSize: number): string {
  const qr = createQr(payload)
  const moduleCount = qr.getModuleCount()
  const viewBoxSize = moduleCount + QR_QUIET_ZONE_MODULES * 2
  const pixelSize = viewBoxSize * Math.max(1, cellSize)
  let path = ''
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (!qr.isDark(row, col)) continue
      const x = col + QR_QUIET_ZONE_MODULES
      const y = row + QR_QUIET_ZONE_MODULES
      path += `M${x},${y}h1v1h-1z`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
}
