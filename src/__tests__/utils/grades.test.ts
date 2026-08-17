import React from 'react'
import { describe, it, expect } from 'vitest'
import {
  calculateGradeAverage,
  calculateAttendanceRate,
  escapeHtml,
  DEFAULT_GRADE_WEIGHTS,
  type GradeWeightsConfig,
} from '../../utils/grades'
import { GradePolicyEngine } from '../../utils/gradePolicy'

describe('escapeHtml', () => {
  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })

  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;')
    expect(escapeHtml("it's")).toBe('it&#039;s')
    expect(escapeHtml('a&b')).toBe('a&amp;b')
  })

  it('returns string representation of numbers', () => {
    expect(escapeHtml(8.5)).toBe('8.5')
    expect(escapeHtml(0)).toBe('0')
  })
})

describe('GradePolicyEngine', () => {
  it('normalizes out-of-range values and computes a stable weighted average', () => {
    const engine = new GradePolicyEngine()
    const result = engine.calculateAverage({
      scoreOral: 15,
      score15m: -1,
      score1Period: 9,
      scoreMidterm: 8.7,
      scoreFinal: 9.5,
    })

    expect(result.score).toBe(8.2)
    expect(result.label).toBe('Giỏi')
    expect(engine.normalizeScore(15)).toBe(10)
    expect(engine.normalizeScore(-5)).toBe(0)
  })

  it('honors required fields and classification thresholds consistently', () => {
    const engine = new GradePolicyEngine()
    const missing = engine.calculateAverage(
      { scoreOral: 10, score15m: null, score1Period: null, scoreMidterm: null, scoreFinal: null },
      { requiredFields: ['scoreMidterm', 'scoreFinal'] }
    )
    expect(missing).toEqual({ score: null, label: 'Chưa đủ bài' })

    const valid = engine.calculateAverage(
      { scoreOral: 7, score15m: 7, score1Period: 7, scoreMidterm: 7, scoreFinal: 7 },
      { requiredFields: ['scoreMidterm', 'scoreFinal'] }
    )
    expect(valid.score).toBe(7)
    expect(valid.label).toBe('Khá')
  })
})

