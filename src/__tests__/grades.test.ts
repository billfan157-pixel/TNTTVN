import { describe, it, expect } from 'vitest'
import { calculateGradeAverage, calculateAttendanceRate, type GradeWeightsConfig } from '../utils/grades'

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

  it('calculates average correctly with all default scores', () => {
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

  it('calculates average correctly with custom column weights', () => {
    const customConfig: GradeWeightsConfig = {
      weightOral: 1,
      weight15m: 1,
      weight1Period: 1,
      weightMidterm: 3,
      weightFinal: 4,
      xuatSacThreshold: 9.0,
      gioiThreshold: 8.0,
      khaThreshold: 6.5,
      trungBinhThreshold: 5.0,
      roundingDecimal: 1,
    }

    const result = calculateGradeAverage(
      {
        scoreOral: 8,
        score15m: 8,
        score1Period: 8,
        scoreMidterm: 10,
        scoreFinal: 10,
      },
      customConfig
    )

    // (8*1 + 8*1 + 8*1 + 10*3 + 10*4) / (1+1+1+3+4) = (8+8+8+30+40)/10 = 94/10 = 9.4
    expect(result.score).toBe(9.4)
    expect(result.label).toBe('Xuất Sắc')
  })

  it('calculates average with custom rounding decimal precision', () => {
    const customConfig: GradeWeightsConfig = {
      weightOral: 1,
      weight15m: 1,
      weight1Period: 2,
      weightMidterm: 2,
      weightFinal: 3,
      xuatSacThreshold: 9.0,
      gioiThreshold: 8.0,
      khaThreshold: 6.5,
      trungBinhThreshold: 5.0,
      roundingDecimal: 2, // 2 decimal places
    }

    const result = calculateGradeAverage(
      {
        scoreOral: 8,
        score15m: 9,
        score1Period: 8.5,
        scoreMidterm: 9.5,
        scoreFinal: 9,
      },
      customConfig
    )

    // (8*1 + 9*1 + 8.5*2 + 9.5*2 + 9*3) / 9 = (8+9+17+19+27)/9 = 80/9 = 8.89
    expect(result.score).toBe(8.89)
  })
})

describe('calculateAttendanceRate', () => {
  it('calculates 100% when totalCount is 0', () => {
    const res = calculateAttendanceRate(0, 0)
    expect(res.rate).toBe(100)
  })

  it('calculates percentage correctly', () => {
    const res = calculateAttendanceRate(8, 10)
    expect(res.rate).toBe(80)
  })
})
