import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { useClassStore } from '../../stores/classStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { getCurrentAcademicYear } from '../../utils/academicYear'
import {
  buildBranchSummaryRows,
  buildStudentDetailRows,
  exportCsv,
  exportXlsx,
  exportFilename,
} from '../../services/reportExporter'
import type { Student, GradeRecord, AttendanceRecord } from '../../types'

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
const CLASS_ID = 'CL-TN1'

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 'ST-1', code: 'TN001', holyName: 'Giuse', fullName: 'Nguyễn Văn A',
    gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Phụ Huynh A',
    parentPhone: '0901234567', address: 'X', branch: 'ThieuNhi', classId: CLASS_ID,
    status: 'Đang học', ...overrides,
  }
}

function makeGrade(overrides: Partial<GradeRecord> = {}): GradeRecord {
  return {
    id: 'GR-1', studentId: 'ST-1', academicYear: activeAY, semester: 1,
    scoreOral: 9.0, scoreOral_source: 'manual', scoreOral_updated_at: null,
    score15m: null, score15m_source: null, score15m_updated_at: null,
    score1Period: null, score1Period_source: null, score1Period_updated_at: null,
    scoreMidterm: null, scoreMidterm_source: null, scoreMidterm_updated_at: null,
    scoreFinal: null, scoreFinal_source: null, scoreFinal_updated_at: null,
    scoreDaoDuc: null, ...overrides,
  }
}

function makeAttendance(date: string, status: AttendanceRecord['status'] = 'Present'): AttendanceRecord {
  return { id: `ATT-${date}`, studentId: 'ST-1', date, type: 'CatechismClass', status }
}

describe('reportExporter (Báo Cáo Nâng Cao & Xuất File)', () => {
  beforeEach(() => {
    useStudentStore.setState({ students: [], error: null, isLoading: false })
    useGradeStore.setState({ grades: [] })
    useAttendanceStore.setState({ attendance: [] })
    useClassStore.setState({ classes: [], branches: [], academicYears: [] })
    useAcademicYearStore.setState({ currentYear: activeAY, academicYears: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('buildBranchSummaryRows đếm xếp loại đúng theo học kỳ (khớp UI)', () => {
    useStudentStore.setState({
      students: [
        makeStudent({ id: 'ST-XS', code: 'TN001', branch: 'ThieuNhi' }),
        makeStudent({ id: 'ST-TB', code: 'TN002', branch: 'ThieuNhi' }),
        makeStudent({ id: 'ST-AN', code: 'TN003', branch: 'AuNhi' }),
        makeStudent({ id: 'ST-DEL', code: 'TN004', branch: 'AuNhi', deletedAt: new Date().toISOString() }),
      ],
    })
    useGradeStore.setState({
      grades: [
        makeGrade({ id: 'GR-XS', studentId: 'ST-XS', scoreOral: 9.5 }),
        makeGrade({ id: 'GR-TB', studentId: 'ST-TB', scoreOral: 6.0 }),
        makeGrade({ id: 'GR-AN', studentId: 'ST-AN', scoreOral: 8.0 }),
      ],
    })

    const rows = buildBranchSummaryRows(1)
    const thieuNhi = rows.find((r) => r['Phân Ngành'] === 'Thiếu Nhi')!
    const auNhi = rows.find((r) => r['Phân Ngành'] === 'Ấu Nhi')!

    expect(thieuNhi['Số Thiếu Nhi']).toBe(2)
    expect(thieuNhi['Xuất Sắc (≥9.0)']).toBe(1)
    expect(thieuNhi['Trung Bình']).toBe(1)
    expect(auNhi['Số Thiếu Nhi']).toBe(1)
    expect(auNhi['Giỏi']).toBe(1)
  })

  it('buildStudentDetailRows xuất GPA HK1/HK2, xếp loại, chuyên cần và loại học sinh đã xóa', () => {
    useStudentStore.setState({
      students: [
        makeStudent({ id: 'ST-1', code: 'TN001', branch: 'ThieuNhi' }),
        makeStudent({ id: 'ST-DEL', code: 'TN002', branch: 'AuNhi', deletedAt: new Date().toISOString() }),
      ],
    })
    useGradeStore.setState({
      grades: [
        makeGrade({ id: 'GR-1', semester: 1, scoreOral: 9.0 }),
        makeGrade({ id: 'GR-2', semester: 2, scoreOral: 8.0 }),
      ],
    })
    useAttendanceStore.setState({
      attendance: [makeAttendance('2026-09-06'), makeAttendance('2026-09-13', 'AbsentUnexcused')],
    })
    useClassStore.setState({ classes: [{ id: CLASS_ID, code: 'TN1', name: 'Lớp Thiếu Nhi 1', branchId: 'ThieuNhi', branchName: 'Thiếu Nhi', academicYearId: activeAY, academicYear: activeAY, room: null, homeroomTeacher: null, assistants: [], studentCount: 1, parishId: 'gia-ton', createdAt: '', updatedAt: '', updatedBy: null }], branches: [], academicYears: [] })

    const rows = buildStudentDetailRows()

    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row['Mã Học Sinh']).toBe('TN001')
    expect(row['Lớp']).toBe('Lớp Thiếu Nhi 1')
    expect(row['Phân Ngành']).toBe('Thiếu Nhi')
    expect(row['HK1']).toBe('9.0')
    expect(row['HK2']).toBe('8.0')
    expect(row['ĐTB Cả Năm']).toBe('8.5')
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
