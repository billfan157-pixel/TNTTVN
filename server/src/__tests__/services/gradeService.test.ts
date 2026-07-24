import { describe, it, expect } from 'vitest'
import { getGrades, upsertGrade, upsertGradeBatch } from '../../services/gradeService.js'

describe('Server gradeService Layer Unit Tests', () => {
  it('upsertGrade inserts or updates a grade record', async () => {
    const gradeData = {
      studentId: 'ST-001',
      academicYear: '2025 - 2026',
      semester: 1 as const,
      scoreOral: 10,
      score15m: 9,
      score1Period: 9,
      scoreMidterm: 10,
      scoreFinal: 10,
      comments: 'Chăm chỉ, đạt điểm cao',
    }

    const res = await upsertGrade(gradeData, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')
    expect(res).not.toBeNull()
    expect(res?.scoreFinal).toBe(10)
  })

  it('getGrades fetches list of grade records for parish', async () => {
    const grades = await getGrades('thanh-gia')
    expect(Array.isArray(grades)).toBe(true)
    expect(grades.length).toBeGreaterThan(0)
  })

  it('upsertGradeBatch upserts multiple grade records in a single batch', async () => {
    const batchData = [
      { studentId: 'ST-002', semester: 1 as const, academicYear: '2025 - 2026', scoreOral: 8, scoreFinal: 8.5 },
      { studentId: 'ST-003', semester: 1 as const, academicYear: '2025 - 2026', scoreOral: 9, scoreFinal: 9.5 },
    ]

    const ok = await upsertGradeBatch(batchData, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')
    expect(ok).toBe(true)
  })
})
