import qrcode from 'qrcode-generator'

/**
 * Smart Exam Grading — QR payload & generation (Phase 1).
 * Payload legacy: tntt-exam:{sessionId}:{studentId}
 * Payload production rút gọn: TE:{8 HEX session}:{8 HEX student}
 * Dùng `qrcode-generator` (npm, MIT) — KHÔNG tự viết encoder Reed-Solomon.
 */
export const EXAM_QR_PREFIX = 'tntt-exam'
export const EXAM_QR_COMPACT_PREFIX = 'TE'
export const EXAM_QR_V2_PREFIX = 'T2'
export const EXAM_QR_V3_PREFIX = 'T3'
export const CERTIFICATE_QR_PREFIX = 'tntt-cert'
export const QR_QUIET_ZONE_MODULES = 4

export type ExamFormTemplateMode = 'integrated' | 'full_page'
export type ExamVersionCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'

export interface ExamFormProtocolMetadata {
  templateMode: ExamFormTemplateMode
  questionCount: number
  /** Mã đề. Khi có trường này, payload v3 ràng buộc mã đề vào checksum. */
  examVersion?: ExamVersionCode
}

export interface ParsedExamQrPayload {
  sessionId: string
  studentId: string
  /** Phiếu cũ không có version; được hiểu là protocol v1. */
  protocolVersion?: 2 | 3
  templateMode?: ExamFormTemplateMode
  questionCount?: number
  /** Phiếu v1/v2 được hiểu là mã đề A. */
  examVersion?: ExamVersionCode
  /** Checksum chỉ phát hiện payload bị cắt/sửa nhầm, không phải chữ ký bảo mật. */
  formChecksum?: string
}

function formChecksum(value: string): string {
  // FNV-1a rút gọn 16 bit: đủ để fail-closed khi Code128/QR bị cắt hoặc metadata
  // bị sửa nhầm. QR vẫn chỉ là định danh; phân quyền luôn do server quyết định.
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash & 0xffff).toString(16).toUpperCase().padStart(4, '0')
}

function v2ChecksumInput(sessionId: string, studentId: string, mode: 'I' | 'F', questionCount: number): string {
  return `${sessionId.toLowerCase()}|${studentId.toLowerCase()}|${mode}|${questionCount}`
}

function v3ChecksumInput(sessionId: string, studentId: string, mode: 'I' | 'F', questionCount: number, examVersion: ExamVersionCode): string {
  return `${v2ChecksumInput(sessionId, studentId, mode, questionCount)}|${examVersion}`
}

export function buildExamQrPayload(
  sessionId: string,
  studentId: string,
  metadata?: ExamFormProtocolMetadata,
): string {
  const sessionMatch = /^EXS-([a-f0-9]{8})$/i.exec(sessionId)
  const studentMatch = /^ST-([a-f0-9]{8})$/i.exec(studentId)
  if (metadata && sessionMatch && studentMatch) {
    const questionCount = Math.max(1, Math.min(50, Math.trunc(metadata.questionCount)))
    const mode = metadata.templateMode === 'full_page' ? 'F' : 'I'
    const canonicalSessionId = `EXS-${sessionMatch[1].toLowerCase()}`
    const canonicalStudentId = `ST-${studentMatch[1].toLowerCase()}`
    if (metadata.examVersion) {
      const examVersion = metadata.examVersion.toUpperCase() as ExamVersionCode
      const checksum = formChecksum(v3ChecksumInput(canonicalSessionId, canonicalStudentId, mode, questionCount, examVersion))
      return `${EXAM_QR_V3_PREFIX}:${sessionMatch[1].toUpperCase()}:${studentMatch[1].toUpperCase()}:${mode}:${questionCount}:${examVersion}:${checksum}`
    }
    const checksum = formChecksum(v2ChecksumInput(canonicalSessionId, canonicalStudentId, mode, questionCount))
    return `${EXAM_QR_V2_PREFIX}:${sessionMatch[1].toUpperCase()}:${studentMatch[1].toUpperCase()}:${mode}:${questionCount}:${checksum}`
  }
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

export function parseExamQrPayload(payload: string): ParsedExamQrPayload | null {
  const parts = payload.split(':')
  if (
    parts.length === 7
    && parts[0].toUpperCase() === EXAM_QR_V3_PREFIX
    && /^[a-f0-9]{8}$/i.test(parts[1])
    && /^[a-f0-9]{8}$/i.test(parts[2])
    && /^(I|F)$/i.test(parts[3])
    && /^\d{1,2}$/.test(parts[4])
    && /^[A-H]$/i.test(parts[5])
    && /^[a-f0-9]{4}$/i.test(parts[6])
  ) {
    const sessionId = `EXS-${parts[1].toLowerCase()}`
    const studentId = `ST-${parts[2].toLowerCase()}`
    const mode = parts[3].toUpperCase() as 'I' | 'F'
    const questionCount = Number(parts[4])
    const examVersion = parts[5].toUpperCase() as ExamVersionCode
    if (questionCount < 1 || questionCount > 50) return null
    const expected = formChecksum(v3ChecksumInput(sessionId, studentId, mode, questionCount, examVersion))
    if (parts[6].toUpperCase() !== expected) return null
    return {
      sessionId,
      studentId,
      protocolVersion: 3,
      templateMode: mode === 'F' ? 'full_page' : 'integrated',
      questionCount,
      examVersion,
      formChecksum: expected,
    }
  }
  if (
    parts.length === 6
    && parts[0].toUpperCase() === EXAM_QR_V2_PREFIX
    && /^[a-f0-9]{8}$/i.test(parts[1])
    && /^[a-f0-9]{8}$/i.test(parts[2])
    && /^(I|F)$/i.test(parts[3])
    && /^\d{1,2}$/.test(parts[4])
    && /^[a-f0-9]{4}$/i.test(parts[5])
  ) {
    const sessionId = `EXS-${parts[1].toLowerCase()}`
    const studentId = `ST-${parts[2].toLowerCase()}`
    const mode = parts[3].toUpperCase() as 'I' | 'F'
    const questionCount = Number(parts[4])
    if (questionCount < 1 || questionCount > 50) return null
    const expected = formChecksum(v2ChecksumInput(sessionId, studentId, mode, questionCount))
    if (parts[5].toUpperCase() !== expected) return null
    return {
      sessionId,
      studentId,
      protocolVersion: 2,
      templateMode: mode === 'F' ? 'full_page' : 'integrated',
      questionCount,
      formChecksum: expected,
    }
  }
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
  if (/^(?:TE:[A-F0-9]{8}:[A-F0-9]{8}|T2:[A-F0-9]{8}:[A-F0-9]{8}:[IF]:\d{1,2}:[A-F0-9]{4}|T3:[A-F0-9]{8}:[A-F0-9]{8}:[IF]:\d{1,2}:[A-H]:[A-F0-9]{4})$/.test(payload)) qr.addData(payload, 'Alphanumeric')
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
