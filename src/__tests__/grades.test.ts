import { describe, it, expect } from 'vitest'
import { calculateGradeAverage, calculateAttendanceRate } from '../utils/grades'

describe('calculateGradeAverage', () => {
  it('returns null score for null input', () => {
    const result = calculateGradeAverage(null)
    expect(result.score).toBeNull()
    expect(result.label).toBe('Chưa có điểm')
  })

  it('returns null score for undefined input', () => {
    const result = calculateGradeAverage(undefined)
    expect(result.score).toBeNull()
    expect(result.label).toBe('Chưa có điểm')
  })

  it('returns "Chưa nhập" when all scores are null', () => {
    const result = calculateGradeAverage({
      scoreOral: null,
      score15m: null,
      score1Period: null,
      scoreMidterm: null,
      scoreFinal: null,
    })
    expect(result.score).toBeNull()
    expect(result.label).toBe('Chưa nhập')
  })

  it('calculates average correctly with all scores', () => {
    const result = calculateGradeAverage({
      scoreOral: 9,
      score15m: 8.5,
      score1Period: 9,
      scoreMidterm: 8.5,
      scoreFinal: 9,
    })
    // (9*1 + 8.5*1 + 9*2 + 8.5*2 + 9*3) / (1+1+2+2+3) = (9+8.5+18+17+27)/9 = 79.5/9 = 8.8
    expect(result.score).toBe(8.8)
    expect(result.label).toBe('Giỏi')
  })

  it('classifies "Xuất Sắc" when avg >= 9.0', () => {
    const result = calculateGradeAverage({
      scoreOral: 10,
      score15m: 9.5,
      score1Period: 9.5,
      scoreMidterm: 10,
      scoreFinal: 10,
    })
    expect(result.score).toBe(9.8)
    expect(result.label).toBe('Xuất Sắc')
  })

  it('classifies "Giỏi" when 8.0 <= avg < 9.0', () => {
    const result = calculateGradeAverage({
      scoreOral: 8,
      score15m: 8,
      score1Period: 8,
      scoreMidterm: 8,
      scoreFinal: 8,
    })
    expect(result.score).toBe(8.0)
    expect(result.label).toBe('Giỏi')
  })

  it('classifies "Khá" when 6.5 <= avg < 8.0', () => {
    const result = calculateGradeAverage({
      scoreOral: 7,
      score15m: 7,
      score1Period: 7,
      scoreMidterm: 7,
      scoreFinal: 7,
    })
    // (7 + 7 + 14 + 14 + 21) / 9 = 63/9 = 7.0
    expect(result.score).toBe(7.0)
    expect(result.label).toBe('Khá')
  })

  it('classifies "Trung Bình" when 5.0 <= avg < 6.5', () => {
    const result = calculateGradeAverage({
      scoreOral: 6,
      score15m: 6,
      score1Period: 6,
      scoreMidterm: 5,
      scoreFinal: 5,
    })
    expect(result.label).toBe('Trung Bình')
  })

  it('classifies "Yếu" when avg < 5.0', () => {
    const result = calculateGradeAverage({
      scoreOral: 4,
      score15m: 4,
      score1Period: 4,
      scoreMidterm: 4,
      scoreFinal: 4,
    })
    expect(result.label).toBe('Yếu')
  })

  it('handles partial scores (only oral)', () => {
    const result = calculateGradeAverage({
      scoreOral: 9,
      score15m: null,
      score1Period: null,
      scoreMidterm: null,
      scoreFinal: null,
    })
    expect(result.score).toBe(9.0)
    expect(result.label).toBe('Xuất Sắc')
  })

  it('handles edge case: all zeros', () => {
    const result = calculateGradeAverage({
      scoreOral: 0,
      score15m: 0,
      score1Period: 0,
      scoreMidterm: 0,
      scoreFinal: 0,
    })
    expect(result.score).toBe(0)
    expect(result.label).toBe('Yếu')
  })

  it('handles boundary: avg exactly 9.0', () => {
    const result = calculateGradeAverage({
      scoreOral: 9,
      score15m: 9,
      score1Period: 9,
      scoreMidterm: 9,
      scoreFinal: 9,
    })
    // (9+9+18+18+27)/9 = 81/9 = 9.0
    expect(result.score).toBe(9.0)
    expect(result.label).toBe('Xuất Sắc')
  })

  it('handles boundary: avg exactly 8.0', () => {
    const result = calculateGradeAverage({
      scoreOral: 8,
      score15m: 8,
      score1Period: 8,
      scoreMidterm: 8,
      scoreFinal: 8,
    })
    expect(result.score).toBe(8.0)
    expect(result.label).toBe('Giỏi')
  })

  it('handles boundary: avg exactly 6.5', () => {
    const result = calculateGradeAverage({
      scoreOral: 6,
      score15m: 7,
      score1Period: 6,
      scoreMidterm: 7,
      scoreFinal: 6.5,
    })
    expect(result.score).toBe(6.5)
    expect(result.label).toBe('Khá')
  })

  it('handles boundary: avg exactly 5.0', () => {
    const result = calculateGradeAverage({
      scoreOral: 5,
      score15m: 5,
      score1Period: 5,
      scoreMidterm: 5,
      scoreFinal: 5,
    })
    expect(result.score).toBe(5.0)
    expect(result.label).toBe('Trung Bình')
  })

  it('handles only scoreMidterm at max (10), all others 0', () => {
    const result = calculateGradeAverage({
      scoreOral: 0, score15m: 0, score1Period: 0, scoreMidterm: 10, scoreFinal: 0,
    })
    // totalPoints = 20, weights = 9, avg = 2.222... → rounds to 2.2
    expect(result.score).toBe(2.2)
    expect(result.label).toBe('Yếu')
  })

  it('handles only score15m at max (10), all others 0', () => {
    const result = calculateGradeAverage({
      scoreOral: 0, score15m: 10, score1Period: 0, scoreMidterm: 0, scoreFinal: 0,
    })
    // totalPoints = 10, weights = 9, avg = 1.111... → rounds to 1.1
    expect(result.score).toBe(1.1)
    expect(result.label).toBe('Yếu')
  })

  it('handles only scoreFinal with value (weight 3), rest null', () => {
    const result = calculateGradeAverage({
      scoreOral: null, score15m: null, score1Period: null, scoreMidterm: null, scoreFinal: 7,
    })
    // totalPoints = 21, weights = 3
    expect(result.score).toBe(7.0)
    expect(result.label).toBe('Khá')
  })

  it('handles only score1Period with value (weight 2), rest null', () => {
    const result = calculateGradeAverage({
      scoreOral: null, score15m: null, score1Period: 9, scoreMidterm: null, scoreFinal: null,
    })
    // totalPoints = 18, weights = 2
    expect(result.score).toBe(9.0)
    expect(result.label).toBe('Xuất Sắc')
  })

  it('handles decimal score values correctly (oral+15m only)', () => {
    const result = calculateGradeAverage({
      scoreOral: 7.5, score15m: 8.5, score1Period: null, scoreMidterm: null, scoreFinal: null,
    })
    // (7.5 + 8.5) / 2 = 8.0
    expect(result.score).toBe(8.0)
    expect(result.label).toBe('Giỏi')
  })

  it('passes with scores at max (10) across all fields', () => {
    const result = calculateGradeAverage({
      scoreOral: 10, score15m: 10, score1Period: 10, scoreMidterm: 10, scoreFinal: 10,
    })
    // (10+10+20+20+30)/9 = 90/9 = 10.0
    expect(result.score).toBe(10.0)
    expect(result.label).toBe('Xuất Sắc')
  })
})

describe('calculateAttendanceRate', () => {
  it('returns 100% when no records', () => {
    const result = calculateAttendanceRate(0, 0)
    expect(result.rate).toBe(100)
    expect(result.presentCount).toBe(0)
    expect(result.totalCount).toBe(0)
  })

  it('calculates correct rate', () => {
    const result = calculateAttendanceRate(8, 10)
    expect(result.rate).toBe(80)
    expect(result.presentCount).toBe(8)
    expect(result.totalCount).toBe(10)
  })

  it('returns 0% when no presence', () => {
    const result = calculateAttendanceRate(0, 10)
    expect(result.rate).toBe(0)
  })

  it('returns 100% when all present', () => {
    const result = calculateAttendanceRate(10, 10)
    expect(result.rate).toBe(100)
  })
})
