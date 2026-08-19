import { describe, it, expect, vi } from 'vitest'
import * as XLSX from 'xlsx'
import {
  generateExamWordHtml,
  generateBatchExamWordHtml,
  generateExamExcelWorkbook,
  exportExamToText,
  exportExamToMarkdown,
  generateExamJsonString,
  exportExamToJson,
  resolveExportQuestions,
  exportExamToWord,
  exportExamToExcel,
  downloadExamText,
  downloadExamMarkdown,
} from '../utils/examExporter'
import type { ExamQuestion } from '../types'
import { ExamPrintIntegrityError } from '../lib/examPrintSafety'

describe('examExporter', () => {
  const sampleQuestions: ExamQuestion[] = [
    {
      index: 1,
      question: 'Thiên Chúa sáng tạo trời đất trong mấy ngày?',
      options: {
        A: '5 ngày',
        B: '6 ngày',
        C: '7 ngày',
        D: '8 ngày',
      },
      correctOption: 'B',
      explanation: 'Sách Sáng Thế ghi nhận Thiên Chúa hoàn tất công trình trong 6 ngày và nghỉ ngày thứ 7.',
    },
    {
      index: 2,
      question: 'Bí tích nào là khởi đầu đời sống Kitô hữu?',
      options: {
        A: 'Thánh Thể',
        B: 'Thêm Sức',
        C: 'Rửa Tội',
        D: 'Giải Tội',
      },
      correctOption: 'C',
    },
  ]

  describe('resolveExportQuestions', () => {
    it('returns provided questions if available', () => {
      const resolved = resolveExportQuestions({
        subject: 'Test',
        questions: sampleQuestions,
        questionCount: 2,
        answerKey: { 1: 'B', 2: 'C' },
      })
      expect(resolved).toHaveLength(2)
      expect(resolved[0].question).toBe('Thiên Chúa sáng tạo trời đất trong mấy ngày?')
      expect(resolved[0].correctOption).toBe('B')
      expect(resolved[1].correctOption).toBe('C')
    })

    it('generates fallback questions when question list is empty', () => {
      const resolved = resolveExportQuestions({
        subject: 'Fallback',
        questions: [],
        questionCount: 3,
        answerKey: { 1: 'A', 2: 'B', 3: 'C' },
      })
      expect(resolved).toHaveLength(3)
      expect(resolved[0].question).toContain('Câu 1')
      expect(resolved[0].correctOption).toBe('A')
      expect(resolved[1].correctOption).toBe('B')
      expect(resolved[2].correctOption).toBe('C')
    })
  })

  describe('generateExamWordHtml', () => {
    it('generates teacher answer-key Word HTML but strips scan-valid OMR markers', () => {
      const html = generateExamWordHtml({
        parishName: 'Giáo Xứ Mẫu Tâm',
        dioceseName: 'Tổng Giáo Phận Sài Gòn',
        subject: 'Khảo Sát Giáo Lý Khối Thêm Sức',
        classLabel: 'Thêm Sức 2',
        academicYear: '2025-2026',
        semester: 1,
        durationMinutes: 45,
        questions: sampleQuestions,
        includeAnswerKey: true,
        includeExplanations: true,
        includeStudentInfo: true,
        includeQuickAnswerGrid: true,
        layoutColumns: 2,
        selectedVersion: 'A',
      })

      expect(html).toContain('Giáo Xứ Mẫu Tâm')
      expect(html).toContain('Tổng Giáo Phận Sài Gòn')
      expect(html).toContain('Khảo Sát Giáo Lý Khối Thêm Sức')
      expect(html).toContain('Thêm Sức 2')
      expect(html).toContain('Mã đề: <strong>A</strong>')
      expect(html).toContain('Thiên Chúa sáng tạo trời đất trong mấy ngày?')
      expect(html).toContain('Bí tích nào là khởi đầu đời sống Kitô hữu?')
      expect(html).toContain('BẢNG ĐÁP ÁN CHUẨN DÀNH CHO GIÁO LÝ VIÊN')
      expect(html).toContain('Sách Sáng Thế ghi nhận')
      expect(html).toContain('BẢNG TRẢ LỜI TRẮC NGHIỆM')
      expect(html).toContain('ĐÁP ÁN GLV — KHÔNG CHẤM')
      expect(html).not.toContain('omr-corner-marker')
    })

    it('omits answer key when includeAnswerKey is false and keeps foreground SVG markers', () => {
      const html = generateExamWordHtml({
        subject: 'Kiểm tra 15 phút',
        classLabel: 'Ấu 1',
        academicYear: '2025-2026',
        questions: sampleQuestions,
        includeAnswerKey: false,
        includeStudentInfo: false,
      })

      expect(html).not.toContain('BẢNG ĐÁP ÁN CHUẨN')
      expect(html).not.toContain('Họ & tên:')
      expect(html).toContain('Kiểm tra 15 phút')
      expect(html.match(/<svg class="omr-corner-marker/g)).toHaveLength(4)
      expect(html).not.toContain('<div class="omr-corner-marker')
    })

    it('fails closed when source question indexes have duplicate or gap', () => {
      const malformed: ExamQuestion[] = [
        { ...sampleQuestions[0], index: 1 },
        { ...sampleQuestions[1], index: 3 },
      ]
      expect(() => generateExamWordHtml({
        subject: 'Broken OMR',
        classLabel: 'Lớp 1',
        academicYear: '2026-2027',
        questions: malformed,
        includeQuickAnswerGrid: true,
      })).toThrow(ExamPrintIntegrityError)
    })

    it('falls back from stale selected version to an actually configured version', () => {
      const html = generateExamWordHtml({
        subject: 'Version guard',
        classLabel: 'Lớp 1',
        academicYear: '2026-2027',
        questions: sampleQuestions,
        answerVariants: { A: { 1: 'B', 2: 'C' } },
        selectedVersion: 'B',
        includeAnswerKey: false,
      })
      expect(html).toContain('Mã đề: <strong>A</strong>')
      expect(html).not.toContain('Mã đề: <strong>B</strong>')
    })

    it('generates multi-student batch Word HTML with distinct QR codes and names', () => {
      const students = [
        { id: 'st-1', code: 'TN-001', name: 'Nguyễn Văn A' },
        { id: 'st-2', code: 'TN-002', name: 'Trần Thị B' },
      ]
      const html = generateBatchExamWordHtml(students, {
        subject: 'Khảo Sát Giáo Lý',
        classLabel: 'Khai Tâm 1',
        academicYear: '2025-2026',
        questions: sampleQuestions,
        includeAnswerKey: false,
      })

      expect(html).toContain('Nguyễn Văn A')
      expect(html).toContain('TN-001')
      expect(html).toContain('Trần Thị B')
      expect(html).toContain('TN-002')
      expect(html).toContain('page-break-after: always')
      expect(html.match(/<svg class="omr-corner-marker/g)?.length).toBeGreaterThanOrEqual(8)
    })
  })

  describe('generateExamExcelWorkbook', () => {
    it('creates workbook with questions, answer keys matrix, and metadata sheets', () => {
      const bytes = generateExamExcelWorkbook({
        subject: 'Kiểm Tra Học Kỳ 1',
        classLabel: 'Khai Tâm 3',
        academicYear: '2025-2026',
        semester: 1,
        questions: sampleQuestions,
        questionCount: 2,
        answerKey: { 1: 'B', 2: 'C' },
        answerVariants: {
          A: { 1: 'B', 2: 'C' },
          B: { 1: 'C', 2: 'D' },
        },
        includeAnswerKey: true,
        includeExplanations: true,
      })

      expect(bytes).toBeInstanceOf(Uint8Array)
      const wb = XLSX.read(bytes, { type: 'array' })
      expect(wb.SheetNames).toContain('Danh_Sach_Cau_Hoi')
      expect(wb.SheetNames).toContain('Bang_Dap_An_Ma_De')
      expect(wb.SheetNames).toContain('Thong_Tin_De_Thi')

      const qSheet = wb.Sheets['Danh_Sach_Cau_Hoi']
      expect(qSheet).toBeDefined()
    })
  })

  describe('exportExamToText', () => {
    it('formats plain text output correctly with questions and answer key', () => {
      const text = exportExamToText({
        parishName: 'Giáo Xứ Mẫu Tâm',
        dioceseName: 'Tổng Giáo Phận Sài Gòn',
        subject: 'Kiểm tra Giáo Lý',
        classLabel: 'Bao Đồng 1',
        academicYear: '2025-2026',
        durationMinutes: 30,
        questions: sampleQuestions,
        includeAnswerKey: true,
        includeExplanations: true,
        includeStudentInfo: true,
        selectedVersion: 'B',
      })

      expect(text).toContain('GIÁO XỨ MẪU TÂM')
      expect(text).toContain('KIỂM TRA GIÁO LÝ')
      expect(text).toContain('Mã đề: B')
      expect(text).toContain('Câu 1: Thiên Chúa sáng tạo trời đất trong mấy ngày?')
      expect(text).toContain('A. 5 ngày')
      expect(text).toContain('B. 6 ngày')
      expect(text).toContain('BẢNG ĐÁP ÁN & HƯỚNG DẪN CHẤM (MÃ ĐỀ B):')
      expect(text).toContain('1.B')
      expect(text).toContain('2.C')
      expect(text).toContain('Sách Sáng Thế ghi nhận')
    })
  })

  describe('exportExamToMarkdown', () => {
    it('formats Markdown with tables and headers', () => {
      const md = exportExamToMarkdown({
        parishName: 'Giáo Xứ Mẫu Tâm',
        dioceseName: 'Tổng Giáo Phận Sài Gòn',
        subject: 'Đề Thi Giáo Lý',
        classLabel: 'Vào Đời 1',
        academicYear: '2025-2026',
        questions: sampleQuestions,
        includeAnswerKey: true,
        includeExplanations: true,
        includeStudentInfo: true,
        selectedVersion: 'A',
      })

      expect(md).toContain('## ĐỀ KIỂM TRA: ĐỀ THI GIÁO LÝ')
      expect(md).toContain('**Lớp**: Vào Đời 1')
      expect(md).toContain('#### Câu 1: Thiên Chúa sáng tạo trời đất trong mấy ngày?')
      expect(md).toContain('| Câu | Đáp Án | Nội Dung |')
      expect(md).toContain('| **1** | **B** | 6 ngày |')
      expect(md).toContain('| **2** | **C** | Rửa Tội |')
      expect(md).toContain('### 💡 Hướng Dẫn Giải Chi Tiết')
    })
  })

  describe('generateExamJsonString', () => {
    it('exports structured JSON data', () => {
      const jsonStr = generateExamJsonString({
        subject: 'Trắc nghiệm JSON',
        classLabel: 'Lớp 5',
        academicYear: '2025-2026',
        questions: sampleQuestions,
        questionCount: 2,
        answerKey: { 1: 'B', 2: 'C' },
        answerVariants: { A: { 1: 'B', 2: 'C' } },
        maxScore: 10,
      })

      const parsed = JSON.parse(jsonStr)
      expect(parsed.metadata.subject).toBe('Trắc nghiệm JSON')
      expect(parsed.metadata.classLabel).toBe('Lớp 5')
      expect(parsed.metadata.questionCount).toBe(2)
      expect(parsed.questions).toHaveLength(2)
      expect(parsed.answerKey).toEqual({ '1': 'B', '2': 'C' })
      expect(parsed.answerVariants).toEqual({ A: { '1': 'B', '2': 'C' } })
    })
  })

  describe('Client-side download wrappers', () => {
    it('executes download functions without throwing', () => {
      const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
      const revokeObjectURLMock = vi.fn()
      globalThis.URL.createObjectURL = createObjectURLMock
      globalThis.URL.revokeObjectURL = revokeObjectURLMock

      expect(() => {
        downloadExamText({
          subject: 'Test',
          classLabel: 'Lớp 1',
          academicYear: '2025-2026',
          questions: sampleQuestions,
        })
      }).not.toThrow()

      expect(() => {
        downloadExamMarkdown({
          subject: 'Test',
          classLabel: 'Lớp 1',
          academicYear: '2025-2026',
          questions: sampleQuestions,
        })
      }).not.toThrow()

      expect(() => {
        exportExamToWord({
          subject: 'Test Word',
          classLabel: 'Lớp 1',
          academicYear: '2025-2026',
          questions: sampleQuestions,
        })
      }).not.toThrow()

      expect(() => {
        exportExamToExcel({
          subject: 'Test Excel',
          classLabel: 'Lớp 1',
          academicYear: '2025-2026',
          questions: sampleQuestions,
        })
      }).not.toThrow()

      expect(() => {
        exportExamToJson({
          subject: 'Test JSON',
          classLabel: 'Lớp 1',
          academicYear: '2025-2026',
          questions: sampleQuestions,
        })
      }).not.toThrow()
    })
  })
})
