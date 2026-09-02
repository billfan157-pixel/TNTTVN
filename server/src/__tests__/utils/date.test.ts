import { describe, expect, it } from 'vitest'
import { isValidIsoDate } from '../../utils/date.js'

describe('isValidIsoDate', () => {
  it.each([
    '2024-02-29',
    '2026-09-02',
    '1900-01-01',
  ])('accepts a real calendar date: %s', (value) => {
    expect(isValidIsoDate(value)).toBe(true)
  })

  it.each([
    '2023-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '2026-1-01',
    'not-a-date',
  ])('rejects an impossible or non-canonical date: %s', (value) => {
    expect(isValidIsoDate(value)).toBe(false)
  })
})
