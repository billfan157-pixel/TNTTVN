import { describe, it, expect } from 'vitest'
import { buildDashboardSummary, getDashboardScope, getDashboardScopeLabel } from '../../utils/dashboardSummary'
import { DEFAULT_GRADE_WEIGHTS } from '../../utils/grades'
import type { AttendanceRecord, GradeRecord, Student } from '../../types'

function student(id: string, overrides: Partial<Student> = {}): Student {
  return {
    id,
    code: `TN-${id}`,
    holyName: 'Maria',
    fullName: `Bé ${id}`,
    gender: 'Nữ',
    dateOfBirth: '2015-01-01',
    parentName: 'PH',
    parentPhone: '0900000000',
    address: 'Xứ đoàn',
    branch: 'AuNhi',
    classId: 'CLS-1',
    status: 'Đang học',
    ...overrides,
  }
}

function attendance(id: string, studentId: string, date: string, status: AttendanceRecord['status']): AttendanceRecord {
  return { id, studentId, date, type: 'SundayMass', status }
}

function grade(id: string, studentId: string, academicYear: string, semester: 1 | 2, scoreFinal: number): GradeRecord {
  return {
    id,
    studentId,
    academicYear,
    semester,
    scoreOral: null, scoreOral_source: null, scoreOral_updated_at: null,
    score15m: null, score15m_source: null, score15m_updated_at: null,
    score1Period: null, score1Period_source: null, score1Period_updated_at: null,
    scoreMidterm: null, scoreMidterm_source: null, scoreMidterm_updated_at: null,
    scoreFinal, scoreFinal_source: null, scoreFinal_updated_at: null,
    scoreDaoDuc: null,
    comments: '',
  } as GradeRecord
}

const academicYear = '2025-2026'
const range = { startDate: '2025-08-01', endDate: '2026-07-31' }

const baseInput = {
  students: [student('S1'), student('S2')],
  attendance: [
    attendance('A1', 'S1', '2025-09-07', 'Present'),
    attendance('A2', 'S1', '2025-09-07', 'Present'),
    attendance('A3', 'S2', '2025-09-07', 'AbsentUnexcused'),
    // Ngoài niên học → phải bị loại.
    attendance('A4', 'S1', '2024-09-07', 'Present'),
  ],
  grades: [
    grade('G1', 'S1', academicYear, 1, 9),
    grade('G2', 'S1', academicYear, 2, 6),
    grade('G3', 'S2', academicYear, 1, 5),
    // Năm học khác → không được lẫn vào học kỳ đang xem.
    grade('G4', 'S2', '2024-2025', 1, 10),
  ],
  semester: 1,
  academicYear,
  range,
  excusedWeight: 1.0,
  gradeWeights: DEFAULT_GRADE_WEIGHTS,
}

describe('dashboardSummary (FE-F3/F5)', () => {
  it('chỉ tính attendance trong niên học đang chọn và giữ mẫu số + số buổi', () => {
    const summary = buildDashboardSummary(baseInput)

    expect(summary.attendance.totalCount).toBe(3) // A4 ngoài range bị loại
    expect(summary.attendance.presentCount).toBe(2)
    expect(summary.attendance.sessionDates).toBe(1)
    expect(summary.attendance.hasRecords).toBe(true)
    expect(summary.attendance.rate).toBe(66.7)
  })

  it('áp dụng attendancePolicy.excusedWeight như công thức chung', () => {
    const summary = buildDashboardSummary({
      ...baseInput,
      attendance: [
        attendance('A1', 'S1', '2025-09-07', 'Present'),
        attendance('A2', 'S1', '2025-09-07', 'AbsentExcused'),
      ],
      excusedWeight: 0.5,
    })

    expect(summary.attendance.presentCount).toBe(1.5)
    expect(summary.attendance.rate).toBe(75)
  })

  it('không có buổi nào được ghi nhận → hasRecords=false (không kết luận đạt)', () => {
    const summary = buildDashboardSummary({
      ...baseInput,
      attendance: [attendance('A4', 'S1', '2024-09-07', 'Present')],
    })

    expect(summary.attendance.hasRecords).toBe(false)
    expect(summary.attendance.totalCount).toBe(0)
    // Giá trị công thức nền vẫn giữ nguyên (100) — chỉ presentation đổi.
    expect(summary.attendance.rate).toBe(100)
  })

  it('index điểm theo (năm học + học kỳ) và xếp hạng top', () => {
    const summary = buildDashboardSummary(baseInput)

    // G3 của S2 (HK1, đúng năm) = 5 → Khá? và G4 sai năm không lọt.
    expect(summary.grades.totalGraded).toBe(2)
    expect(summary.grades.topStudents.map((item) => item.student.id)).toEqual(['S1', 'S2'])
    expect(summary.grades.topStudents[0].avg).toBe(9)
  })

  it('nhãn scope khớp dữ liệu thật theo vai trò', () => {
    expect(getDashboardScope('admin')).toBe('parish')
    expect(getDashboardScope('chunhiem')).toBe('assigned-classes')
    expect(getDashboardScope('phuta')).toBe('assigned-classes')
    expect(getDashboardScopeLabel('parish')).toBe('Toàn xứ đoàn')
    expect(getDashboardScopeLabel('assigned-classes')).toBe('Lớp bạn phụ trách')

    expect(buildDashboardSummary({ ...baseInput, role: 'phuta' }).scopeLabel).toBe('Lớp bạn phụ trách')
    expect(buildDashboardSummary({ ...baseInput, role: 'admin' }).scopeLabel).toBe('Toàn xứ đoàn')
  })

  it('bỏ qua thiếu nhi đã xoá khi đếm sĩ số và xếp hạng', () => {
    const summary = buildDashboardSummary({
      ...baseInput,
      students: [student('S1'), student('S2', { deletedAt: '2026-01-01T00:00:00.000Z' })],
    })

    expect(summary.students.total).toBe(1)
    expect(summary.grades.totalGraded).toBe(1)
  })
})
