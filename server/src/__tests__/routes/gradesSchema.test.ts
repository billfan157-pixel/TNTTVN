import { describe, it, expect } from 'vitest'
import { gradeSchema } from '../../routes/grades.js'
import { getCurrentAcademicYear } from '../../utils/academicYear.js'

const baseGrade = {
  studentId: 'ST-001',
  semester: 1,
  scoreOral: 8,
}

describe('gradeSchema academicYear tolerance (ADR-016 sync-fix)', () => {
  it('accepts academicYear: "" and defaults to current academic year', () => {
    const parsed = gradeSchema.safeParse({ ...baseGrade, academicYear: '' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.academicYear).toBe(getCurrentAcademicYear())
    }
  })

  it('accepts missing academicYear and defaults to current academic year', () => {
    const parsed = gradeSchema.safeParse(baseGrade)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.academicYear).toBe(getCurrentAcademicYear())
    }
  })

  it('keeps a valid normalized academicYear', () => {
    const parsed = gradeSchema.safeParse({ ...baseGrade, academicYear: '2025 - 2026' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.academicYear).toBe('2025 - 2026')
    }
  })

  it('whole batch with empty academicYear records parses (no 400 regression)', () => {
    const results = [
      { ...baseGrade, studentId: 'ST-001', academicYear: '' },
      { ...baseGrade, studentId: 'ST-002', academicYear: '' },
      { ...baseGrade, studentId: 'ST-003' },
    ].map((g) => gradeSchema.safeParse(g))
    expect(results.every((r) => r.success)).toBe(true)
  })
})
