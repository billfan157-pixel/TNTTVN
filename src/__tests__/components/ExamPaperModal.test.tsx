import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { ExamPaperModal } from '../../components/exam/ExamPaperModal'
import { ReportExportService } from '../../services/reportExportService'
import { generateExamVariantManifest } from '../../../server/src/services/examVariantManifest'

const view = vi.hoisted(() => ({ mode: 'desktop' }))
vi.mock('../../hooks/useEffectiveMode', () => ({ useEffectiveMode: () => view.mode }))

const students = [
  { id: 'ST-00000001', code: 'TN001', name: 'Nguyễn Minh Anh' },
  { id: 'ST-00000002', code: 'TN002', name: 'Trần Quốc Bảo' },
  { id: 'ST-00000003', code: 'TN003', name: 'Nguyễn Minh Anh' },
  { id: 'ST-00000004', code: 'TN004', name: 'Đỗ Mỹ & An' },
]
const questions = [
  { index: 1, question: 'Chọn số một.', options: { A: 'Một', B: 'Hai', C: 'Ba', D: 'Bốn' }, correctOption: 'A' as const },
  { index: 2, question: 'Chọn số sáu.', options: { A: 'Năm', B: 'Sáu', C: 'Bảy', D: 'Tám' }, correctOption: 'B' as const },
]
const variantManifests = generateExamVariantManifest({
  questions, questionCount: 2, variantCount: 2, shuffleMode: 'questions_only', seed: 'batch-print',
})

type PaperOverrides = Pick<ComponentProps<typeof ExamPaperModal>, 'variantManifests' | 'answerVariants' | 'sessionId'>

