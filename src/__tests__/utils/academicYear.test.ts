import { describe, it, expect } from 'vitest'
import {
  normalizeAcademicYear,
  matchAcademicYear,
  getCurrentAcademicYear,
  getAcademicYearDateRange,
  resolveActiveAcademicYear,
} from '../../utils/academicYear'

describe('normalizeAcademicYear', () => {
  it('normalizes spaced and unicode dash variants to canonical YYYY-YYYY', () => {
    expect(normalizeAcademicYear('2025 - 2026')).toBe('2025-2026')
    expect(normalizeAcademicYear(' 2025–2026 ')).toBe('2025-2026')
    expect(normalizeAcademicYear('2025—2026')).toBe('2025-2026')
    expect(normalizeAcademicYear('2025-2026')).toBe('2025-2026')
    expect(normalizeAcademicYear(undefined)).toBe('')
    expect(normalizeAcademicYear(null)).toBe('')
  })
})

describe('matchAcademicYear', () => {
  it('matches after normalization regardless of source format', () => {
    expect(matchAcademicYear('2025 - 2026', '2025-2026')).toBe(true)
    expect(matchAcademicYear('2025-2026', '2025–2026')).toBe(true)
    expect(matchAcademicYear('2025-2026', '2026-2027')).toBe(false)
  })
})

describe('getCurrentAcademicYear', () => {
  it('starts new year in August (month index >= 7)', () => {
    expect(getCurrentAcademicYear(new Date('2025-08-15'))).toBe('2025-2026')
    expect(getCurrentAcademicYear(new Date('2025-12-01'))).toBe('2025-2026')
    expect(getCurrentAcademicYear(new Date('2026-07-31'))).toBe('2025-2026')
    expect(getCurrentAcademicYear(new Date('2026-08-01'))).toBe('2026-2027')
    expect(getCurrentAcademicYear(new Date('2026-01-15'))).toBe('2025-2026')
  })
})

describe('getAcademicYearDateRange', () => {
  it('computes Aug 1 - Jul 31 fallback range (ADR-017 F2)', () => {
    expect(getAcademicYearDateRange('2025-2026')).toEqual({ startDate: '2025-08-01', endDate: '2026-07-31' })
    expect(getAcademicYearDateRange('2025 - 2026')).toEqual({ startDate: '2025-08-01', endDate: '2026-07-31' })
  })

  it('returns a wide (no-filter) range for unparseable years', () => {
    expect(getAcademicYearDateRange('')).toEqual({ startDate: '2000-01-01', endDate: '2099-12-31' })
    expect(getAcademicYearDateRange('2025-2027')).toEqual({ startDate: '2000-01-01', endDate: '2099-12-31' })
    expect(getAcademicYearDateRange('abc')).toEqual({ startDate: '2000-01-01', endDate: '2099-12-31' })
  })
})

describe('resolveActiveAcademicYear', () => {
  it('falls back to current date year when currentYear empty', () => {
    const expected = getCurrentAcademicYear()
    expect(resolveActiveAcademicYear('')).toBe(expected)
    expect(resolveActiveAcademicYear(undefined)).toBe(expected)
  })

  it('normalizes a provided currentYear', () => {
    expect(resolveActiveAcademicYear('2025 - 2026')).toBe('2025-2026')
  })
})
