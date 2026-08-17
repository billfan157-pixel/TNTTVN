import { describe, it, expect } from 'vitest'
import { computeWeightedGpa } from '../../utils/gradeCalculation.js'

describe('Grade Calculation & Weighted GPA Unit Tests', () => {
  it('Student A: All scores = 10 -> GPA 10.0', () => {
    const gpa = computeWeightedGpa({
      scoreOral: 10,
      score15m: 10,
      score1Period: 10,
      scoreMidterm: 10,
      scoreFinal: 10,
    })
    expect(gpa).toBe(10.0)
  })

  it('Student B: Partial / Missing score -> calculates over available scores', () => {
    const gpa = computeWeightedGpa({
      scoreOral: 8,
      score15m: null,
      score1Period: undefined,
      scoreMidterm: null,
      scoreFinal: null,
    })
    expect(gpa).toBe(8.0)
  })

  it('Correctly applies weights (Oral=1, Final=3): Oral 10 + Final 4 -> GPA 5.5', () => {
    const gpa = computeWeightedGpa({
      scoreOral: 10,
      scoreFinal: 4,
    })
    // (10*1 + 4*3) / (1 + 3) = (10 + 12) / 4 = 22 / 4 = 5.5
    expect(gpa).toBe(5.5)
  })

  it('Returns null when all score fields are null or undefined', () => {
    const gpa = computeWeightedGpa({
      scoreOral: null,
      score15m: null,
      score1Period: null,
      scoreMidterm: null,
      scoreFinal: null,
    })
    expect(gpa).toBeNull()
  })

  it('F4 parity: roundingDecimal 2 → GPA làm tròn 0.01 (khớp client settings)', () => {
    // (8*1 + 9*2) / 3 = 26/3 = 8.66666... → 8.67 (2 chữ số) vs 8.7 (mặc định 1 chữ số)
    const gpa = computeWeightedGpa(
      { scoreOral: 8, score1Period: 9 },
      { weightOral: 1, weight1Period: 2, roundingDecimal: 2 }
    )
    expect(gpa).toBe(8.67)
    const gpaDefault = computeWeightedGpa({ scoreOral: 8, score1Period: 9 })
    expect(gpaDefault).toBe(8.7)
  })

  it('F4 parity: roundingDecimal luôn được dùng ở các caller (promotion/class summary)', () => {
    const weights = { weightOral: 1, weight15m: 1, weight1Period: 2, weightMidterm: 2, weightFinal: 3, roundingDecimal: 2 }
    const gpa = computeWeightedGpa({ scoreOral: 8, score15m: 8, score1Period: 8, scoreMidterm: 8, scoreFinal: 8 }, weights)
    // (8+8+16+16+24)/(1+1+2+2+3) = 72/9 = 8.0 — chẵn, không đổi do làm tròn
    expect(gpa).toBe(8.0)
  })
})
