import React from 'react'
import { describe, it, expect } from 'vitest'
import type { Student, GradeRecord } from '../types'

function makeMockGrade(overrides: Partial<GradeRecord>): GradeRecord {
  return {
    id: 'GR-MOCK',
    studentId: 'ST-0',
    academicYear: '2025-2026',
    semester: 1,
    scoreOral: null,
    scoreOral_source: null,
    scoreOral_updated_at: null,
    score15m: null,
    score15m_source: null,
    score15m_updated_at: null,
    score1Period: null,
    score1Period_source: null,
    score1Period_updated_at: null,
    scoreMidterm: null,
    scoreMidterm_source: null,
    scoreMidterm_updated_at: null,
    scoreFinal: null,
    scoreFinal_source: null,
    scoreFinal_updated_at: null,
    scoreDaoDuc: null,
    comments: '',
    ...overrides,
  }
}

// Re-create pure matrix data initialization logic from DesktopGradeMatrix before & after optimization
function legacyInitMatrixData(
  filteredStudents: Student[],
  grades: GradeRecord[],
  selectedSemester: 1 | 2,
  academicYear: string,
  matrixAcademicYear: string
): Record<string, Partial<GradeRecord>> {
  const normAY = (academicYear || '').replace(/\s*-\s*/g, '-').trim()
  const initialMap: Record<string, Partial<GradeRecord>> = {}
  filteredStudents.forEach(s => {
    const existing = grades.find(
      g => g.studentId === s.id &&
           g.semester === selectedSemester &&
           (!normAY || !g.academicYear || (g.academicYear || '').replace(/\s*-\s*/g, '-').trim() === normAY)
    )
    initialMap[s.id] = {
      studentId: s.id,
      semester: selectedSemester,
      academicYear: matrixAcademicYear,
      scoreOral: existing?.scoreOral ?? null,
      scoreOral_source: existing?.scoreOral_source ?? null,
      scoreOral_updated_at: existing?.scoreOral_updated_at ?? null,
      score15m: existing?.score15m ?? null,
      score15m_source: existing?.score15m_source ?? null,
      score15m_updated_at: existing?.score15m_updated_at ?? null,
      score1Period: existing?.score1Period ?? null,
      score1Period_source: existing?.score1Period_source ?? null,
      score1Period_updated_at: existing?.score1Period_updated_at ?? null,
      scoreMidterm: existing?.scoreMidterm ?? null,
      scoreMidterm_source: existing?.scoreMidterm_source ?? null,
      scoreMidterm_updated_at: existing?.scoreMidterm_updated_at ?? null,
      scoreFinal: existing?.scoreFinal ?? null,
      scoreFinal_source: existing?.scoreFinal_source ?? null,
      scoreFinal_updated_at: existing?.scoreFinal_updated_at ?? null,
      scoreDaoDuc: existing?.scoreDaoDuc ?? null,
      comments: existing?.comments || ''
    }
  })
  return initialMap
}

function optimizedInitMatrixData(
  filteredStudents: Student[],
  grades: GradeRecord[],
  selectedSemester: 1 | 2,
  academicYear: string,
  matrixAcademicYear: string
): Record<string, Partial<GradeRecord>> {
  const normAY = (academicYear || '').replace(/\s*-\s*/g, '-').trim()
  const gradeByStudent = new Map<string, GradeRecord>()
  for (const g of grades) {
    if (g.semester === selectedSemester) {
      const gNormAY = (g.academicYear || '').replace(/\s*-\s*/g, '-').trim()
      if (!normAY || !g.academicYear || gNormAY === normAY) {
        gradeByStudent.set(g.studentId, g)
      }
    }
  }

  const initialMap: Record<string, Partial<GradeRecord>> = {}
  filteredStudents.forEach(s => {
    const existing = gradeByStudent.get(s.id)
    initialMap[s.id] = {
      studentId: s.id,
      semester: selectedSemester,
      academicYear: matrixAcademicYear,
      scoreOral: existing?.scoreOral ?? null,
      scoreOral_source: existing?.scoreOral_source ?? null,
      scoreOral_updated_at: existing?.scoreOral_updated_at ?? null,
      score15m: existing?.score15m ?? null,
      score15m_source: existing?.score15m_source ?? null,
      score15m_updated_at: existing?.score15m_updated_at ?? null,
      score1Period: existing?.score1Period ?? null,
      score1Period_source: existing?.score1Period_source ?? null,
      score1Period_updated_at: existing?.score1Period_updated_at ?? null,
      scoreMidterm: existing?.scoreMidterm ?? null,
      scoreMidterm_source: existing?.scoreMidterm_source ?? null,
      scoreMidterm_updated_at: existing?.scoreMidterm_updated_at ?? null,
      scoreFinal: existing?.scoreFinal ?? null,
      scoreFinal_source: existing?.scoreFinal_source ?? null,
      scoreFinal_updated_at: existing?.scoreFinal_updated_at ?? null,
      scoreDaoDuc: existing?.scoreDaoDuc ?? null,
      comments: existing?.comments || ''
    }
  })
  return initialMap
}

