import React from 'react'
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildGradeRecords, countPreservedRows, parseGradeFile, parseScore, detectGradeColumn, detectGradeColumns, isIgnoredColumn } from '../../utils/excelImporter'
import type { ParsedGradeRow } from '../../utils/excelImporter'

const mockStudent = { id: 'ST-001', code: 'TN-1001', holyName: 'Giuse', fullName: 'Nguyễn Văn A', gender: 'Nam' as const, dateOfBirth: '2015-01-01', parentName: 'Cha A', parentPhone: '0901234567', address: 'Giáo Xứ', branch: 'ThieuNhi' as const, classId: 'TN1', status: 'Đang học' as const }

const makeRow = (overrides: Partial<ParsedGradeRow> = {}): ParsedGradeRow => ({
  rowNum: 1,
  studentCode: 'TN-1001',
  studentName: 'Giuse Nguyễn Văn A',
  matchedStudent: mockStudent,
  scoreOral: null,
  score15m: null,
  score1Period: null,
  scoreMidterm: null,
  scoreFinal: null,
  scoreDaoDuc: null,
  comments: '',
  isValid: true,
  errors: [],
  warnings: [],
  ...overrides,
})

describe('buildGradeRecords', () => {
  it('builds records with scores and metadata', () => {
    const rows = [makeRow({ scoreOral: 8.5, scoreFinal: 9 })]
    const records = buildGradeRecords(rows, 1, '2025 - 2026')
    expect(records).toHaveLength(1)
    expect(records[0].studentId).toBe('ST-001')
    expect(records[0].semester).toBe(1)
    expect(records[0].academicYear).toBe('2025 - 2026')
    expect(records[0].scoreOral).toBe(8.5)
    expect(records[0].scoreOral_source).toBe('excel_import')
    expect(records[0].scoreFinal_source).toBe('excel_import')
  })

  it('skips invalid rows', () => {
    const rows = [makeRow({ isValid: false })]
    const records = buildGradeRecords(rows, 1, '2025 - 2026')
    expect(records).toHaveLength(0)
  })

  it('skips rows without matched student', () => {
    const rows = [makeRow({ matchedStudent: null })]
    const records = buildGradeRecords(rows, 1, '2025 - 2026')
    expect(records).toHaveLength(0)
  })
})

describe('countPreservedRows', () => {
  it('counts rows with at least one null field', () => {
    const row1 = makeRow({ scoreOral: 8, score15m: null, score1Period: 8, scoreMidterm: 8, scoreFinal: 8, scoreDaoDuc: 10 })
    const row2 = makeRow({ scoreOral: 9, score15m: 7, score1Period: 8, scoreMidterm: 9, scoreFinal: 9, scoreDaoDuc: 10 })
    expect(countPreservedRows([row1, row2])).toBe(1)
  })

  it('returns 0 when all fields filled', () => {
    const rows = [makeRow({ scoreOral: 8, score15m: 7, score1Period: 8, scoreMidterm: 9, scoreFinal: 9, scoreDaoDuc: 10 })]
    expect(countPreservedRows(rows)).toBe(0)
  })
})

describe('parseScore (smart upgrade)', () => {
  it('rejects numeric scores outside 0-10', () => {
    expect(parseScore(11).value).toBeNull()
    expect(parseScore(11).error).toBeDefined()
    expect(parseScore(100).value).toBeNull()
    expect(parseScore(-1).value).toBeNull()
  })

  it('accepts and rounds numeric scores in range', () => {
    expect(parseScore(9.75).value).toBe(9.8)
    expect(parseScore(10).value).toBe(10)
    expect(parseScore(0).value).toBe(0)
  })

  it('rejects string scores outside 0-10', () => {
    expect(parseScore('15').value).toBeNull()
    expect(parseScore('100').value).toBeNull()
  })

  it('rejects empty/null', () => {
    expect(parseScore(null).value).toBeNull()
    expect(parseScore(undefined).value).toBeNull()
    expect(parseScore('').value).toBeNull()
  })

  it('handles comma decimal (8,5 → 8.5)', () => {
    expect(parseScore('8,5').value).toBe(8.5)
  })

  it('handles dash/em-dash as null without error', () => {
    expect(parseScore('-').value).toBeNull()
    expect(parseScore('-').error).toBeUndefined()
    expect(parseScore('—').value).toBeNull()
    expect(parseScore('—').error).toBeUndefined()
  })

  // CRITICAL 3: V/X/KXL → null with WARNING
  it('returns warning for "V" (vắng)', () => {
    const result = parseScore('V')
    expect(result.value).toBeNull()
    expect(result.warning).toBeDefined()
    expect(result.warning).toContain('Vắng')
    expect(result.error).toBeUndefined()
  })

  it('returns warning for "X" (không xếp loại)', () => {
    const result = parseScore('X')
    expect(result.value).toBeNull()
    expect(result.warning).toBeDefined()
    expect(result.warning).toContain('xếp loại')
  })

  it('returns warning for "KXL"', () => {
    const result = parseScore('KXL')
    expect(result.value).toBeNull()
    expect(result.warning).toBeDefined()
  })

  it('returns warning for "Đ" (đạt)', () => {
    const result = parseScore('Đ')
    expect(result.value).toBeNull()
    expect(result.warning).toBeDefined()
    expect(result.warning).toContain('Đạt')
  })

  it('handles whitespace in number (8 .5)', () => {
    expect(parseScore('8 .5').value).toBe(8.5)
  })
})

