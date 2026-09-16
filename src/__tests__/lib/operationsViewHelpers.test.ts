import { describe, expect, it } from 'vitest'
import { formatEventInstant } from '../../components/operations/operationsViewHelpers'

describe('formatEventInstant (W2.11)', () => {
  it('renders in the recorded timezone and tags it when it differs from the browser', () => {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    const foreign = browserZone === 'Pacific/Auckland' ? 'Pacific/Fiji' : 'Pacific/Auckland'
    const text = formatEventInstant('2026-10-01T01:00:00Z', foreign)
    expect(text).not.toBe(new Date('2026-10-01T01:00:00Z').toLocaleString('vi-VN'))
    // The tag keeps the reading unambiguous on any device.
    expect(text).toMatch(/\(/)
  })

  it('falls back to plain local rendering when zones match or are absent', () => {
    const iso = '2026-10-01T01:00:00Z'
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(formatEventInstant(iso, browserZone)).toBe(new Date(iso).toLocaleString('vi-VN'))
    expect(formatEventInstant(iso, null)).toBe(new Date(iso).toLocaleString('vi-VN'))
    expect(formatEventInstant(iso, undefined)).toBe(new Date(iso).toLocaleString('vi-VN'))
  })
})
