import { describe, it, expect } from 'vitest'
import { parseGradeText, matchStudentInRoster } from '../utils/excelGradeParser'
import type { Student } from '../types'

const mockStudents: Student[] = [
  {
    id: 'ST-001',
    code: 'TN-1001',
    holyName: 'Giuse',
    fullName: 'Nguyễn Văn A',
    gender: 'Nam',
    dateOfBirth: '2015-01-01',
    parentName: 'Cha A',
    parentPhone: '0901234567',
    address: 'Giáo Xứ',
    branch: 'AuNhi',
    classId: 'AU1',
    status: 'Đang học',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  {
    id: 'ST-002',
    code: 'TN-1002',
    holyName: 'Maria',
    fullName: 'Trần Thị B',
    gender: 'Nữ',
    dateOfBirth: '2015-02-02',
    parentName: 'Mẹ B',
    parentPhone: '0907654321',
    address: 'Giáo Xứ',
    branch: 'AuNhi',
    classId: 'AU1',
    status: 'Đang học',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
]

describe('Excel Grade Parser', () => {
  it('matches student by code correctly', () => {
    const matched = matchStudentInRoster('TN-1001', 'Giuse', 'Nguyễn Văn A', mockStudents)
    expect(matched?.id).toBe('ST-001')
  })

  it('matches student by full name and holy name', () => {
    const matched = matchStudentInRoster('', 'Maria', 'Trần Thị B', mockStudents)
    expect(matched?.id).toBe('ST-002')
  })

  it('parses tab-separated grade clipboard text correctly', () => {
    const text = `STT\tMã TN\tTên Thánh\tHọ và Tên\tMiệng\t15P\t1T\tGK\tCK\tĐạo Đức
1\tTN-1001\tGiuse\tNguyễn Văn A\t8.5\t9\t8\t9\t9.5\t10
2\tTN-1002\tMaria\tTrần Thị B\t10\t9.5\t9\t8.5\t9\t10`

    const result = parseGradeText(text, mockStudents)
    expect(result.rows.length).toBe(2)
    expect(result.validCount).toBe(2)
    expect(result.rows[0].scoreOral).toBe(8.5)
    expect(result.rows[0].score15m).toBe(9)
    expect(result.rows[0].scoreFinal).toBe(9.5)
  })

  it('flags invalid score inputs out of 0-10 range', () => {
    const text = `STT\tMã TN\tTên Thánh\tHọ và Tên\tMiệng\t15P\t1T\tGK\tCK\tĐạo Đức
1\tTN-1001\tGiuse\tNguyễn Văn A\t15\t9\t8\t9\t9.5\t10`

    const result = parseGradeText(text, mockStudents)
    expect(result.rows[0].isValid).toBe(false)
    expect(result.rows[0].errors.length).toBeGreaterThan(0)
  })
})
