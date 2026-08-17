import { describe, it, expect, vi } from 'vitest'
import {
  getMcColumnLayout,
  mcOptionToCell,
  allMcCells,
  allCells,
  scoreToCell,
  CORNER_MARKERS,
} from '../lib/answerSheetTemplate'
import {
  buildSingleAnswerSheetSvgString,
  buildBatchAnswerSheetsHtml,
  printBatchAnswerSheets,
  buildExamPaperHtml,
  buildBatchExamPapersHtml,
  printBatchExamPapers,
} from '../utils/examSheets'
import { ReportExportService } from '../services/reportExportService'

describe('Answer Sheet Template & Batch Print Engine', () => {
  it('định nghĩa đúng 4 corner markers ở các góc homography chuẩn', () => {
    expect(CORNER_MARKERS.length).toBe(4)
    expect(CORNER_MARKERS.map(m => m.id)).toEqual(['TL', 'TR', 'BR', 'BL'])
    expect(CORNER_MARKERS[0]).toEqual({ id: 'TL', x: 0.05, y: 0.30 })
    expect(CORNER_MARKERS[2]).toEqual({ id: 'BR', x: 0.95, y: 0.93 })
  })

  it('tính toán getMcColumnLayout linh hoạt cho các bộ đề 10, 20, 30, 40, 50 câu', () => {
    const layout10 = getMcColumnLayout(10)
    expect(layout10.cols).toBe(2)
    expect(layout10.qPerCol).toBe(5)

    const layout20 = getMcColumnLayout(20)
    expect(layout20.cols).toBe(3)
    expect(layout20.qPerCol).toBe(7)

    const layout40 = getMcColumnLayout(40)
    expect(layout40.cols).toBe(4)
    expect(layout40.qPerCol).toBe(10)
  })

  it('tọa độ mcOptionToCell nằm chính xác trong vùng OMR (0.05..0.95)', () => {
    const totalQuestions = 30
    const cell1A = mcOptionToCell(1, 'A', totalQuestions)
    const cell1D = mcOptionToCell(1, 'D', totalQuestions)
    const cell30D = mcOptionToCell(30, 'D', totalQuestions)

    expect(cell1A.x).toBeGreaterThan(0.05)
    expect(cell1A.x).toBeLessThan(cell1D.x)
    expect(cell30D.x).toBeLessThan(0.95)
    expect(cell30D.y).toBeLessThan(0.93)
  })

  it('allMcCells tạo ra đúng số lượng ô trắc nghiệm (totalQuestions * 4)', () => {
    const cells20 = allMcCells(20)
    expect(cells20.length).toBe(80)

    const cells50 = allMcCells(50)
    expect(cells50.length).toBe(200)
  })

  it('scoreToCell tạo ra tọa độ chính xác cho thang điểm 0..10', () => {
    const cell0 = scoreToCell(0)
    const cell10 = scoreToCell(10)
    expect(cell0.score).toBe(0)
    expect(cell10.score).toBe(10)
    expect(cell0.row).toBe(0)
    expect(cell10.row).toBe(1)
  })

  it('buildSingleAnswerSheetSvgString tạo ra SVG hợp lệ có chứa họ tên, mã QR, corner markers', () => {
    const student = { id: 'ST-001', code: 'TN2026001', name: 'Nguyễn Văn A' }
    const params = {
      sessionId: 'SESS-123',
      subject: 'Giáo Lý Căn Bản',
      scoreTypeLabel: 'Thi Học Kỳ 1',
      classLabel: 'Khai Tâm 1',
      maxScore: 10,
      examType: 'multiple_choice' as const,
      questionCount: 20,
    }

    const svg = buildSingleAnswerSheetSvgString(student, params)
    expect(svg).toContain('<svg')
    expect(svg).toContain('Nguyễn Văn A')
    expect(svg).toContain('TN2026001')
    expect(svg).toContain('PHIẾU TRẢ LỜI KIỂM TRA')
    expect(svg).toContain('MÃ QUÉT CHẤM TỰ ĐỘNG')
    expect(svg).toContain('câu 1:')
  })

  it('buildBatchAnswerSheetsHtml tạo tài liệu HTML đa trang với CSS break-after page', () => {
    const students = [
      { id: 'ST-001', code: 'TN001', name: 'Học Viên 1' },
      { id: 'ST-002', code: 'TN002', name: 'Học Viên 2' },
    ]
    const params = {
      sessionId: 'SESS-123',
      subject: 'Kinh Thánh',
      scoreTypeLabel: 'Kiểm Tra 15 Phút',
      classLabel: 'Ấu Nhi 2',
      maxScore: 10,
      examType: 'written' as const,
    }

    const html = buildBatchAnswerSheetsHtml(students, params)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Học Viên 1')
    expect(html).toContain('Học Viên 2')
    expect(html).toContain('page-break-after: always')
    expect(html).toContain('break-after: page')
  })

  it('printBatchAnswerSheets delegates HTML batch payload to ReportExportService.print', () => {
    const students = [{ id: 'ST-001', code: 'TN001', name: 'Học Viên 1' }]
    const params = {
      sessionId: 'SESS-123',
      subject: 'Kinh Thánh',
      scoreTypeLabel: 'Kiểm Tra 15 Phút',
      classLabel: 'Ấu Nhi 2',
      maxScore: 10,
      examType: 'written' as const,
    }

    const spy = vi.spyOn(ReportExportService, 'print').mockImplementation(() => {})
    printBatchAnswerSheets(students, params)
    expect(spy).toHaveBeenCalledTimes(1)
    const passedHtml = spy.mock.calls[0][0]
    expect(passedHtml).toContain('Học Viên 1')
    expect(passedHtml).toContain('PHIẾU TRẢ LỜI KIỂM TRA')
    spy.mockRestore()
  })

  describe('Integrated Exam Paper & Batch Printing', () => {
    const mockQuestions = [
      { index: 1, question: 'Ai là Đấng sáng tạo trời đất?', options: { A: 'Thiên Chúa', B: 'Con người', C: 'Thiên thần', D: 'Vạn vật' }, correctOption: 'A' as const },
      { index: 2, question: 'Chúa Giêsu sinh ra ở đâu?', options: { A: 'Nazareth', B: 'Bethlehem', C: 'Jerusalem', D: 'Roma' }, correctOption: 'B' as const },
    ]

    it('buildExamPaperHtml tạo HTML đề thi gộp khung OMR, thông tin học sinh và bảng điểm', () => {
      const html = buildExamPaperHtml({
        subject: 'Khảo Sát Kinh Thánh',
        classLabel: 'Khai Tâm 1',
        academicYear: '2025-2026',
        questions: mockQuestions,
        includeAnswerGrid: true,
        includeGradingBox: true,
        layoutColumns: 2,
        student: { id: 'ST-001', code: 'TN001', name: 'Maria Nguyễn Văn A' },
      })

      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('Khảo Sát Kinh Thánh')
      expect(html).toContain('Maria Nguyễn Văn A')
      expect(html).toContain('TN001')
      expect(html).toContain('omr-corner-marker omr-marker-tl')
      expect(html).toContain('omr-corner-marker omr-marker-br')
      expect(html).toContain('BẢNG TRẢ LỜI TRẮC NGHIỆM')
      expect(html).toContain('Ai là Đấng sáng tạo trời đất?')
      expect(html).toContain('TRẮC NGHIỆM')
      expect(html).toContain('LỜI PHÊ')
    })

    it('buildBatchExamPapersHtml tạo HTML in hàng loạt cho toàn bộ học sinh trong lớp', () => {
      const students = [
        { id: 'ST-001', code: 'TN001', name: 'Em 1' },
        { id: 'ST-002', code: 'TN002', name: 'Em 2' },
        { id: 'ST-003', code: 'TN003', name: 'Em 3' },
      ]

      const html = buildBatchExamPapersHtml(students, {
        subject: 'Thi Học Kỳ 1',
        classLabel: 'Ấu Nhi 1',
        academicYear: '2025-2026',
        questions: mockQuestions,
      })

      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('Em 1')
      expect(html).toContain('Em 2')
      expect(html).toContain('Em 3')
      expect(html).toContain('class="batch-exam-page"')
      expect(html).toContain('page-break-after: always')
    })

    it('printBatchExamPapers gửi nội dung in tới ReportExportService.print', () => {
      const students = [{ id: 'ST-001', code: 'TN001', name: 'Em 1' }]
      const spy = vi.spyOn(ReportExportService, 'print').mockImplementation(() => {})

      printBatchExamPapers(students, {
        subject: 'Thi Học Kỳ 1',
        classLabel: 'Ấu Nhi 1',
        academicYear: '2025-2026',
        questions: mockQuestions,
      })

      expect(spy).toHaveBeenCalledTimes(1)
      const content = spy.mock.calls[0][0]
      expect(content).toContain('Em 1')
      expect(content).toContain('Thi Học Kỳ 1')
      spy.mockRestore()
    })
  })
})
