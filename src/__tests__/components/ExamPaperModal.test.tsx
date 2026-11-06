import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ExamPaperModal } from '../../components/exam/ExamPaperModal'
import { ReportExportService } from '../../services/reportExportService'
import { generateExamVariantManifest } from '../../../server/src/services/examVariantManifest'

const view = vi.hoisted(() => ({ mode: 'desktop' }))
vi.mock('../../hooks/useEffectiveMode', () => ({ useEffectiveMode: () => view.mode }))

const students = [
  { id: 'ST-001', code: 'TN001', name: 'Nguyễn Minh Anh' },
  { id: 'ST-002', code: 'TN002', name: 'Trần Quốc Bảo' },
  { id: 'ST-003', code: 'TN003', name: 'Nguyễn Minh Anh' },
  { id: 'ST-004', code: 'TN004', name: 'Đỗ Mỹ & An' },
]
const questions = [
  { index: 1, question: 'Chọn số một.', options: { A: 'Một', B: 'Hai', C: 'Ba', D: 'Bốn' }, correctOption: 'A' as const },
  { index: 2, question: 'Chọn số sáu.', options: { A: 'Năm', B: 'Sáu', C: 'Bảy', D: 'Tám' }, correctOption: 'B' as const },
]
const variantManifests = generateExamVariantManifest({
  questions, questionCount: 2, variantCount: 2, shuffleMode: 'questions_only', seed: 'batch-print',
})

function openPaper() {
  render(<ExamPaperModal isOpen onClose={() => {}} subject="Kiểm tra" classLabel="Thiếu Nhi 2A"
    academicYear="2026-2027" questions={questions} students={students} variantManifests={variantManifests} />)
}

function button(name: string) {
  return screen.getByRole('button', { name })
}

function printedPapers(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(document.querySelectorAll('.exam-paper-container'), paper => ({
    student: Array.from(paper.querySelectorAll('.student-info-row:first-child strong'), field => field.textContent),
    version: paper.querySelector('.header-left strong:last-child')?.textContent,
    hasAnswerKey: Boolean(paper.querySelector('.answer-key-summary')),
  }))
}

beforeEach(() => {
  view.mode = 'desktop'
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('whole-class exam printing', () => {
  it('prints and exports every named copy after switching from all versions to the class', () => {
    const print = vi.spyOn(ReportExportService, 'print').mockImplementation(() => {})
    const pdf = vi.spyOn(ReportExportService, 'exportPdf').mockImplementation(() => {})
    const html = vi.spyOn(ReportExportService, 'downloadHTML').mockImplementation(() => {})
    openPaper()

    fireEvent.click(button('B (102)'))
    fireEvent.click(button('Tất cả (2)'))
    fireEvent.click(button('In Cả Lớp (4 em)'))

    const expected = students.map(({ name, code }) => ({ student: [name, code], version: 'B (102)', hasAnswerKey: false }))
    fireEvent.click(button('In Cả Lớp (4 Bản)'))
    expect(printedPapers(print.mock.calls[0]?.[0] ?? '')).toEqual(expected)
    fireEvent.click(button('Xuất PDF (4 Bản)'))
    expect(printedPapers(pdf.mock.calls[0]?.[0] ?? '')).toEqual(expected)
    fireEvent.click(button('Tải HTML (4 Bản)'))
    expect(printedPapers(html.mock.calls[0]?.[0] ?? '')).toEqual(expected)

    const preview = screen.getByTitle('Xem trước tài liệu kiểm tra').getAttribute('srcdoc') ?? ''
    expect(printedPapers(preview)).toEqual(expected.slice(0, 2))
    expect(screen.getByText(/Xem trước 2\/4 bản/)).toBeVisible()

    fireEvent.click(button('Ẩn Đáp Án'))
    expect(button('In Cả Lớp (4 em)')).toBeDisabled()
    fireEvent.click(button('Xuất PDF'))
    expect(printedPapers(pdf.mock.calls[1]?.[0] ?? '')).toEqual([{ student: ['', ''], version: 'B (102)', hasAnswerKey: true }])
  })

  it('keeps mobile all-version templates separate from the class PDF', () => {
    view.mode = 'mobile'
    const pdf = vi.spyOn(ReportExportService, 'exportPdf').mockImplementation(() => {})
    openPaper()
    fireEvent.click(button('Đề A4'))
    fireEvent.click(button('Lớp (4)'))
    fireEvent.click(button('Tất cả'))
    expect(button('Lớp (4)')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(button('PDF'))
    expect(printedPapers(pdf.mock.calls[0]?.[0] ?? '')).toEqual([
      { student: ['', ''], version: 'A (101)', hasAnswerKey: false },
      { student: ['', ''], version: 'B (102)', hasAnswerKey: false },
    ])

    fireEvent.click(button('Lớp (4)'))
    fireEvent.click(button('PDF'))
    expect(printedPapers(pdf.mock.calls[1]?.[0] ?? '').map(paper => paper.student)).toEqual(students.map(({ name, code }) => [name, code]))
  })
})
