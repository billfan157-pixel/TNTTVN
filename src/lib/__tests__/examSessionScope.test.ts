import { describe, expect, it } from 'vitest'
import { normalizeExamSessionClassFilter } from '../examSessionScope'

describe('normalizeExamSessionClassFilter', () => {
  it('chuyển sentinel all thành null để tải các phiên được phép xem', () => {
    expect(normalizeExamSessionClassFilter('all')).toBeNull()
  })

  it('giữ lại ID lớp thật và xử lý null/undefined', () => {
    expect(normalizeExamSessionClassFilter('CL-1')).toBe('CL-1')
    expect(normalizeExamSessionClassFilter(null)).toBeNull()
    expect(normalizeExamSessionClassFilter(undefined)).toBeNull()
  })
})