describe('detectGradeColumn (scoring-based)', () => {
  // Standard aliases
  it('detects "Miệng" → scoreOral', () => {
    const r = detectGradeColumn('Miệng')
    expect(r?.field).toBe('scoreOral')
    expect(r?.score).toBe(100)
  })

  it('detects "KT Miệng" → scoreOral', () => {
    const r = detectGradeColumn('KT Miệng')
    expect(r?.field).toBe('scoreOral')
    expect(r?.score).toBeGreaterThanOrEqual(80)
  })

  it('detects "15 Phút" → score15m', () => {
    expect(detectGradeColumn('15 Phút')?.field).toBe('score15m')
  })

  it('detects "15P" → score15m (exact match short)', () => {
    expect(detectGradeColumn('15P')?.field).toBe('score15m')
  })

  it('detects "1 Tiết" → score1Period', () => {
    expect(detectGradeColumn('1 Tiết')?.field).toBe('score1Period')
  })

  it('detects "Viết" → score1Period', () => {
    expect(detectGradeColumn('Viết')?.field).toBe('score1Period')
  })

  it('detects "Giữa Kỳ" → scoreMidterm', () => {
    expect(detectGradeColumn('Giữa Kỳ')?.field).toBe('scoreMidterm')
  })

  it('detects "GK" → scoreMidterm (exact match)', () => {
    expect(detectGradeColumn('GK')?.field).toBe('scoreMidterm')
  })

  it('detects "Cuối Kỳ" → scoreFinal', () => {
    expect(detectGradeColumn('Cuối Kỳ')?.field).toBe('scoreFinal')
  })

  it('detects "CK" → scoreFinal (exact match)', () => {
    expect(detectGradeColumn('CK')?.field).toBe('scoreFinal')
  })

  it('detects "Thi Cuối Kỳ" → scoreFinal', () => {
    expect(detectGradeColumn('Thi Cuối Kỳ')?.field).toBe('scoreFinal')
  })

  // Mục 11: ĐĐ/DD aliases for scoreDaoDuc
  it('detects "ĐĐ" → scoreDaoDuc', () => {
    expect(detectGradeColumn('ĐĐ')?.field).toBe('scoreDaoDuc')
  })

  it('detects "DD" → scoreDaoDuc', () => {
    expect(detectGradeColumn('DD')?.field).toBe('scoreDaoDuc')
  })

  it('detects "Đạo Đức" → scoreDaoDuc', () => {
    expect(detectGradeColumn('Đạo Đức')?.field).toBe('scoreDaoDuc')
  })

  it('detects "Hạnh Kiểm" → scoreDaoDuc', () => {
    expect(detectGradeColumn('Hạnh Kiểm')?.field).toBe('scoreDaoDuc')
  })

  // Mục 5: HK removed from scoreDaoDuc (conflicts with Học Kỳ)
  it('does NOT detect "HK" as scoreDaoDuc', () => {
    const r = detectGradeColumn('HK')
    expect(r?.field).not.toBe('scoreDaoDuc')
  })

  // Mục 10: TB/T.B removed from scoreMidterm (hygiene)
  it('does NOT detect "TB" as scoreMidterm', () => {
    // "TB" is now in IGNORED_COLUMNS
    expect(detectGradeColumn('TB')).toBeNull()
  })

  it('does NOT detect "T.B" as scoreMidterm', () => {
    expect(detectGradeColumn('T.B')).toBeNull()
  })

  // IGNORED_COLUMNS
  it('returns null for "ĐTB" (ignored)', () => {
    expect(detectGradeColumn('ĐTB')).toBeNull()
  })

  it('returns null for "Xếp Loại" (ignored)', () => {
    expect(detectGradeColumn('Xếp Loại')).toBeNull()
  })

  it('returns null for "STT" (ignored)', () => {
    expect(detectGradeColumn('STT')).toBeNull()
  })

  it('returns null for "Ngày Sinh" (ignored)', () => {
    expect(detectGradeColumn('Ngày Sinh')).toBeNull()
  })

  it('matches single char "M" as scoreOral (exact match)', () => {
    expect(detectGradeColumn('M')?.field).toBe('scoreOral')
  })
})

