import { describe, it, expect } from 'vitest'
import {
  buildBatchExamPapersHtml,
  buildBatchAnswerSheetsHtml,
  type StudentSheetInfo,
  type ExamPaperPrintOptions,
  type BatchAnswerSheetParams,
} from '../utils/examSheets'
import { buildExamQrPayload, generateExamQrDataUrl, generateExamQrSvg } from '../lib/qr'
import type { ExamQuestion, ExamVersionCode } from '../types'

describe('examAlternatingVariants', () => {
  const students: StudentSheetInfo[] = [
    { id: 'ST-00000001', code: 'TN001', name: 'Nguyễn Văn A' },
    { id: 'ST-00000002', code: 'TN002', name: 'Trần Thị B' },
    { id: 'ST-00000003', code: 'TN003', name: 'Lê Văn C' },
    { id: 'ST-00000004', code: 'TN004', name: 'Phạm Thị D' },
    { id: 'ST-00000005', code: 'TN005', name: 'Hoàng Văn E' },
    { id: 'ST-006', code: 'TN006', name: 'Lý Văn G' },
  ]

  const baseQuestions: ExamQuestion[] = [
    { index: 1, question: 'Câu 1?', options: { A: '1A', B: '1B', C: '1C', D: '1D' }, correctOption: 'A' },
    { index: 2, question: 'Câu 2?', options: { A: '2A', B: '2B', C: '2C', D: '2D' }, correctOption: 'B' },
  ]

  const variantBQuestions: ExamQuestion[] = [
    { index: 1, question: 'Câu 2 (đảo)?', options: { A: '2A', B: '2B', C: '2C', D: '2D' }, correctOption: 'B' },
    { index: 2, question: 'Câu 1 (đảo)?', options: { A: '1A', B: '1B', C: '1C', D: '1D' }, correctOption: 'A' },
  ]

  const variantCQuestions: ExamQuestion[] = [
    { index: 1, question: 'Câu 1 mã C?', options: { A: '1A', B: '1B', C: '1C', D: '1D' }, correctOption: 'C' },
    { index: 2, question: 'Câu 2 mã C?', options: { A: '2A', B: '2B', C: '2C', D: '2D' }, correctOption: 'D' },
  ]

  describe('buildBatchExamPapersHtml', () => {
    it('cycles through 3 materialized versions and prints code A for an unversioned QR', () => {
      const options: ExamPaperPrintOptions = {
        sessionId: 'EXS-00000001',
        subject: 'Giáo Lý',
        classLabel: 'Khai Tâm 1',
        academicYear: '2026-2027',
        questions: baseQuestions,
        variants: [
          { examVersion: 'A', questions: baseQuestions },
          { examVersion: 'B', questions: variantBQuestions },
          { examVersion: 'C', questions: variantCQuestions },
        ],
      }

      const html = buildBatchExamPapersHtml(students, options)
      const document = new DOMParser().parseFromString(html, 'text/html')
      const pages = Array.from(document.querySelectorAll('.batch-exam-page'))

      expect(pages).toHaveLength(6)

      const expectedCodes = ['A (101)', 'B (102)', 'C (103)', 'A (101)', 'B (102)', 'A (101)']
      const expectedVersions: ExamVersionCode[] = ['A', 'B', 'C', 'A', 'B', 'A']

      pages.forEach((page, index) => {
        const student = students[index]
        const text = page.textContent ?? ''

        // Họ tên và mã thiếu nhi đúng từng học sinh
        expect(text).toContain(student.name)
        expect(text).toContain(student.code)

        // Nhãn mã đề
        expect(text).toContain(`Mã đề: ${expectedCodes[index]}`)

        const payload = buildExamQrPayload('EXS-00000001', student.id, {
          templateMode: 'integrated', questionCount: 2, examVersion: expectedVersions[index],
        })
        expect(page.querySelector('.qr-box img')?.getAttribute('src')).toBe(generateExamQrDataUrl(payload))

        // Kiểm tra nội dung câu hỏi đầu tiên của từng mã đề
        if (expectedVersions[index] === 'A') {
          expect(text).toContain('Câu 1?')
        } else if (expectedVersions[index] === 'B') {
          expect(text).toContain('Câu 2 (đảo)?')
        } else if (expectedVersions[index] === 'C') {
          expect(text).toContain('Câu 1 mã C?')
        }
      })
    })

    it('falls back to single examVersion when variants is omitted', () => {
      const options: ExamPaperPrintOptions = {
        sessionId: 'EXS-00000001',
        subject: 'Giáo Lý',
        classLabel: 'Khai Tâm 1',
        academicYear: '2026-2027',
        examVersion: 'B',
        questions: baseQuestions,
      }

      const html = buildBatchExamPapersHtml(students.slice(0, 2), options)
      const document = new DOMParser().parseFromString(html, 'text/html')
      const pages = Array.from(document.querySelectorAll('.batch-exam-page'))

      expect(pages).toHaveLength(2)
      expect(pages[0].textContent).toContain('Mã đề: B (102)')
      expect(pages[1].textContent).toContain('Mã đề: B (102)')
    })
  })

  describe('buildBatchAnswerSheetsHtml', () => {
    it('alternates detached sheets with T3 and falls back to code A for a legacy identity', () => {
      const params: BatchAnswerSheetParams = {
        sessionId: 'EXS-00000001',
        subject: 'Khảo Sát',
        scoreTypeLabel: '15 Phút',
        classLabel: 'Bao Đồng 1',
        maxScore: 10,
        examType: 'multiple_choice',
        questionCount: 20,
        variants: ['A', 'B'],
      }

      const html = buildBatchAnswerSheetsHtml(students, params)
      const document = new DOMParser().parseFromString(html, 'text/html')
      const pages = Array.from(document.querySelectorAll('.answer-sheet-page'))

      expect(pages).toHaveLength(6)

      const expectedCodes = ['A (101)', 'B (102)', 'A (101)', 'B (102)', 'A (101)', 'A (101)']
      const expectedVersions: ExamVersionCode[] = ['A', 'B', 'A', 'B', 'A', 'A']

      pages.forEach((page, index) => {
        const student = students[index]
        const header = page.querySelector('text[font-size="15"]')?.textContent ?? ''
        const name = page.querySelector('tspan[fill="#1E3A8A"]')?.textContent ?? ''
        const code = page.querySelector('tspan[fill="#0F172A"]')?.textContent ?? ''

        expect(name).toBe(student.name)
        expect(code).toBe(student.code)
        expect(header).toContain(`Mã đề: ${expectedCodes[index]}`)

        const payload = buildExamQrPayload(params.sessionId, student.id, {
          templateMode: 'full_page', questionCount: 20, examVersion: expectedVersions[index],
        })
        const expectedQr = new DOMParser().parseFromString(generateExamQrSvg(payload), 'image/svg+xml')
        expect(page.querySelector('svg > svg path')?.getAttribute('d')).toBe(expectedQr.querySelector('path')?.getAttribute('d'))
      })
    })
  })
})
