import { describe, it, expect } from 'vitest'
import {
  normalizeAcademicYear,
  parseAcademicYear,
  computeAcademicYearDateRange,
  getCurrentAcademicYear,
  resolveAcademicYear,
  resolveSemester,
} from '../../utils/academicYear.js'

describe('normalizeAcademicYear Utility Unit Tests (Fix F15)', () => {
  it('normalizes standard year string without whitespace', () => {
    expect(normalizeAcademicYear('2025-2026')).toBe('2025-2026')
  })

  it('normalizes spaces around hyphens', () => {
    expect(normalizeAcademicYear('2025 - 2026')).toBe('2025-2026')
    expect(normalizeAcademicYear(' 2025  -  2026 ')).toBe('2025-2026')
  })

  it('normalizes en-dash and em-dash characters', () => {
    expect(normalizeAcademicYear('2025–2026')).toBe('2025-2026')
    expect(normalizeAcademicYear('2025 — 2026')).toBe('2025-2026')
  })

  it('normalizes prefixed persistence IDs to the canonical reporting year', () => {
    expect(normalizeAcademicYear('AY-2025-2026')).toBe('2025-2026')
  })

  it('provides default fallback for null or undefined input', () => {
    // UTIL-DRIFT-1: fallback động theo năm hiện tại (quy ước tháng 8), không hardcode.
    const current = getCurrentAcademicYear()
    expect(normalizeAcademicYear(null)).toBe(current)
    expect(normalizeAcademicYear(undefined)).toBe(current)
    expect(normalizeAcademicYear('')).toBe(current)
  })
})

describe('parseAcademicYear (ADR-017 F2)', () => {
  it('parses canonical format', () => {
    expect(parseAcademicYear('2025-2026')).toEqual({ startYear: 2025, endYear: 2026 })
  })

  it('rejects malformed or non-consecutive years', () => {
    expect(parseAcademicYear('2025 - 2026')).toBeNull()
    expect(parseAcademicYear('2025-2027')).toBeNull()
    expect(parseAcademicYear('abc')).toBeNull()
    expect(parseAcademicYear('')).toBeNull()
  })
})

describe('computeAcademicYearDateRange (ADR-017 F2)', () => {
  it('computes Aug 1 - Jul 31 convention range', () => {
    expect(computeAcademicYearDateRange('2025-2026')).toEqual({ startDate: '2025-08-01', endDate: '2026-07-31' })
  })

  it('returns wide no-filter range for unparseable years', () => {
    expect(computeAcademicYearDateRange('2025 - 2026')).toEqual({ startDate: '2000-01-01', endDate: '2099-12-31' })
  })
})

describe('getCurrentAcademicYear (ADR-017)', () => {
  it('starts new year in August', () => {
    expect(getCurrentAcademicYear(new Date('2025-08-15'))).toBe('2025-2026')
    expect(getCurrentAcademicYear(new Date('2026-07-31'))).toBe('2025-2026')
    expect(getCurrentAcademicYear(new Date('2026-08-01'))).toBe('2026-2027')
  })
})

describe('resolveAcademicYear / resolveSemester (ATT-02: thống nhất ranh giới tháng 8)', () => {
  it('August belongs to the new academic year (matches rest of system)', () => {
    expect(resolveAcademicYear('2025-08-15')).toBe('2025-2026')
    expect(resolveSemester('2025-08-15')).toBe(1)
    expect(resolveAcademicYear('2026-08-01')).toBe('2026-2027')
    expect(resolveSemester('2026-08-01')).toBe(1)
  })

  it('July belongs to the previous academic year', () => {
    expect(resolveAcademicYear('2025-07-31')).toBe('2024-2025')
    expect(resolveSemester('2025-07-31')).toBe(2)
  })

  it('Aug - Jan is semester 1, Feb - July is semester 2', () => {
    expect(resolveSemester('2025-08-01')).toBe(1)
    expect(resolveSemester('2026-01-15')).toBe(1)
    expect(resolveSemester('2026-02-01')).toBe(2)
    expect(resolveSemester('2026-06-30')).toBe(2)
  })

  it('matches getCurrentAcademicYear at the August boundary', () => {
    for (const d of ['2025-08-01', '2025-08-31', '2026-07-31']) {
      expect(resolveAcademicYear(d)).toBe(getCurrentAcademicYear(new Date(d)))
    }
  })
})