describe('isIgnoredColumn (token-boundary matching)', () => {
  // Mục 12: token-boundary, not includes()
  it('ignores "ĐTB" exactly', () => {
    expect(isIgnoredColumn('ĐTB')).toBe(true)
  })

  it('ignores "TB" exactly', () => {
    expect(isIgnoredColumn('TB')).toBe(true)
  })

  it('does NOT ignore "TB 15 Phút" (not exact match)', () => {
    expect(isIgnoredColumn('TB 15 Phút')).toBe(false)
  })

  it('does NOT ignore "ĐTB HK1" (not exact match)', () => {
    expect(isIgnoredColumn('ĐTB HK1')).toBe(false)
  })

  it('ignores "Xếp Loại" exactly', () => {
    expect(isIgnoredColumn('Xếp Loại')).toBe(true)
  })

  it('ignores "STT" exactly', () => {
    expect(isIgnoredColumn('STT')).toBe(true)
  })

  it('ignores case-insensitive "stt"', () => {
    expect(isIgnoredColumn('stt')).toBe(true)
  })
})

describe('detectGradeColumns (multi-column assignment)', () => {
  it('assigns all columns from standard template headers', () => {
    const headers = ['STT', 'Mã Thiếu Nhi', 'Tên Thánh', 'Họ và Tên', 'Điểm Miệng', '15 Phút', '1 Tiết', 'Thi Giữa Kỳ', 'Thi Cuối Kỳ', 'Đạo Đức', 'Ghi Chú']
    const result = detectGradeColumns(headers)

    expect(result.colMap.studentCode).toBe(1)
    expect(result.colMap.holyName).toBe(2)
    expect(result.colMap.studentName).toBe(3)
    expect(result.colMap.scoreOral).toBe(4)
    expect(result.colMap.score15m).toBe(5)
    expect(result.colMap.score1Period).toBe(6)
    expect(result.colMap.scoreMidterm).toBe(7)
    expect(result.colMap.scoreFinal).toBe(8)
    expect(result.colMap.scoreDaoDuc).toBe(9)
    expect(result.colMap.comments).toBe(10)

    // STT should be in ignoredColumns
    expect(result.ignoredColumns.some(ic => ic.headerName === 'STT')).toBe(true)
  })

  it('handles abbreviated headers: M | 15P | 1T | GK | CK | ĐĐ', () => {
    const headers = ['Tên Thánh', 'Họ Tên', 'Miệng', '15P', '1T', 'GK', 'CK', 'ĐĐ']
    const result = detectGradeColumns(headers)

    expect(result.colMap.holyName).toBe(0)
    expect(result.colMap.studentName).toBe(1)
    expect(result.colMap.scoreOral).toBe(2)
    expect(result.colMap.score15m).toBe(3)
    expect(result.colMap.score1Period).toBe(4)
    expect(result.colMap.scoreMidterm).toBe(5)
    expect(result.colMap.scoreFinal).toBe(6)
    expect(result.colMap.scoreDaoDuc).toBe(7)
  })

  it('correctly ignores ĐTB and Xếp Loại columns', () => {
    const headers = ['Họ và Tên', 'Miệng', '15P', '1 Tiết', 'GK', 'CK', 'ĐĐ', 'ĐTB', 'Xếp Loại', 'Ghi Chú']
    const result = detectGradeColumns(headers)

    // ĐTB and Xếp Loại should NOT be mapped to any score field
    expect(Object.values(result.colMap)).not.toContain(7) // ĐTB column index
    expect(Object.values(result.colMap)).not.toContain(8) // Xếp Loại column index
    expect(result.ignoredColumns.some(ic => ic.headerName === 'ĐTB')).toBe(true)
    expect(result.ignoredColumns.some(ic => ic.headerName === 'Xếp Loại')).toBe(true)
  })

  it('does NOT assign two headers to the same field', () => {
    const headers = ['Họ và Tên', 'Họ Tên', 'Miệng']
    const result = detectGradeColumns(headers)

    // Only one should be assigned to studentName
    const studentNameAssignments = result.detections.filter(d => d.field === 'studentName')
    expect(studentNameAssignments).toHaveLength(1)
  })

  it('handles English headers', () => {
    const headers = ['Holy Name', 'Full Name', 'Oral', 'Midterm', 'Final', 'Comments']
    const result = detectGradeColumns(headers)

    expect(result.colMap.holyName).toBe(0)
    expect(result.colMap.studentName).toBe(1)
    expect(result.colMap.scoreOral).toBe(2)
    expect(result.colMap.scoreMidterm).toBe(3)
    expect(result.colMap.scoreFinal).toBe(4)
    expect(result.colMap.comments).toBe(5)
  })
})

