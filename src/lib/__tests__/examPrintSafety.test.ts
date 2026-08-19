import { describe, expect, it } from 'vitest'
import {
  ExamPrintIntegrityError,
  assertContiguousQuestionIndexes,
  assertContiguousOmrQuestionRows,
  cleanIntegratedBubbleRoi,
  convertIntegratedMarkersToForegroundSvg,
  invalidateTeacherAnswerKeyOmr,
  isExamDocumentHtml,
  prepareExamDocumentForOutput,
  prepareExamDocumentForOutputIfApplicable,
} from '../examPrintSafety'

const markers = `
  <div class="omr-corner-marker omr-marker-tl" title="Marker TL"></div>
  <div class="omr-corner-marker omr-marker-tr" title="Marker TR"></div>
  <div class="omr-corner-marker omr-marker-bl" title="Marker BL"></div>
  <div class="omr-corner-marker omr-marker-br" title="Marker BR"></div>
`

function rows(indexes: number[]): string {
  return indexes.map(index => `<span class="q-num">C${index}:</span>`).join('')
}

function question(index: number) {
  return {
    index,
    question: `Câu ${index}`,
    options: { A: 'A', B: 'B', C: 'C', D: 'D' },
    correctOption: 'A' as const,
  }
}

describe('examPrintSafety', () => {
  it('validates source questions as a unique contiguous 1..N set before render', () => {
    expect(() => assertContiguousQuestionIndexes([question(3), question(1), question(2)])).not.toThrow()
    expect(() => assertContiguousQuestionIndexes([question(1), question(1), question(3)])).toThrow(ExamPrintIntegrityError)
    expect(() => assertContiguousQuestionIndexes([question(1), question(3)])).toThrow(ExamPrintIntegrityError)
    expect(() => assertContiguousQuestionIndexes([question(0), question(1)])).toThrow(ExamPrintIntegrityError)
  })

  it('accepts only physical OMR row labels 1..N in exact order', () => {
    expect(() => assertContiguousOmrQuestionRows(rows([1, 2, 3, 4]))).not.toThrow()
    expect(() => assertContiguousOmrQuestionRows('<html>no OMR grid</html>')).not.toThrow()
  })

  it('validates each concatenated batch sheet independently at the C1 boundary', () => {
    expect(() => assertContiguousOmrQuestionRows(rows([1, 2, 3, 1, 2, 3]))).not.toThrow()
    expect(() => assertContiguousOmrQuestionRows(rows([1, 2, 3, 1, 3]))).toThrow(ExamPrintIntegrityError)
    expect(() => assertContiguousOmrQuestionRows(rows([1, 2, 3, 1, 2]))).toThrow(ExamPrintIntegrityError)
  })

  it('fails closed for duplicate/gap/reordered OMR indexes', () => {
    const invalidRows: number[][] = [
      [1, 1, 3],
      [1, 3, 2],
      [2, 3, 4],
      [1, 2, 4],
    ]
    for (const indexes of invalidRows) {
      expect(() => assertContiguousOmrQuestionRows(rows(indexes))).toThrow(ExamPrintIntegrityError)
    }
  })

  it('removes printed A/B/C/D glyphs from integrated bubble ROI without changing bubble elements', () => {
    const html = `
      <div class="answer-sheet-guide">* Bút xanh/đen hoặc chì đậm; tô kín 01 ô (A, B, C, D):</div>
      <span class="bubble">A</span>
      <span class="bubble bubble-correct">B</span>
      <span class="bubble">C</span>
      <span class="bubble">D</span>
    `
    const clean = cleanIntegratedBubbleRoi(html)
    expect(clean.match(/class="bubble/g)).toHaveLength(4)
    expect(clean).toContain('class="bubble" aria-label="A"></span>')
    expect(clean).toContain('class="bubble bubble-correct" aria-label="B"></span>')
    expect(clean).not.toContain('>A</span>')
    expect(clean).not.toContain('>B</span>')
    expect(clean).toContain('4 ô từ trái sang phải lần lượt là A, B, C, D')
  })

  it('removes A/B/C/D text from full-page SVG bubble cores without touching circles', () => {
    const html = `
      <circle cx="100" cy="200" r="10" fill="#FFFFFF" stroke="#64748B" stroke-width="2" />
      <text x="100" y="200" font-size="11.5" font-weight="600" fill="#64748B" text-anchor="middle" dominant-baseline="central">A</text>
      <circle cx="140" cy="200" r="10" fill="#FFFFFF" stroke="#64748B" stroke-width="2" />
      <text x="140" y="200" font-size="11.5" font-weight="600" fill="#64748B" text-anchor="middle" dominant-baseline="central">B</text>
    `
    const clean = cleanIntegratedBubbleRoi(html)
    expect(clean.match(/<circle/g)).toHaveLength(2)
    expect(clean).not.toContain('dominant-baseline="central">A</text>')
    expect(clean).not.toContain('dominant-baseline="central">B</text>')
  })

  it('moves written score labels above the boxes without changing scan-box geometry', () => {
    const html = `
      <rect x="82" y="182" width="36" height="36" rx="7" fill="#FFFFFF" stroke="#1E293B" stroke-width="2" />
      <text x="100" y="200" font-size="18" font-weight="800" fill="#0F172A" text-anchor="middle" dominant-baseline="central">8</text>
    `
    const clean = cleanIntegratedBubbleRoi(html)
    expect(clean).toContain('<rect x="82" y="182" width="36" height="36"')
    expect(clean).toContain('<text x="100" y="170" font-size="12" font-weight="800" fill="#0F172A" text-anchor="middle">8</text>')
    expect(clean).not.toContain('y="200" font-size="18"')
  })

  it('removes homography markers from teacher answer key', () => {
    const html = `<div>ĐÁP ÁN GLV — KHÔNG CHẤM</div>${markers}${rows([1, 2])}`
    const safe = invalidateTeacherAnswerKeyOmr(html)
    expect(safe).not.toContain('omr-corner-marker')
    expect(safe).toContain('ĐÁP ÁN GLV — KHÔNG CHẤM')
  })

  it('keeps student form machine-readable but converts CSS-background markers to foreground SVG', () => {
    const html = `<div>MÃ QUÉT TỰ ĐỘNG</div>${markers}${rows([1, 2])}`
    const safe = convertIntegratedMarkersToForegroundSvg(html)
    expect(safe.match(/<svg class="omr-corner-marker/g)).toHaveLength(4)
    expect(safe).toContain('<rect x="0" y="0" width="18" height="18" fill="#000000" />')
    expect(safe).not.toContain('<div class="omr-corner-marker')
  })

  it('canonical output gate validates first and makes answer key machine-invalid', () => {
    const key = `<div>ĐÁP ÁN GIÁO VIÊN</div>${markers}${rows([1, 2, 3])}`
    const safe = prepareExamDocumentForOutput(key)
    expect(safe).not.toContain('omr-corner-marker')

    const broken = `<div>MÃ QUÉT TỰ ĐỘNG</div>${markers}${rows([1, 3])}`
    expect(() => prepareExamDocumentForOutput(broken)).toThrow(ExamPrintIntegrityError)
  })

  it('shared export adapter leaves generic report HTML byte-for-byte unchanged', () => {
    const generic = `<html><body><span class="bubble">A</span>${rows([2, 1])}</body></html>`
    expect(isExamDocumentHtml(generic)).toBe(false)
    expect(prepareExamDocumentForOutputIfApplicable(generic)).toBe(generic)
  })

  it('shared export adapter still hardens full-page answer sheets without integrated marker classes', () => {
    const fullPage = `
      <div>PHIẾU TRẢ LỜI KIỂM TRA</div>
      <circle cx="100" cy="200" r="10" fill="#FFFFFF" stroke="#64748B" stroke-width="2" />
      <text x="100" y="200" font-size="11.5" font-weight="600" fill="#64748B" text-anchor="middle" dominant-baseline="central">A</text>
    `
    expect(isExamDocumentHtml(fullPage)).toBe(true)
    expect(prepareExamDocumentForOutputIfApplicable(fullPage)).not.toContain('dominant-baseline="central">A</text>')
  })
})
