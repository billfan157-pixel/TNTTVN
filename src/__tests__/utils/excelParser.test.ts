import { describe, it, expect } from 'vitest'
import {
  detectColumns,
  detectColumnsWithConfidence,
  findHeaderRow,
  parseToImportRows,
  rowsToRawStrings,
  normalizeDate,
  parseRosterText,
  convertToStudentModels,
} from '../../utils/excelParser'

describe('detectColumns', () => {
  it('detects columns from Vietnamese headers', () => {
    const headers = ['Tên Thánh', 'Họ và Tên', 'Giới Tính', 'Ngày Sinh', 'Phụ Huynh', 'SĐT', 'Địa Chỉ', 'Phân Ngành', 'Lớp']
    const colMap = detectColumns(headers)
    expect(colMap.holyName).toBe(0)
    expect(colMap.fullName).toBe(1)
    expect(colMap.gender).toBe(2)
    expect(colMap.dateOfBirth).toBe(3)
    expect(colMap.parentName).toBe(4)
    expect(colMap.parentPhone).toBe(5)
    expect(colMap.address).toBe(6)
    expect(colMap.branch).toBe(7)
    expect(colMap.className).toBe(8)
  })

  it('detects columns from English headers', () => {
    const headers = ['Holy Name', 'Full Name', 'Gender', 'DOB', 'Parent', 'Phone', 'Address', 'Branch', 'Class']
    const colMap = detectColumns(headers)
    expect(colMap.holyName).toBe(0)
    expect(colMap.fullName).toBe(1)
  })

  it('handles headers with diacritics stripped by user', () => {
    const headers = ['Ten Thanh', 'Ho va Ten', 'Phai', 'Ngay Sinh']
    const colMap = detectColumns(headers)
    expect(colMap.holyName).toBe(0)
    expect(colMap.fullName).toBe(1)
    expect(colMap.gender).toBe(2)
    expect(colMap.dateOfBirth).toBe(3)
  })
})

describe('detectColumnsWithConfidence', () => {
  it('returns confidence scores for detected columns', () => {
    const result = detectColumnsWithConfidence(['Tên Thánh', 'Họ và Tên'])
    expect(result.length).toBe(2)
    expect(result[0].score).toBeGreaterThanOrEqual(80)
    expect(result[0].field).toBe('holyName')
  })
})

describe('findHeaderRow', () => {
  it('finds header row among sample headers', () => {
    const rows = [
      ['Danh Sách Lớp Thiếu Nhi'],
      ['STT', 'Tên Thánh', 'Họ và Tên', 'Ngày Sinh'],
      ['1', 'Giuse', 'Nguyễn Văn A', '2015-01-01'],
    ]
    const result = findHeaderRow(rows)
    expect(result.headerIndex).toBe(1)
    expect(result.colMap.holyName).toBe(1)
  })

  it('returns -1 when no header found', () => {
    const rows = [['abc', 'def'], ['ghi', 'jkl']]
    const result = findHeaderRow(rows)
    expect(result.headerIndex).toBe(-1)
  })
})

describe('parseToImportRows', () => {
  it('parses data rows with column map', () => {
    const colMap = { holyName: 0, fullName: 1, gender: 2, dateOfBirth: 3, parentName: 4, parentPhone: 5, address: 6, branch: 7, className: 8 }
    const rows = [
      ['Giuse', 'Nguyễn Văn A', 'Nam', '2015-01-01', 'Cha A', '0901234567', 'Giáo Xứ', 'ThieuNhi', 'TN1'],
      ['Maria', 'Trần Thị B', 'Nữ', '2015-02-02', 'Mẹ B', '0907654321', 'Giáo Xứ', 'AuNhi', 'AU1'],
    ]
    const result = parseToImportRows(rows, colMap, 0)
    expect(result).toHaveLength(2)
    expect(result[0].holyName).toBe('Giuse')
    expect(result[0].fullName).toBe('Nguyễn Văn A')
    expect(result[0].branch).toBe('ThieuNhi')
    expect(result[1].gender).toBe('Nữ')
  })

  it('combines firstName + lastName into fullName', () => {
    const colMap = { lastName: 0, firstName: 1 }
    const rows = [['Nguyễn', 'Văn A']]
    const result = parseToImportRows(rows, colMap, 0)
    expect(result[0].fullName).toBe('Nguyễn Văn A')
  })

  it('skips empty rows', () => {
    const colMap = { holyName: 0, fullName: 1 }
    const rows = [
      ['', ''],
      ['Giuse', 'Nguyễn Văn A'],
    ]
    const result = parseToImportRows(rows, colMap, 0)
    expect(result).toHaveLength(1)
  })

  it('strips holyName prefix from fullName', () => {
    const colMap = { holyName: 0, fullName: 1 }
    const rows = [['Giuse', 'Giuse Nguyễn Văn A']]
    const result = parseToImportRows(rows, colMap, 0)
    expect(result[0].fullName).toBe('Nguyễn Văn A')
  })
})

