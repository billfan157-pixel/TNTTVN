// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARISH_TIME_ZONE, getParishTimeZone, parishCalendarDate } from '../../utils/parishTimeZone.js'

describe('parish server-authoritative calendar date', () => {
  it('defaults to the Catevia parish timezone', () => {
    expect(getParishTimeZone(undefined)).toBe(DEFAULT_PARISH_TIME_ZONE)
  })

  it('crosses the civil date at midnight in the configured parish timezone', () => {
    const instant = new Date('2026-12-31T17:30:00.000Z')
    expect(parishCalendarDate(instant, 'Asia/Ho_Chi_Minh')).toBe('2027-01-01')
    expect(parishCalendarDate(instant, 'UTC')).toBe('2026-12-31')
  })

  it('fails closed for an invalid configured timezone', () => {
    expect(() => getParishTimeZone('Not/A_Real_Time_Zone')).toThrow('PARISH_TIME_ZONE must be a valid IANA time zone')
    expect(() => parishCalendarDate(new Date('invalid'))).toThrow('invalid instant')
  })
})