function openPaper(overrides: PaperOverrides = {}) {
  render(<ExamPaperModal isOpen onClose={() => {}} subject="Kiểm tra" classLabel="Thiếu Nhi 2A"
    academicYear="2026-2027" questions={questions} questionCount={questions.length} students={students}
    sessionId="EXS-00000001" variantManifests={variantManifests} {...overrides} />)
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
  it('prints and exports every named copy when one code is selected for the class', () => {
    const print = vi.spyOn(ReportExportService, 'print').mockImplementation(() => {})
    const pdf = vi.spyOn(ReportExportService, 'exportPdf').mockImplementation(() => {})
    const html = vi.spyOn(ReportExportService, 'downloadHTML').mockImplementation(() => {})
    openPaper()

    fireEvent.click(button('Tất cả (2)'))
    fireEvent.click(button('In Cả Lớp (4 em)'))
    fireEvent.click(button('B (102)'))
    expect(button('B (102)')).toHaveAttribute('aria-pressed', 'true')

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
    expect(printedPapers(pdf.mock.calls[1]?.[0] ?? '')).toEqual(students.map(({ name, code }, index) => ({
      student: [name, code], version: index % 2 === 0 ? 'A (101)' : 'B (102)', hasAnswerKey: false,
    })))
  })

  it('automatically alternates variants across students when printing for the whole class', () => {
    const print = vi.spyOn(ReportExportService, 'print').mockImplementation(() => {})
    const pdf = vi.spyOn(ReportExportService, 'exportPdf').mockImplementation(() => {})
    const html = vi.spyOn(ReportExportService, 'downloadHTML').mockImplementation(() => {})
    openPaper()

    fireEvent.click(button('In Cả Lớp (4 em)'))
    expect(button('Xen kẽ (2)')).toHaveAttribute('aria-pressed', 'true')
    expect(button('A (101)')).toHaveAttribute('aria-pressed', 'false')
    expect(button('Xuất Excel')).toBeDisabled()

    // Preview kiểm tra 2 bản xem trước được xen kẽ A, B
    const preview = screen.getByTitle('Xem trước tài liệu kiểm tra').getAttribute('srcdoc') ?? ''
    expect(printedPapers(preview)).toEqual([
      { student: [students[0].name, students[0].code], version: 'A (101)', hasAnswerKey: false },
      { student: [students[1].name, students[1].code], version: 'B (102)', hasAnswerKey: false },
    ])
    expect(screen.getByText(/Xen kẽ mã đề A → B/)).toBeVisible()

    // In cả lớp xen kẽ
    const expectedAlternating = [
      { student: [students[0].name, students[0].code], version: 'A (101)', hasAnswerKey: false },
      { student: [students[1].name, students[1].code], version: 'B (102)', hasAnswerKey: false },
      { student: [students[2].name, students[2].code], version: 'A (101)', hasAnswerKey: false },
      { student: [students[3].name, students[3].code], version: 'B (102)', hasAnswerKey: false },
    ]

    fireEvent.click(button('In Cả Lớp (4 Bản — Xen kẽ)'))
    expect(printedPapers(print.mock.calls[0]?.[0] ?? '')).toEqual(expectedAlternating)

    fireEvent.click(button('Xuất PDF (4 Bản — Xen kẽ)'))
    expect(printedPapers(pdf.mock.calls[0]?.[0] ?? '')).toEqual(expectedAlternating)
    expect(pdf.mock.calls[0]?.[1]).toContain('_XenKeMaDe')

    fireEvent.click(button('Tải HTML (4 Bản — Xen kẽ)'))
    expect(printedPapers(html.mock.calls[0]?.[0] ?? '')).toEqual(expectedAlternating)
    expect(html.mock.calls[0]?.[1]).toContain('_XenKeMaDe')

    const output = new DOMParser().parseFromString(print.mock.calls[0]?.[0] ?? '', 'text/html')
    expect(Array.from(output.querySelectorAll('.batch-exam-page .question-title'), title => title.textContent?.trim())).toEqual([
      'Câu 1: Chọn số một.', 'Câu 2: Chọn số sáu.',
      'Câu 1: Chọn số sáu.', 'Câu 2: Chọn số một.',
      'Câu 1: Chọn số một.', 'Câu 2: Chọn số sáu.',
      'Câu 1: Chọn số sáu.', 'Câu 2: Chọn số một.',
    ])

    fireEvent.click(button('Ẩn Đáp Án'))
    expect(button('In Cả Lớp (4 em)')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Xen kẽ (2)' })).not.toBeInTheDocument()
  })

  it('supports alternating variants on mobile when exporting detached answer sheets', () => {
    view.mode = 'mobile'
    const pdf = vi.spyOn(ReportExportService, 'exportPdf').mockImplementation(() => {})
    openPaper()

    fireEvent.click(button('Phiếu A4'))
    fireEvent.click(button('Lớp (4)'))
    expect(button('Xen kẽ')).toHaveAttribute('aria-pressed', 'true')
    expect(button('Lớp (4)')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(button('PDF'))
    const exportedHtml = pdf.mock.calls[0]?.[0] ?? ''
    const document = new DOMParser().parseFromString(exportedHtml, 'text/html')
    const pages = Array.from(document.querySelectorAll('.answer-sheet-page'), page => {
      const headerText = page.querySelector('text[font-size="15"]')?.textContent ?? ''
      const studentName = page.querySelector('tspan[fill="#1E3A8A"]')?.textContent ?? ''
      return { headerText, studentName }
    })

    expect(pages).toHaveLength(4)
    expect(pages[0].studentName).toBe(students[0].name)
    expect(pages[0].headerText).toContain('Mã đề: A (101)')
    expect(pages[1].studentName).toBe(students[1].name)
    expect(pages[1].headerText).toContain('Mã đề: B (102)')
    expect(pages[2].studentName).toBe(students[2].name)
    expect(pages[2].headerText).toContain('Mã đề: A (101)')
    expect(pages[3].studentName).toBe(students[3].name)
    expect(pages[3].headerText).toContain('Mã đề: B (102)')
  })

  it('keeps legacy papers on code A and alternates configured external codes only on detached sheets', () => {
    const pdf = vi.spyOn(ReportExportService, 'exportPdf').mockImplementation(() => {})
    openPaper({ variantManifests: undefined, answerVariants: { A: { 1: 'A', 2: 'B' }, C: { 1: 'B', 2: 'A' } } })

    fireEvent.click(button('In Cả Lớp (4 em)'))
    fireEvent.click(button('Xuất PDF (4 Bản)'))
    expect(printedPapers(pdf.mock.calls[0]?.[0] ?? '').map(paper => paper.version)).toEqual(['A (101)', 'A (101)', 'A (101)', 'A (101)'])

    fireEvent.click(button('2. Phiếu Trả Lời Rời A4'))
    fireEvent.click(button('Xuất PDF (4 Bản — Xen kẽ)'))
    const output = new DOMParser().parseFromString(pdf.mock.calls[1]?.[0] ?? '', 'text/html')
    const labels = Array.from(output.querySelectorAll('.answer-sheet-page text[font-size="15"]'), header => header.textContent?.split(' · Mã đề: ').at(-1))
    expect(labels).toEqual(['A (101)', 'C (103)', 'A (101)', 'C (103)'])
  })

  it('defaults a class with legacy session QR to code A when entering automatic class mode', () => {
    const print = vi.spyOn(ReportExportService, 'print').mockImplementation(() => {})
    openPaper({ sessionId: 'EXS-LEGACY' })

    fireEvent.click(button('B (102)'))
    fireEvent.click(button('In Cả Lớp (4 em)'))
    expect(screen.getByText(/4 học sinh dùng mã A để tương thích QR cũ/)).toBeVisible()
    fireEvent.click(button('In Cả Lớp (4 Bản)'))
    expect(printedPapers(print.mock.calls[0]?.[0] ?? '').map(paper => paper.version)).toEqual(['A (101)', 'A (101)', 'A (101)', 'A (101)'])
  })
})
