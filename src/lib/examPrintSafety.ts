import type { ExamQuestion } from '../types'

const ANSWER_KEY_SENTINELS = [
  'ĐÁP ÁN GLV — KHÔNG CHẤM',
  'ĐÁP ÁN GIÁO VIÊN',
]

const OMR_MARKER_PATTERN = /<div\s+class="omr-corner-marker\s+(omr-marker-(?:tl|tr|bl|br))"\s+title="Marker\s+(TL|TR|BL|BR)"\s*><\/div>/gi
const QNUM_PATTERN = /<span\s+class="q-num">C(\d+):<\/span>/g

export class ExamPrintIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExamPrintIntegrityError'
  }
}

export function isTeacherAnswerKeyHtml(html: string): boolean {
  return ANSWER_KEY_SENTINELS.some(sentinel => html.includes(sentinel))
}

/**
 * Validate source questions before render. Sorting alone is insufficient because
 * duplicates/gaps remain ambiguous for a positional OMR grid.
 */
export function assertContiguousQuestionIndexes(questions: readonly ExamQuestion[]): void {
  if (questions.length === 0) return
  const sortedIndexes = questions.map(question => question.index).sort((a, b) => a - b)
  for (let i = 0; i < sortedIndexes.length; i++) {
    const expected = i + 1
    const actual = sortedIndexes[i]
    if (!Number.isInteger(actual) || actual !== expected) {
      throw new ExamPrintIntegrityError(
        `Danh sách câu hỏi không liên tục tại vị trí ${expected}: nhận C${String(actual)}. `
        + 'Đề dùng OMR phải có index duy nhất và liên tục 1..N.'
      )
    }
  }
}

/**
 * Physical OMR rows are positional: row 1 is question 1, row 2 is question 2...
 * The visible labels therefore MUST be exactly 1..N with no duplicates/gaps.
 * Fail closed before print/export rather than silently grading against a shifted key.
 */
export function assertContiguousOmrQuestionRows(html: string): void {
  const indexes = Array.from(html.matchAll(QNUM_PATTERN), match => Number(match[1]))
  if (indexes.length === 0) return

  for (let i = 0; i < indexes.length; i++) {
    const expected = i + 1
    if (!Number.isInteger(indexes[i]) || indexes[i] !== expected) {
      throw new ExamPrintIntegrityError(
        `Khung OMR có thứ tự câu không hợp lệ tại vị trí ${expected}: nhận C${indexes[i] ?? '?'}. `
        + 'Phiếu phải có câu liên tục 1..N trước khi in/chấm tự động.'
      )
    }
  }
}

function markerSvg(positionClass: string, markerId: string): string {
  return `<svg class="omr-corner-marker ${positionClass}" title="Marker ${markerId}" viewBox="0 0 18 18" aria-hidden="true" shape-rendering="crispEdges" style="background:transparent"><rect x="0" y="0" width="18" height="18" fill="#000000" /></svg>`
}

/**
 * CSS background graphics are printer-setting dependent. Convert the four critical
 * integrated fiducials into foreground SVG geometry immediately before physical
 * output while preserving the exact CSS size/position classes and therefore the
 * detector SSOT coordinates.
 */
export function convertIntegratedMarkersToForegroundSvg(html: string): string {
  return html.replace(OMR_MARKER_PATTERN, (_whole, positionClass: string, markerId: string) => (
    markerSvg(positionClass, markerId)
  ))
}

/**
 * Teacher answer keys must be visually useful but machine-invalid. Removing the
 * four homography fiducials guarantees integrated OMR cannot accept the key even
 * in fixed-student/manual mode where QR identity is intentionally bypassed.
 */
export function invalidateTeacherAnswerKeyOmr(html: string): string {
  if (!isTeacherAnswerKeyHtml(html)) return html
  return html.replace(OMR_MARKER_PATTERN, '')
}

/**
 * Canonical safety gate for every physical/exported exam document.
 * Order matters: validate the semantic row mapping first, then invalidate keys,
 * then convert remaining student-form markers to print-safe foreground SVG.
 */
export function prepareExamDocumentForOutput(html: string): string {
  assertContiguousOmrQuestionRows(html)
  const machineSafe = invalidateTeacherAnswerKeyOmr(html)
  return convertIntegratedMarkersToForegroundSvg(machineSafe)
}
