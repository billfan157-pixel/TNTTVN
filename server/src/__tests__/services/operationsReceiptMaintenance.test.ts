// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getOperationsReceiptRetentionDays } from '../../services/operationsReceiptMaintenance.js'

describe('Operations receipt retention policy gate', () => {
  it('stays disabled without an approved configured duration', () => {
    expect(getOperationsReceiptRetentionDays(undefined)).toBeNull()
    expect(getOperationsReceiptRetentionDays('   ')).toBeNull()
  })

  it('accepts an explicit bounded whole-day policy', () => {
    expect(getOperationsReceiptRetentionDays('30')).toBe(30)
    expect(getOperationsReceiptRetentionDays('3650')).toBe(3650)
  })

  it.each(['0', '-1', '1.5', '3651', 'not-a-number'])(
    'rejects invalid configured retention %s instead of silently disabling maintenance',
    value => expect(() => getOperationsReceiptRetentionDays(value)).toThrow(/integer from 1 to 3650/i),
  )
})
