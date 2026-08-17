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
  },
]

describe('Excel Grade Parser', () => {
  it('matches student by holy name and full name with high precision (>= 90%)', () => {
    const matched = matchStudentInRoster('TN-9999', 'Giuse', 'Nguyễn Văn A', mockStudents)
    expect(matched?.id).toBe('ST-001')
  })

  it('matches student by full name and holy name', () => {
    const matched = matchStudentInRoster('', 'Maria', 'Trần Thị B', mockStudents)
    expect(matched?.id).toBe('ST-002')
  })

  it('fails match when similarity is under 90%', () => {
    // Name differs significantly ("Nguyễn Văn A" vs "Trần Văn C")
    const matched = matchStudentInRoster('', 'Giuse', 'Trần Văn C', mockStudents)
    expect(matched).toBeUndefined()
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

  it('auto-combines split Họ and Tên columns and normalizes truncated holy names', () => {
    const studentsWithRealNames: Student[] = [
      { id: 'ST-003', code: '2021001', holyName: 'Antôn', fullName: 'Ngô Đức Anh', gender: 'Nam', dateOfBirth: '2014-09-27', parentName: '', parentPhone: '', address: '', branch: 'ThieuNhi', classId: 'TN1A', status: 'Đang học' },
      { id: 'ST-004', code: '2021011', holyName: 'Anna', fullName: 'Nguyễn Ngọc Anh', gender: 'Nữ', dateOfBirth: '2014-01-09', parentName: '', parentPhone: '', address: '', branch: 'ThieuNhi', classId: 'TN1A', status: 'Đang học' },
    ]

    const text = `Stt;Mã s;Định danh;Tên Thá;H;Tê;Ngày sin;Tình trạng;Ngày rửa;Giáo họ;T.B - Cả n;Xếp loại;Kết quả
1;2021001;;Antô;Ngô Đ;Anh;27/09/2014;Bình thường;24/11/2014;CT Tử Đạo;9,07;Giỏi;Lên lớp
2;2021011;;Anna;Nguyễn Ngọc;Anh;09/01/2014;Bình thường;02/03/2014;Thánh Tự;8,5;Giỏi;Lên lớp`

    const result = parseGradeText(text, studentsWithRealNames)
    expect(result.matchedCount).toBe(2)
    expect(result.rows[0].matchedStudent?.id).toBe('ST-003')
    expect(result.rows[1].matchedStudent?.id).toBe('ST-004')
  })
})