describe('rowsToRawStrings', () => {
  it('converts all cells to trimmed strings', () => {
    const input = [[123, null, ' hello '], [undefined, '', 'world']]
    const result = rowsToRawStrings(input)
    expect(result[0]).toEqual(['123', '', 'hello'])
    expect(result[1]).toEqual(['', '', 'world'])
  })
})

describe('normalizeDate', () => {
  it('passes through ISO format', () => {
    expect(normalizeDate('2025-01-15')).toBe('2025-01-15')
  })

  it('converts DD/MM/YYYY to YYYY-MM-DD', () => {
    expect(normalizeDate('15/01/2025')).toBe('2025-01-15')
  })

  it('converts DD-MM-YYYY to YYYY-MM-DD', () => {
    expect(normalizeDate('15-01-2025')).toBe('2025-01-15')
  })

  it('converts DD.MM.YYYY to YYYY-MM-DD', () => {
    expect(normalizeDate('15.01.2025')).toBe('2025-01-15')
  })

  it('pads months and days', () => {
    expect(normalizeDate('1/1/2025')).toBe('2025-01-01')
  })

  it('handles YYYY/MM/DD format', () => {
    expect(normalizeDate('2025/01/15')).toBe('2025-01-15')
  })
})

describe('parseRosterText', () => {
  it('parses tab-separated student data', () => {
    const text = 'Tên Thánh\tHọ và Tên\tPhái\tNgày Sinh\nGiuse\tNguyễn Văn A\tNam\t2015-01-01\nMaria\tTrần Thị B\tNữ\t2015-02-02'
    const result = parseRosterText(text)
    expect(result).toHaveLength(2)
    expect(result[0].holyName).toBe('Giuse')
    expect(result[0].isValid).toBe(true)
  })

  it('skips header row automatically', () => {
    const text = 'STT\tTên Thánh\tHọ và Tên\tPhái\tNgày Sinh\n1\tGiuse\tNguyễn Văn A\tNam\t2015-01-01'
    const result = parseRosterText(text)
    expect(result).toHaveLength(1)
  })

  it('handles comma-separated input', () => {
    const text = 'Tên Thánh,Họ và Tên,Phái\nGiuse,Nguyễn Văn A,Nam'
    const result = parseRosterText(text)
    expect(result).toHaveLength(1)
  })

  it('reports errors for missing fields', () => {
    const text = 'Tên Thánh\tHọ và Tên\n\tNguyễn Văn A'
    const result = parseRosterText(text)
    // holyName optional 2026-08-28: thiếu vẫn valid, chỉ fullName bắt buộc
    expect(result[0].isValid).toBe(true)
    expect(result[0].errors).not.toContain('Thiếu Tên Thánh')
    expect(result[0].holyName).toBe('')
  })
})

describe('convertToStudentModels', () => {
  it('filters invalid rows and converts', () => {
    const rows = parseRosterText('Tên Thánh\tHọ và Tên\nGiuse\tNguyễn Văn A')
    const students = convertToStudentModels(rows)
    expect(students).toHaveLength(1)
    expect(students[0].holyName).toBe('Giuse')
    expect(students[0].fullName).toBe('Nguyễn Văn A')
    expect(students[0].status).toBe('Đang học')
  })
})