describe('calculateGradeAverage', () => {
  it('returns null score with label for null/undefined grade', () => {
    expect(calculateGradeAverage(null)).toEqual({ score: null, label: 'Chưa có điểm' })
    expect(calculateGradeAverage(undefined)).toEqual({ score: null, label: 'Chưa có điểm' })
  })

  it('returns "Chưa nhập" when all scores are null', () => {
    const result = calculateGradeAverage({
      scoreOral: null, score15m: null, score1Period: null, scoreMidterm: null, scoreFinal: null,
    })
    expect(result).toEqual({ score: null, label: 'Chưa nhập' })
  })

  it('calculates weighted average with default weights', () => {
    const result = calculateGradeAverage({
      scoreOral: 10, score15m: 10, score1Period: 10, scoreMidterm: 10, scoreFinal: 10,
    })
    expect(result.score).toBe(10)
    expect(result.label).toBe('Xuất Sắc')
  })

  it('correctly computes weighted average (oral*1 + 15m*1 + 1p*2 + mid*2 + final*3) / 9', () => {
    const result = calculateGradeAverage({
      scoreOral: 8, score15m: 7, score1Period: 6, scoreMidterm: 8, scoreFinal: 9,
    })
    const expected = Math.round((8*1 + 7*1 + 6*2 + 8*2 + 9*3) / 9 * 10) / 10
    expect(result.score).toBe(expected)
  })

  it('classifies scores correctly', () => {
    expect(calculateGradeAverage({ scoreOral: 9.5, score15m: 9, score1Period: 9, scoreMidterm: 9, scoreFinal: 9 }).label).toBe('Xuất Sắc')
    expect(calculateGradeAverage({ scoreOral: 8.5, score15m: 8, score1Period: 8, scoreMidterm: 8, scoreFinal: 8 }).label).toBe('Giỏi')
    expect(calculateGradeAverage({ scoreOral: 7, score15m: 7, score1Period: 7, scoreMidterm: 7, scoreFinal: 7 }).label).toBe('Khá')
    expect(calculateGradeAverage({ scoreOral: 5.5, score15m: 5.5, score1Period: 5.5, scoreMidterm: 5.5, scoreFinal: 5.5 }).label).toBe('Trung Bình')
    expect(calculateGradeAverage({ scoreOral: 3, score15m: 3, score1Period: 3, scoreMidterm: 3, scoreFinal: 3 }).label).toBe('Yếu')
  })

  it('clamps values to 0-10 range', () => {
    const result = calculateGradeAverage({
      scoreOral: 15, score15m: -1, score1Period: 10, scoreMidterm: 10, scoreFinal: 10,
    })
    expect(result.score).not.toBeNull()
  })

  it('handles partial scores (only some fields present)', () => {
    const result = calculateGradeAverage({
      scoreOral: 8, score15m: null, score1Period: null, scoreMidterm: null, scoreFinal: 9,
    })
    const expected = Math.round((8*1 + 9*3) / 4 * 10) / 10
    expect(result.score).toBe(expected)
  })

  it('uses custom weights when provided', () => {
    const custom: GradeWeightsConfig = { ...DEFAULT_GRADE_WEIGHTS, weightFinal: 5, weightOral: 2 }
    const result = calculateGradeAverage(
      { scoreOral: 10, score15m: null, score1Period: null, scoreMidterm: null, scoreFinal: 10 },
      custom,
    )
    const expected = Math.round((10*2 + 10*5) / 7 * 10) / 10
    expect(result.score).toBe(expected)
  })

  it('respects GradeCalculationPolicy required fields', () => {
    const policy = { requiredFields: ['scoreMidterm', 'scoreFinal'] as Array<'scoreOral' | 'score15m' | 'score1Period' | 'scoreMidterm' | 'scoreFinal'> }
    // Single Oral score with missing Midterm/Final returns 'Chưa đủ bài'
    const resultMissing = calculateGradeAverage(
      { scoreOral: 10, score15m: null, score1Period: null, scoreMidterm: null, scoreFinal: null },
      DEFAULT_GRADE_WEIGHTS,
      policy
    )
    expect(resultMissing).toEqual({ score: null, label: 'Chưa đủ bài' })

    // Valid when required fields are present
    const resultPresent = calculateGradeAverage(
      { scoreOral: 10, score15m: null, score1Period: null, scoreMidterm: 8, scoreFinal: 9 },
      DEFAULT_GRADE_WEIGHTS,
      policy
    )
    expect(resultPresent.score).not.toBeNull()
  })
})

describe('calculateAttendanceRate', () => {
  it('returns 100% for 0/0', () => {
    expect(calculateAttendanceRate(0, 0)).toEqual({ rate: 100, presentCount: 0, totalCount: 0 })
  })

  it('computes percentage correctly', () => {
    expect(calculateAttendanceRate(8, 10)).toEqual({ rate: 80, presentCount: 8, totalCount: 10 })
    expect(calculateAttendanceRate(10, 10)).toEqual({ rate: 100, presentCount: 10, totalCount: 10 })
    expect(calculateAttendanceRate(0, 5)).toEqual({ rate: 0, presentCount: 0, totalCount: 5 })
  })

  it('rounds to 1 decimal to match server AttendanceRateSpecification (ADR-017)', () => {
    // 35/44 = 79.545… → 79.5 (khớp server Math.round(rate*10)/10); Math.round cũ
    // trả 80 → lật ngưỡng 80% sai.
    expect(calculateAttendanceRate(35, 44)).toEqual({ rate: 79.5, presentCount: 35, totalCount: 44 })
    expect(calculateAttendanceRate(7, 9)).toEqual({ rate: 77.8, presentCount: 7, totalCount: 9 })
  })
})
