import React from 'react'
import { describe, it, expect } from 'vitest'
import { parseGradeText, matchStudentWithConfidence } from '../../utils/excelGradeParser'
import type { Student } from '../../types'

const mockStudents: Student[] = [
  { id: 'ST-001', code: 'TN-1001', holyName: 'Giuse', fullName: 'Nguyễn Văn A', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Cha A', parentPhone: '0901234567', address: 'Giáo Xứ', branch: 'ThieuNhi', classId: 'TN1', status: 'Đang học' },
  { id: 'ST-002', code: 'TN-1002', holyName: 'Maria', fullName: 'Trần Thị B', gender: 'Nữ', dateOfBirth: '2015-02-02', parentName: 'Mẹ B', parentPhone: '0907654321', address: 'Giáo Xứ', branch: 'ThieuNhi', classId: 'TN1', status: 'Đang học' },
]

describe('Smart header detection via parseGradeText', () => {
  it('detects standard Vietnamese headers', () => {
    const text = 'Tên Thánh\tHọ và Tên\tMiệng\t15 Phút\t1 Tiết\tGiữa Kỳ\tCuối Kỳ\tĐạo Đức\nGiuse\tNguyễn Văn A\t8\t7\t6\t5\t9\t10'
    const result = parseGradeText(text, mockStudents)

    expect(result.headerRowIndex).toBe(0)
    expect(result.detectedColumns.length).toBeGreaterThanOrEqual(6)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].scoreOral).toBe(8)
    expect(result.rows[0].scoreFinal).toBe(9)
  })

  it('detects abbreviated headers (M, 15P, 1T, GK, CK, ĐĐ)', () => {
    const text = 'Tên Thánh\tHọ Tên\tMiệng\t15P\t1T\tGK\tCK\tĐĐ\nGiuse\tNguyễn Văn A\t8\t7\t6\t5\t9\t10'
    const result = parseGradeText(text, mockStudents)

    expect(result.headerRowIndex).toBe(0)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].scoreOral).toBe(8)
    expect(result.rows[0].score15m).toBe(7)
    expect(result.rows[0].score1Period).toBe(6)
    expect(result.rows[0].scoreMidterm).toBe(5)
    expect(result.rows[0].scoreFinal).toBe(9)
    expect(result.rows[0].scoreDaoDuc).toBe(10)
  })

  it('handles header at row 3 (title rows before)', () => {
    const text = 'BẢNG ĐIỂM LỚP THIẾU NHI 1\nNăm Học 2025-2026\nTên Thánh\tHọ Tên\tMiệng\t15P\tCK\nGiuse\tNguyễn Văn A\t8\t7\t9'
    const result = parseGradeText(text, mockStudents)

    expect(result.headerRowIndex).toBe(2) // 0-indexed, row 3
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].scoreOral).toBe(8)
  })

  it('ignores ĐTB and Xếp Loại in header', () => {
    const text = 'Tên Thánh\tHọ Tên\tMiệng\t15P\t1 Tiết\tGK\tCK\tĐĐ\tĐTB\tXếp Loại\tGhi Chú\nGiuse\tNguyễn Văn A\t8\t7\t6\t5\t9\t10\t7.5\tKhá\tTốt'
    const result = parseGradeText(text, mockStudents)

    expect(result.diagnosticWarnings.some((w: string) => w.includes('ĐTB'))).toBe(true)
    expect(result.diagnosticWarnings.some((w: string) => w.includes('Xếp Loại'))).toBe(true)
    // 7.5 (ĐTB value) should NOT be mapped to any score
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].scoreDaoDuc).toBe(10)
  })

  it('reports diagnosticWarnings for missing score columns', () => {
    const text = 'Họ Tên\tMiệng\nNguyễn Văn A\t8'
    const result = parseGradeText(text, mockStudents)

    // Should warn about missing 15P, 1 Tiết, Cuối Kỳ
    expect(result.diagnosticWarnings.some((w: string) => w.includes('15 Phút'))).toBe(true)
    expect(result.diagnosticWarnings.some((w: string) => w.includes('1 Tiết'))).toBe(true)
    expect(result.diagnosticWarnings.some((w: string) => w.includes('Cuối Kỳ'))).toBe(true)
  })

  it('handles English headers', () => {
    const text = 'Holy Name\tFull Name\tOral\tMidterm\tFinal\nGiuse\tNguyễn Văn A\t8\t5\t9'
    const result = parseGradeText(text, mockStudents)

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].scoreOral).toBe(8)
    expect(result.rows[0].scoreMidterm).toBe(5)
    expect(result.rows[0].scoreFinal).toBe(9)
  })

  it('header detection requires ≥ 1 name + ≥ 1 score field (mục 13)', () => {
    // A row with only score-like words but no name field should NOT be picked as header
    const text = '8\t7\t6\nGiuse\tNguyễn Văn A\t8'
    const result = parseGradeText(text, mockStudents)

    // Should fallback to data-based inference or positional
    // First row is data, not header (no name fields detected)
    expect(result.headerRowIndex).toBe(-1)
  })
})

