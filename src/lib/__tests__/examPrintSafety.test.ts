import { describe, expect, it } from 'vitest'
import {
  ExamPrintIntegrityError,
  assertContiguousOmrQuestionRows,
  convertIntegratedMarkersToForegroundSvg,
  invalidateTeacherAnswerKeyOmr,
  prepareExamDocumentForOutput,
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

describe('examPrintSafety', () => {
  it('accepts only physical OMR row labels 1..N in exact order', () => {
    expect(() => assertContiguousOmrQuestionRows(rows([1, 2, 3, 4]))).not.toThrow()
    expect(() => assertContiguousOmrQuestionRows('<html>no OMR grid</html>')).not.toThrow()
  })

  it.each([
    [1, 1, 3],
    [1, 3, 2],
    [2, 3, 4],
    [1, 2, 4],
  ])('fails closed for duplicate/gap/reordered OMR indexes: %j', indexes => {
    expect(() => assertContiguousOmrQuestionRows(rows(indexes))).toThrow(ExamPrintIntegrityError)
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
})