describe('Task 1 — DesktopGradeMatrix Pre-Index Golden Test & Benchmark', () => {
  it('Golden Test: legacy vs optimized matrix initialization produces 100% deep-equal output for sample dataset with nulls & missing grades', () => {
    const sampleStudents: Student[] = Array.from({ length: 10 }, (_, i) => ({
      id: `ST-${i}`,
      code: `TN-${1000 + i}`,
      holyName: 'Thánh',
      fullName: `Học sinh ${i}`,
      gender: i % 2 === 0 ? 'Nam' : 'Nữ',
      dateOfBirth: '2015-01-01',
      parentName: 'Cha',
      parentPhone: '0901234567',
      address: 'Xứ',
      branch: 'ThieuNhi',
      classId: 'TN1',
      status: 'Đang học',
    }))

    const sampleGrades: GradeRecord[] = [
      makeMockGrade({
        id: 'GR-1',
        studentId: 'ST-0',
        scoreOral: 8.0,
        score1Period: 7.5,
        scoreFinal: 9.0,
        scoreDaoDuc: 10,
        comments: 'Ngoan',
      }),
      makeMockGrade({
        id: 'GR-2',
        studentId: 'ST-2',
        score15m: 8.5,
        scoreMidterm: 9.0,
        scoreDaoDuc: 9,
      }),
    ]

    const legacyOut = legacyInitMatrixData(sampleStudents, sampleGrades, 1, '2025-2026', '2025-2026')
    const optOut = optimizedInitMatrixData(sampleStudents, sampleGrades, 1, '2025-2026', '2025-2026')

    expect(optOut).toEqual(legacyOut)
  })

  it('Benchmark: compare execution time for 500 students × 5,000 grades', () => {
    const benchStudents: Student[] = Array.from({ length: 500 }, (_, i) => ({
      id: `ST-${i}`,
      code: `TN-${1000 + i}`,
      holyName: 'Thánh',
      fullName: `Học sinh ${i}`,
      gender: i % 2 === 0 ? 'Nam' : 'Nữ',
      dateOfBirth: '2015-01-01',
      parentName: 'Cha',
      parentPhone: '0901234567',
      address: 'Xứ',
      branch: 'ThieuNhi',
      classId: 'TN1',
      status: 'Đang học',
    }))

    const benchGrades: GradeRecord[] = Array.from({ length: 5000 }, (_, i) => makeMockGrade({
      id: `GR-${i}`,
      studentId: `ST-${i % 500}`,
      academicYear: '2025-2026',
      semester: (i % 2 === 0 ? 1 : 2) as 1 | 2,
      scoreOral: 8.0,
      score15m: 7.5,
      score1Period: 8.5,
      scoreMidterm: 9.0,
      scoreFinal: 8.0,
      scoreDaoDuc: 10,
    }))

    const startLegacy = performance.now()
    const legacyOut = legacyInitMatrixData(benchStudents, benchGrades, 1, '2025-2026', '2025-2026')
    const endLegacy = performance.now()

    const startOpt = performance.now()
    const optOut = optimizedInitMatrixData(benchStudents, benchGrades, 1, '2025-2026', '2025-2026')
    const endOpt = performance.now()

    console.log(`[BENCHMARK] Legacy matrix init time: ${(endLegacy - startLegacy).toFixed(2)}ms`)
    console.log(`[BENCHMARK] Optimized matrix init time: ${(endOpt - startOpt).toFixed(2)}ms`)

    expect(optOut).toEqual(legacyOut)
    expect(endOpt - startOpt).toBeLessThan(endLegacy - startLegacy)
  })
})
