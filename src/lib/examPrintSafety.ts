import type { ExamQuestion } from '../types'

const ANSWER_KEY_SENTINELS = [
  'ĐÁP ÁN GLV — KHÔNG CHẤM',
  'ĐÁP ÁN GIÁO VIÊN',
]

const EXAM_DOCUMENT_HINTS = [
  'omr-corner-marker',
  'PHIẾU TRẢ LỜI KIỂM TRA',
  'BẢNG TRẢ LỜI TRẮC NGHIỆM',
  ...ANSWER_KEY_SENTINELS,
]

const OMR_MARKER_PATTERN = /<div\s+class="omr-corner-marker\s+(omr-marker-(?:tl|tr|bl|br))"\s+title="Marker\s+(TL|TR|BL|BR)"\s*><\/div>/gi
const OMR_MARKER_STYLE_PATTERN = /\.omr-corner-marker\s*\{[^}]*\}/gi
const QNUM_PATTERN = /<span\s+class="q-num">C(\d+):<\/span>/g
const BUBBLE_LABEL_PATTERN = /<span\s+class="(bubble(?:\s+[^\"]*)?)">([ABCD])<\/span>/g
const FULL_PAGE_BUBBLE_LABEL_PATTERN = /<text\s+x="[^"]+"\s+y="[^"]+"\s+font-size="[^"]+"\s+font-weight="600"\s+fill="#64748B"\s+text-anchor="middle"\s+dominant-baseline="central">([ABCD])<\/text>/g
const GUIDE_PATTERN = /\* Bút xanh\/đen hoặc chì đậm; tô kín 01 ô \(A, B, C, D\):/g
const BATCH_PRINT_SAFE_MARGIN_STYLE = `<style data-omr-batch-safe-margin>
@media print {
  /* Batch HTML historically used @page margin:0, leaving integrated marker ink
     only ~3.2mm from the physical A4 edge. Uniform 96% scaling around page center
     adds ~4.2mm each side while preserving every marker↔bubble affine ratio. */
  .batch-exam-page > .Section1 {
    transform: scale(0.96);
    transform-origin: top center;
  }
}
</style>`

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
 * ReportExportService is shared by many non-exam reports. Keep exam-specific
 * transforms strictly scoped so a generic report that happens to use a class
 * such as `bubble` or `q-num` is never mutated accidentally.
 */
export function isExamDocumentHtml(html: string): boolean {
  return EXAM_DOCUMENT_HINTS.some(hint => html.includes(hint))
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
 * Every physical frame must therefore contain exactly 1..N. Batch documents
 * concatenate several frames, each beginning at C1, and every frame must have the
 * same N; otherwise a truncated page could pass a simple reset-only validator.
 */
export function assertContiguousOmrQuestionRows(html: string): void {
  const indexes = Array.from(html.matchAll(QNUM_PATTERN), match => Number(match[1]))
  if (indexes.length === 0) return

  const sheets: number[][] = []
  let current: number[] = []
  for (const actual of indexes) {
    if (actual === 1 && current.length > 0) {
      sheets.push(current)
      current = []
    }
    current.push(actual)
  }
  if (current.length > 0) sheets.push(current)

  for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
    const sheet = sheets[sheetIndex]
    for (let rowIndex = 0; rowIndex < sheet.length; rowIndex++) {
      const expected = rowIndex + 1
      const actual = sheet[rowIndex]
      if (!Number.isInteger(actual) || actual !== expected) {
        throw new ExamPrintIntegrityError(
          `Khung OMR phiếu ${sheetIndex + 1} có thứ tự câu không hợp lệ tại vị trí ${expected}: nhận C${actual ?? '?'}. `
          + 'Mỗi phiếu phải có câu liên tục 1..N trước khi in/chấm tự động.'
        )
      }
    }
  }

  if (sheets.length > 1) {
    const expectedQuestionCount = sheets[0].length
    const truncatedIndex = sheets.findIndex(sheet => sheet.length !== expectedQuestionCount)
    if (truncatedIndex >= 0) {
      throw new ExamPrintIntegrityError(
        `Khung OMR phiếu ${truncatedIndex + 1} có ${sheets[truncatedIndex].length} câu; `
        + `batch yêu cầu đồng nhất ${expectedQuestionCount} câu trên mọi phiếu.`
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
 * Printed option glyphs used to sit exactly in detector core disks. ROI-based
 * darkness measurement then sees baseline ink even when no answer is marked.
 * Keep every bubble/circle element and its geometry unchanged, but remove A/B/C/D
 * glyphs from both integrated HTML bubbles and full-page SVG circles. Integrated
 * forms retain semantics through aria-label; all forms use left→right A,B,C,D.
 */
export function cleanIntegratedBubbleRoi(html: string): string {
  const withoutIntegratedGlyphs = html.replace(BUBBLE_LABEL_PATTERN, (_whole, className: string, option: string) => (
    `<span class="${className}" aria-label="${option}"></span>`
  ))
  const withoutFullPageGlyphs = withoutIntegratedGlyphs.replace(FULL_PAGE_BUBBLE_LABEL_PATTERN, '')
  return withoutFullPageGlyphs.replace(
    GUIDE_PATTERN,
    '* Bút xanh/đen hoặc chì đậm; tô kín 01 ô — 4 ô từ trái sang phải lần lượt là A, B, C, D:'
  )
}

/**
 * Batch integrated exam pages use zero @page margin. Add physical printer safety
 * without touching SSOT geometry: a uniform transform preserves normalized
 * marker/bubble coordinates exactly, which homography is designed to tolerate.
 */
export function addBatchIntegratedPrintSafeMargin(html: string): string {
  if (!html.includes('batch-exam-page') || !html.includes('omr-corner-marker')) return html
  if (html.includes('data-omr-batch-safe-margin')) return html
  if (html.includes('</head>')) return html.replace('</head>', `${BATCH_PRINT_SAFE_MARGIN_STYLE}</head>`)
  return `${BATCH_PRINT_SAFE_MARGIN_STYLE}${html}`
}

/**
 * Teacher answer keys must be visually useful but machine-invalid. Removing the
 * four homography fiducials guarantees integrated OMR cannot accept the key even
 * in fixed-student/manual mode where QR identity is intentionally bypassed. Strip
 * the now-unused marker CSS as well so exported teacher documents cannot be
 * mistaken for scan-certified forms by downstream tooling/tests.
 */
export function invalidateTeacherAnswerKeyOmr(html: string): string {
  if (!isTeacherAnswerKeyHtml(html)) return html
  return html.replace(OMR_MARKER_PATTERN, '').replace(OMR_MARKER_STYLE_PATTERN, '')
}

/**
 * Canonical safety gate for every physical/exported exam document.
 * Order matters: validate semantic mapping, remove detector-noise glyphs, then
 * invalidate answer keys, convert student markers to foreground SVG, and finally
 * add the batch physical-edge guard without altering relative OMR geometry.
 */
export function prepareExamDocumentForOutput(html: string): string {
  assertContiguousOmrQuestionRows(html)
  const cleanBubbles = cleanIntegratedBubbleRoi(html)
  const machineSafe = invalidateTeacherAnswerKeyOmr(cleanBubbles)
  const foregroundMarkers = convertIntegratedMarkersToForegroundSvg(machineSafe)
  return addBatchIntegratedPrintSafeMargin(foregroundMarkers)
}

/** Safe adapter for shared export paths: non-exam HTML is returned byte-for-byte. */
export function prepareExamDocumentForOutputIfApplicable(html: string): string {
  return isExamDocumentHtml(html) ? prepareExamDocumentForOutput(html) : html
}
