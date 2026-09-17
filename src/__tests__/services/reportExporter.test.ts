import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { getCurrentAcademicYear } from '../../utils/academicYear'
import {
  buildBranchSummaryRows,
  buildStudentDetailRows,
  exportCsv,
  exportXlsx,
  exportFilename,
} from '../../services/reportExporter'

const { fetchOfficialAcademicYearReportsMock } = vi.hoisted(() => ({
  fetchOfficialAcademicYearReportsMock: vi.fn(),
}))

vi.mock('../../services/officialReporting', () => ({
  fetchOfficialAcademicYearReports: (...args: unknown[]) => fetchOfficialAcademicYearReportsMock(...args),
}))

const { xlsxMock } = vi.hoisted(() => ({
  xlsxMock: {
    writeFile: vi.fn(),
    utils: {
      json_to_sheet: vi.fn(() => ({})),
      book_new: vi.fn(() => ({ SheetNames: [] as string[], Sheets: {} })),
      book_append_sheet: vi.fn((wb: { SheetNames: string[] }, _ws: unknown, name: string) => { wb.SheetNames.push(name) }),
    },
  },
}))
// PERF-XLSX-1: xlsxLoader lazy import('xlsx') rồi đọc `.default ?? namespace`
// — mock phải expose cả default để loader resolve đúng.
vi.mock('xlsx', () => ({ ...xlsxMock, default: xlsxMock }))

const activeAY = getCurrentAcademicYear()
function report(studentId: string, code: string, fullName: string, semester1: number, semester2: number, classification1: string) {
  return {
    student: { id: studentId, code, holyName: 'Giuse', fullName, className: 'Lớp 1' },
    academicYear: activeAY,
    grades: [
      { semester: 1, gpa: semester1, classification: classification1 },
      { semester: 2, gpa: semester2, classification: semester2 >= 8 ? 'Giỏi' : 'Trung Bình' },
    ],
    yearSummary: { gpa: (semester1 + semester2) / 2, classification: 'Giỏi' },
    attendanceSummary: { massPresentCount: 1, massTotalCount: 1, catechismPresentCount: 0, catechismTotalCount: 1, overallAttendanceRate: 50 },
    promotion: null,
  }
}

describe('reportExporter (Báo Cáo Nâng Cao & Xuất File)', () => {
  beforeEach(() => {
    useAcademicYearStore.setState({ currentYear: activeAY, academicYears: [] })
    fetchOfficialAcademicYearReportsMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('buildBranchSummaryRows uses server classifications for the selected semester', async () => {
    fetchOfficialAcademicYearReportsMock.mockResolvedValue([
      { classInfo: { id: 'TN1', name: 'Thiếu Nhi 1', branchId: 'ThieuNhi', academicYear: activeAY }, summary: { className: 'Thiếu Nhi 1' }, reportCards: [report('ST-XS', 'TN001', 'A', 9.5, 9, 'Xuất Sắc'), report('ST-TB', 'TN002', 'B', 6, 6, 'Trung Bình')] },
      { classInfo: { id: 'AN1', name: 'Ấu Nhi 1', branchId: 'AuNhi', academicYear: activeAY }, summary: { className: 'Ấu Nhi 1' }, reportCards: [report('ST-AN', 'TN003', 'C', 8, 8, 'Giỏi')] },
    ])

    const rows = await buildBranchSummaryRows(1)
    const thieuNhi = rows.find((r) => r['Phân Ngành'] === 'Thiếu Nhi')!
    const auNhi = rows.find((r) => r['Phân Ngành'] === 'Ấu Nhi')!

    expect(thieuNhi['Số Thiếu Nhi']).toBe(2)
    expect(thieuNhi['Xuất Sắc']).toBe(1)
    expect(thieuNhi['Trung Bình']).toBe(1)
    expect(auNhi['Số Thiếu Nhi']).toBe(1)
    expect(auNhi['Giỏi']).toBe(1)
  })

  it('buildStudentDetailRows exports the server year summary without local recalculation', async () => {
    const official = report('ST-1', 'TN001', 'Nguyễn Văn A', 9, 8, 'Xuất Sắc')
    official.student.className = 'Lớp Thiếu Nhi 1'
    fetchOfficialAcademicYearReportsMock.mockResolvedValue([
      { classInfo: { id: 'TN1', name: 'Lớp Thiếu Nhi 1', branchId: 'ThieuNhi', academicYear: activeAY }, summary: { className: 'Lớp Thiếu Nhi 1' }, reportCards: [official] },
    ])

    const rows = await buildStudentDetailRows()

    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row['Mã Học Sinh']).toBe('TN001')
    expect(row['Lớp']).toBe('Lớp Thiếu Nhi 1')
    expect(row['Phân Ngành']).toBe('Thiếu Nhi')
    expect(row['HK1']).toBe(9)
    expect(row['HK2']).toBe(8)
    expect(row['ĐTB Cả Năm']).toBe(8.5)
    expect(row['Chuyên Cần (%)']).toBe('50.0')
  })

  it('exportCsv tạo file có BOM UTF-8 và escape đúng dấu phẩy/nháy', async () => {
    let capturedBlob: Blob | undefined
    const createObjectURL = vi.fn()
    createObjectURL.mockImplementation((blob: Blob | MediaSource) => {
      capturedBlob = blob as Blob
      return 'blob:mock-url'
    })
    const revokeObjectURL = vi.fn()
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL)

    exportCsv('test-report', [
      { 'Phân Ngành': 'Thiếu Nhi', 'Số Thiếu Nhi': 3 },
      { 'Phân Ngành': 'Ấu Nhi, Nhỏ', 'Số Thiếu Nhi': 1 },
    ])

    expect(capturedBlob).toBeDefined()
    const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(capturedBlob!)
    })
    const bytes = new Uint8Array(buf)
    expect(bytes[0]).toBe(0xEF)
    expect(bytes[1]).toBe(0xBB)
    expect(bytes[2]).toBe(0xBF)
    const text = new TextDecoder('utf-8').decode(buf)
    expect(text).toContain('Phân Ngành,Số Thiếu Nhi')
    expect(text).toContain('"Ấu Nhi, Nhỏ",1')
  })

  it('exportXlsx tạo workbook qua thư viện xlsx', async () => {
    await exportXlsx('test-report', 'Thống kê', [
      { 'Phân Ngành': 'Thiếu Nhi', 'Số Thiếu Nhi': 3 },
    ])
    expect(xlsxMock.writeFile).toHaveBeenCalledTimes(1)
    const [wb, filename] = xlsxMock.writeFile.mock.calls[0] as [unknown, string]
    expect(filename).toBe('test-report.xlsx')
    expect((wb as { SheetNames: string[] }).SheetNames).toContain('Thống kê')
  })

  it('exportFilename gắn ngày YYYY-MM-DD', () => {
    const name = exportFilename('BaoCao')
    expect(name).toMatch(/^BaoCao_\d{4}-\d{2}-\d{2}$/)
  })
})
