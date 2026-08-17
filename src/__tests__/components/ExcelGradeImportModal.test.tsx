import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExcelGradeImportModal } from '../../components/common/ExcelGradeImportModal'

vi.mock('../../utils/excelGradeParser', () => ({
  parseGradeText: vi.fn(),
}))

vi.mock('../../utils/excelImporter', () => ({
  parseGradeFile: vi.fn(),
  buildGradeRecords: vi.fn(),
  countPreservedRows: vi.fn(() => 0),
}))

vi.mock(import('../../utils/grades'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/grades')>()
  return { ...actual, calculateGradeAverage: vi.fn(() => ({ score: 8.5, label: 'Giỏi' })) }
})

vi.mock('../../stores/studentStore', () => ({
  useStudentStore: Object.assign(
    (selector?: any) => {
      const state = { students: [{ id: 'ST-001', code: 'TN-1001', holyName: 'Phê-rô', fullName: 'Nguyễn Văn A', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Cha A', parentPhone: '0901234567', address: 'Giáo Xứ', branch: 'ThieuNhi', classId: 'TN1', status: 'Đang học' }] }
      return selector ? selector(state) : state
    },
    { getState: () => ({ students: [] }), setState: vi.fn() },
  ),
}))

const mockBatchSaveGrades = vi.fn()

vi.mock('../../stores/gradeStore', () => ({
  useGradeStore: Object.assign(
    (selector?: any) => {
      const state = { batchSaveGrades: mockBatchSaveGrades }
      return selector ? selector(state) : state
    },
    { getState: () => ({ grades: [] }), setState: vi.fn() },
  ),
}))

vi.mock('../../stores/academicYearStore', () => ({
  useAcademicYearStore: (selector?: any) => {
    const state = { currentYear: '2025 - 2026' }
    return selector ? selector(state) : state
  },
}))

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

vi.mock('lucide-react', () => ({
  Upload: 'svg', CheckCircle2: 'svg', AlertCircle: 'svg', AlertTriangle: 'svg', X: 'svg', Loader2: 'svg', FileSpreadsheet: 'svg', Clipboard: 'svg', RefreshCw: 'svg', RotateCcw: 'svg',
}))

describe('ExcelGradeImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ExcelGradeImportModal isOpen={false} onClose={vi.fn()} semester={1} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders UI when open', () => {
    render(<ExcelGradeImportModal isOpen={true} onClose={vi.fn()} semester={1} />)
    expect(screen.getByText('Import Bảng Điểm Lớp Từ Excel')).toBeDefined()
    expect(screen.getByText(/Học Kỳ 1/)).toBeDefined()
  })

  it('shows correct semester in title', () => {
    render(<ExcelGradeImportModal isOpen={true} onClose={vi.fn()} semester={2} />)
    expect(screen.getByText(/Học Kỳ 2/)).toBeDefined()
  })

  it('calls onClose when Đóng is clicked', () => {
    const onClose = vi.fn()
    render(<ExcelGradeImportModal isOpen={true} onClose={onClose} semester={1} />)
    fireEvent.click(screen.getByText('Đóng'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when X is clicked', () => {
    const onClose = vi.fn()
    render(<ExcelGradeImportModal isOpen={true} onClose={onClose} semester={1} />)
    const closeBtn = screen.getByLabelText('Đóng')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('paste text triggers grade parsing', async () => {
    const { parseGradeText } = await import('../../utils/excelGradeParser')
    vi.mocked(parseGradeText).mockReturnValue({
      rows: [
        { rowIndex: 1, studentCode: 'TN-1001', fullName: 'Nguyễn Văn A', scoreDaoDuc: null, comments: '', warnings: [], isValid: true, errors: [], scoreOral: 8, score15m: 7, score1Period: null, scoreMidterm: 9, scoreFinal: 8, matchedStudent: { id: 'ST-001', holyName: 'Phê-rô', fullName: 'Nguyễn Văn A', code: 'TN-1001', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Cha A', parentPhone: '0901234567', address: 'Giáo Xứ', branch: 'ThieuNhi', classId: 'TN1', status: 'Đang học' } },
      ],
      matchedCount: 1, unmatchedCount: 0, validCount: 1, errorCount: 0,
      detectedColumns: [], headerRowIndex: 0, diagnosticWarnings: [], inferred: false,
    })

    render(<ExcelGradeImportModal isOpen={true} onClose={vi.fn()} semester={1} />)
    const textarea = screen.getByPlaceholderText(/Dán các cột/)
    fireEvent.change(textarea, { target: { value: 'test data' } })

    expect(parseGradeText).toHaveBeenCalled()
    expect(screen.getByText(/1 Dòng Hợp Lệ/)).toBeDefined()
  })

  it('shows invalid row count when parsing has errors', async () => {
    const { parseGradeText } = await import('../../utils/excelGradeParser')
    vi.mocked(parseGradeText).mockReturnValue({
      rows: [
        { rowIndex: 1, studentCode: '', fullName: '', scoreDaoDuc: null, comments: '', warnings: [], isValid: false, errors: ['Không tìm thấy học sinh'], scoreOral: null, score15m: null, score1Period: null, scoreMidterm: null, scoreFinal: null },
        { rowIndex: 2, studentCode: 'TN-1001', fullName: 'Nguyễn Văn A', scoreDaoDuc: null, comments: '', warnings: [], isValid: true, errors: [], scoreOral: 8, score15m: null, score1Period: null, scoreMidterm: null, scoreFinal: null, matchedStudent: { id: 'ST-001', holyName: 'Phê-rô', fullName: 'Nguyễn Văn A', code: 'TN-1001', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Cha A', parentPhone: '0901234567', address: 'Giáo Xứ', branch: 'ThieuNhi', classId: 'TN1', status: 'Đang học' } },
      ],
      matchedCount: 1, unmatchedCount: 1, validCount: 1, errorCount: 1,
      detectedColumns: [], headerRowIndex: 0, diagnosticWarnings: [], inferred: false,
    })

    render(<ExcelGradeImportModal isOpen={true} onClose={vi.fn()} semester={1} />)
    const textarea = screen.getByPlaceholderText(/Dán các cột/)
    fireEvent.change(textarea, { target: { value: 'test' } })

    expect(screen.getByText(/1 Dòng Hợp Lệ/)).toBeDefined()
    expect(screen.getByText(/1 Dòng Không Khớp/)).toBeDefined()
  })

  it('import button is disabled when no valid rows', () => {
    render(<ExcelGradeImportModal isOpen={true} onClose={vi.fn()} semester={1} />)
    const importBtn = screen.getByRole('button', { name: /Nhập 0 Bản Ghi/ })
    expect(importBtn).toBeDefined()
    expect(importBtn.hasAttribute('disabled')).toBe(true)
  })

  it('import button saves grades but does not auto-close modal', async () => {
    const { parseGradeText } = await import('../../utils/excelGradeParser')
    const { buildGradeRecords } = await import('../../utils/excelImporter')
    vi.stubGlobal('alert', vi.fn())

    vi.mocked(parseGradeText).mockReturnValue({
      rows: [
        { rowIndex: 1, studentCode: 'TN-1001', fullName: 'Nguyễn Văn A', scoreDaoDuc: null, comments: '', warnings: [], isValid: true, errors: [], scoreOral: 8, score15m: null, score1Period: null, scoreMidterm: null, scoreFinal: null, matchedStudent: { id: 'ST-001', holyName: 'Phê-rô', fullName: 'Nguyễn Văn A', code: 'TN-1001', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Cha A', parentPhone: '0901234567', address: 'Giáo Xứ', branch: 'ThieuNhi', classId: 'TN1', status: 'Đang học' } },
      ],
      matchedCount: 1, unmatchedCount: 0, validCount: 1, errorCount: 0,
      detectedColumns: [], headerRowIndex: 0, diagnosticWarnings: [], inferred: false,
    })
    vi.mocked(buildGradeRecords).mockReturnValue([{ studentId: 'ST-001', scoreOral: 8, semester: 1 }])

    const onClose = vi.fn()
    render(<ExcelGradeImportModal isOpen={true} onClose={onClose} semester={1} />)
    const textarea = screen.getByPlaceholderText(/Dán các cột/)
    fireEvent.change(textarea, { target: { value: 'test data' } })

    const importBtn = screen.getByRole('button', { name: /Nhập 1 Bản Ghi/ })
    fireEvent.click(importBtn)

    expect(buildGradeRecords).toHaveBeenCalled()
    expect(mockBatchSaveGrades).toHaveBeenCalledWith([{ studentId: 'ST-001', scoreOral: 8, semester: 1 }])
    // New behavior: modal stays open to show sync status, onClose not called automatically
    expect(onClose).not.toHaveBeenCalled()
  })

  it('blocks import when inference is active and user cancels confirmation (CRITICAL-2)', async () => {
    const { parseGradeText } = await import('../../utils/excelGradeParser')
    const { buildGradeRecords } = await import('../../utils/excelImporter')

    vi.mocked(parseGradeText).mockReturnValue({
      rows: [
        { rowIndex: 1, studentCode: 'TN-1001', fullName: 'Nguyễn Văn A', scoreDaoDuc: null, comments: '', warnings: ['⚠ suy luận'], isValid: true, errors: [], scoreOral: 8, score15m: null, score1Period: null, scoreMidterm: null, scoreFinal: null, matchedStudent: { id: 'ST-001', holyName: 'Phê-rô', fullName: 'Nguyễn Văn A', code: 'TN-1001', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Cha A', parentPhone: '0901234567', address: 'Giáo Xứ', branch: 'ThieuNhi', classId: 'TN1', status: 'Đang học' } },
      ],
      matchedCount: 1, unmatchedCount: 0, validCount: 1, errorCount: 0,
      detectedColumns: [{ field: 'scoreOral', headerName: 'Cột 3 (suy luận)', colIndex: 2, score: 50 }], headerRowIndex: -1,
      diagnosticWarnings: ['⚠ Không tìm thấy dòng header — cột điểm được suy luận từ dữ liệu. Vui lòng kiểm tra kỹ trước khi import.'],
      inferred: true,
    })
    vi.mocked(buildGradeRecords).mockReturnValue([{ studentId: 'ST-001', scoreOral: 8, semester: 1 }])

    render(<ExcelGradeImportModal isOpen={true} onClose={vi.fn()} semester={1} />)
    const textarea = screen.getByPlaceholderText(/Dán các cột/)
    fireEvent.change(textarea, { target: { value: 'test data' } })

    // Warning banner should be visible
    expect(screen.getByText(/các cột điểm được suy luận từ dữ liệu/)).toBeDefined()

    const importBtn = screen.getByRole('button', { name: /Nhập 1 Bản Ghi/ })
    fireEvent.click(importBtn)

    // A4: dialog tùy chỉnh thay window.confirm — user hủy → không import
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    await waitFor(() => {
      expect(mockBatchSaveGrades).not.toHaveBeenCalled()
    })
  })

  it('proceeds with import when user accepts inference confirmation (CRITICAL-2)', async () => {
    const { parseGradeText } = await import('../../utils/excelGradeParser')
    const { buildGradeRecords } = await import('../../utils/excelImporter')

    vi.mocked(parseGradeText).mockReturnValue({
      rows: [
        { rowIndex: 1, studentCode: 'TN-1001', fullName: 'Nguyễn Văn A', scoreDaoDuc: null, comments: '', warnings: [], isValid: true, errors: [], scoreOral: 8, score15m: null, score1Period: null, scoreMidterm: null, scoreFinal: null, matchedStudent: { id: 'ST-001', holyName: 'Phê-rô', fullName: 'Nguyễn Văn A', code: 'TN-1001', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Cha A', parentPhone: '0901234567', address: 'Giáo Xứ', branch: 'ThieuNhi', classId: 'TN1', status: 'Đang học' } },
      ],
      matchedCount: 1, unmatchedCount: 0, validCount: 1, errorCount: 0,
      detectedColumns: [{ field: 'scoreOral', headerName: 'Cột 3 (suy luận)', colIndex: 2, score: 50 }], headerRowIndex: -1,
      diagnosticWarnings: ['⚠ Không tìm thấy dòng header — cột điểm được suy luận từ dữ liệu. Vui lòng kiểm tra kỹ trước khi import.'],
      inferred: true,
    })
    vi.mocked(buildGradeRecords).mockReturnValue([{ studentId: 'ST-001', scoreOral: 8, semester: 1 }])

    render(<ExcelGradeImportModal isOpen={true} onClose={vi.fn()} semester={1} />)
    const textarea = screen.getByPlaceholderText(/Dán các cột/)
    fireEvent.change(textarea, { target: { value: 'test data' } })

    const importBtn = screen.getByRole('button', { name: /Nhập 1 Bản Ghi/ })
    fireEvent.click(importBtn)

    // A4: dialog tùy chỉnh — user đồng ý → import tiếp tục
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục nhập' }))
    await waitFor(() => {
      expect(mockBatchSaveGrades).toHaveBeenCalled()
    })
  })
})