describe('Data-based inference fallback', () => {
  it('infers score columns from numeric 0-10 data when no header found', () => {
    // No header row — just pure data
    const text = 'Giuse\tNguyễn Văn A\t8\t7\t6\t5\t9\t10\nMaria\tTrần Thị B\t7\t8\t5\t6\t8\t9'
    const result = parseGradeText(text, mockStudents)

    // Data-based inference detected score columns
    expect(result.inferred).toBe(true)
    expect(result.diagnosticWarnings.some(w => w.includes('suy luận'))).toBe(true)
    // At least some scores should be parsed
    const hasScores = result.rows.some(r =>
      r.scoreOral !== null || r.score15m !== null || r.score1Period !== null
    )
    expect(hasScores).toBe(true)
  })

  it('excludes STT column from inference (CRITICAL-2 fix)', () => {
    // No header — but first column is STT (1, 2) which must NOT become scoreOral
    const text = '1\tGiuse\tNguyễn Văn A\t8\t7\t6\t5\t9\n2\tMaria\tTrần Thị B\t7\t8\t5\t6\t8'
    const result = parseGradeText(text, mockStudents)

    const oralCol = result.detectedColumns.find(d => d.field === 'scoreOral')
    expect(oralCol).toBeDefined()
    // STT column (index 0) must not be mapped to scoreOral
    expect(oralCol!.colIndex).not.toBe(0)
    // Real score 8 must land in scoreOral, NOT the STT value 1
    expect(result.rows[0]?.scoreOral).toBe(8)
    expect(result.rows[1]?.scoreOral).toBe(7)
    expect(result.inferred).toBe(true)
  })

  it('does NOT flag inferred when a header row was found', () => {
    const text = 'Tên Thánh\tHọ Tên\tMiệng\t15P\nGiuse\tNguyễn Văn A\t8\t7'
    const result = parseGradeText(text, mockStudents)
    expect(result.inferred).toBe(false)
    expect(result.headerRowIndex).toBe(0)
  })
})

describe('Empty and edge cases', () => {
  it('returns empty result for empty text', () => {
    const result = parseGradeText('', mockStudents)
    expect(result.rows).toHaveLength(0)
    expect(result.detectedColumns).toHaveLength(0)
    expect(result.diagnosticWarnings).toHaveLength(0)
  })

  it('returns correct diagnostic structure for paste with all null scores', () => {
    const text = 'Họ Tên\tUnknown1\tUnknown2\nNguyễn Văn A\tabc\tdef'
    const result = parseGradeText(text, mockStudents)

    // All scores should be null because no score columns detected
    if (result.rows.length > 0) {
      expect(result.rows[0].scoreOral).toBeNull()
      expect(result.rows[0].scoreFinal).toBeNull()
    }
  })
})

describe('matchStudentWithConfidence — Mã số fallback', () => {
  it('matches by exact Mã số when no name is available', () => {
    const result = matchStudentWithConfidence('TN-1002', undefined, '', mockStudents)

    expect(result?.student.id).toBe('ST-002')
    expect(result?.confidence).toBe(100)
    expect(result?.reasons[0]).toContain('Mã số')
  })

  it('falls back to Mã số when the name has a typo', () => {
    // "Nguyễn Văn An" vs "Nguyễn Văn A" — similarity < 90%, but Mã số khớp
    const result = matchStudentWithConfidence('TN-1001', undefined, 'Nguyễn Văn An', mockStudents)

    expect(result?.student.id).toBe('ST-001')
    expect(result?.reasons[0]).toContain('Mã số')
  })

  it('returns null when Mã số does not match', () => {
    expect(matchStudentWithConfidence('TN-9999', undefined, '', mockStudents)).toBeNull()
  })

  it('name match wins over Mã số', () => {
    // Tên khớp ST-001, Mã số thuộc ST-002 → phải khớp theo TÊN, không theo Mã số
    const result = matchStudentWithConfidence('TN-1002', 'Giuse', 'Nguyễn Văn A', mockStudents)

    expect(result?.student.id).toBe('ST-001')
  })

  it('parseGradeText matches + flags rows by Mã số when file has no name column', () => {
    const text = 'Mã số\tMiệng\t15P\tCK\nTN-1001\t8\t7\t9\nTN-1002\t7\t8\t8'
    const result = parseGradeText(text, mockStudents)

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].isValid).toBe(true)
    expect(result.rows[0].matchedStudent?.id).toBe('ST-001')
    expect(result.rows[0].warnings.some((w: string) => w.includes('Mã số'))).toBe(true)
    expect(result.rows[1].matchedStudent?.id).toBe('ST-002')
    expect(result.matchedCount).toBe(2)
    expect(result.unmatchedCount).toBe(0)
  })

  it('diagnostic warning mentions Mã số fallback when no name/code column found', () => {
    const text = 'Miệng\t15P\tCK\n8\t7\t9'
    const result = parseGradeText(text, mockStudents)

    expect(result.diagnosticWarnings.some((w: string) => w.includes('Mã số'))).toBe(true)
  })
})