describe('parseGradeFile end-to-end (smart upgrade)', () => {
  const makeWorkbookBuffer = (rows: unknown[][], headers: string[]): ArrayBuffer => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as unknown as ArrayBuffer
  }

  it('numeric out-of-range score becomes invalid row (no 400 on server)', () => {
    const buf = makeWorkbookBuffer(
      [['TN-1001', 'Nguyễn Văn A', 11, '']],
      ['Mã TN', 'Họ Tên', 'Miệng', 'Ghi Chú'],
    )
    const { rows } = parseGradeFile(buf, [mockStudent])
    expect(rows).toHaveLength(1)
    expect(rows[0].scoreOral).toBeNull()
    expect(rows[0].isValid).toBe(false)
  })

  it('caps comments at 500 chars', () => {
    const longComment = 'x'.repeat(600)
    const buf = makeWorkbookBuffer(
      [['TN-1001', 'Nguyễn Văn A', 8, longComment]],
      ['Mã TN', 'Họ Tên', 'Miệng', 'Ghi Chú'],
    )
    const { rows } = parseGradeFile(buf, [mockStudent])
    expect(rows[0].comments.length).toBe(500)
    expect(rows[0].scoreOral).toBe(8)
    expect(rows[0].isValid).toBe(true)
  })

  it('returns diagnostics with detected columns', () => {
    const buf = makeWorkbookBuffer(
      [['TN-1001', 'Nguyễn Văn A', 8, 7, 6, 'Tốt']],
      ['Mã TN', 'Họ Tên', 'Miệng', '15P', 'CK', 'Ghi Chú'],
    )
    const { rows: _rows, diagnostics } = parseGradeFile(buf, [mockStudent])
    expect(diagnostics).not.toBeNull()
    expect(diagnostics!.detections.length).toBeGreaterThanOrEqual(3)
    expect(diagnostics!.detections.some(d => d.field === 'scoreOral')).toBe(true)
  })

  it('ignores ĐTB column and does NOT map it to a score', () => {
    const buf = makeWorkbookBuffer(
      [['Nguyễn Văn A', 8, 7, 6, 5, 8, 6.8, 'Tốt']],
      ['Họ Tên', 'Miệng', '15P', '1 Tiết', 'GK', 'CK', 'ĐTB', 'Ghi Chú'],
    )
    const { diagnostics } = parseGradeFile(buf, [mockStudent])
    expect(diagnostics!.ignoredColumns.some(ic => ic.headerName === 'ĐTB')).toBe(true)
    // ĐTB should not be assigned to any score field
    expect(Object.values(diagnostics!.colMap)).not.toContain(6)
  })

  it('handles "V" in score cell with warning', () => {
    const buf = makeWorkbookBuffer(
      [['Nguyễn Văn A', 'V', 7, '']],
      ['Họ Tên', 'Miệng', '15P', 'Ghi Chú'],
    )
    const { rows } = parseGradeFile(buf, [mockStudent])
    expect(rows[0].scoreOral).toBeNull()
    expect(rows[0].warnings.length).toBeGreaterThan(0)
    expect(rows[0].warnings[0]).toContain('Vắng')
  })
})
