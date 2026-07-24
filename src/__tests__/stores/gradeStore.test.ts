import { describe, it, expect } from 'vitest'
import { calculateGradeAverage, calculateAttendanceRate, type GradeInput } from '../../utils/grades'

describe('Grade & Attendance Utility Functions', () => {
  it('calculates average score correctly with weights', () => {
    const gradeRecord: GradeInput = {
      scoreOral: 8,
      score15m: 9,
      score1Period: 8,
      scoreMidterm: 9,
      scoreFinal: 9,
    }
    const result = calculateGradeAverage(gradeRecord)
    expect(result.score).toBeGreaterThanOrEqual(8.0)
    expect(result.label).toBe('Giỏi')
  })

  it('returns score: null and label: Chưa nhập when all scores are missing', () => {
    const emptyRecord: Partial<GradeInput> = {}
    const result = calculateGradeAverage(emptyRecord as GradeInput)
    expect(result.score).toBeNull()
    expect(result.label).toBe('Chưa nhập')
  })

  it('calculates attendance percentage rate correctly', () => {
    const rate = calculateAttendanceRate(18, 20)
    expect(rate.rate).toBe(90)
    expect(rate.presentCount).toBe(18)
    expect(rate.totalCount).toBe(20)
  })

  it('handles 0 total attendance sessions gracefully without division by zero', () => {
    const rate = calculateAttendanceRate(0, 0)
    expect(rate.rate).toBe(100)
    expect(rate.presentCount).toBe(0)
    expect(rate.totalCount).toBe(0)
  })
})
