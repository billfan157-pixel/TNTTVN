// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  initOperationsEventLifecycleScheduler,
  stopOperationsEventLifecycleScheduler,
} from '../services/operationsEventLifecycleService.js'
import {
  initOperationsManagerReminderScheduler,
  stopOperationsManagerReminderScheduler,
} from '../services/operationsManagerReminderService.js'
import {
  initOperationsReceiptMaintenance,
  runOperationsReceiptMaintenance,
  stopOperationsReceiptMaintenance,
} from '../services/operationsReceiptMaintenance.js'
import {
  initOperationsReminderScheduler,
  stopOperationsReminderScheduler,
} from '../services/operationsReminderService.js'
import {
  initOperationsTaskDispatchScheduler,
  stopOperationsTaskDispatchScheduler,
} from '../services/operationsTaskDispatchService.js'

// P1-12: the five Operations background lifecycles previously had no test.
// Ticks run on 30s/daily cadences against the real DB, so these tests pin the
// lifecycle contract (idempotent init, safe stop, clean shutdown) rather than
// wall-clock timing — cadence timing would need timer injection.
describe('P1-12 Operations scheduler lifecycle', () => {
  it('starts and stops the reminder scheduler idempotently', () => {
    expect(() => {
      stopOperationsReminderScheduler()
      initOperationsReminderScheduler()
      initOperationsReminderScheduler()
      stopOperationsReminderScheduler()
      stopOperationsReminderScheduler()
    }).not.toThrow()
  })

  it('starts and stops the event lifecycle scheduler idempotently', () => {
    expect(() => {
      stopOperationsEventLifecycleScheduler()
      initOperationsEventLifecycleScheduler()
      initOperationsEventLifecycleScheduler()
      stopOperationsEventLifecycleScheduler()
      stopOperationsEventLifecycleScheduler()
    }).not.toThrow()
  })

  it('starts and stops the task dispatch scheduler idempotently', () => {
    expect(() => {
      stopOperationsTaskDispatchScheduler()
      initOperationsTaskDispatchScheduler()
      initOperationsTaskDispatchScheduler()
      stopOperationsTaskDispatchScheduler()
      stopOperationsTaskDispatchScheduler()
    }).not.toThrow()
  })

  it('starts and stops the manager reminder scheduler idempotently', () => {
    expect(() => {
      stopOperationsManagerReminderScheduler()
      initOperationsManagerReminderScheduler()
      initOperationsManagerReminderScheduler()
      stopOperationsManagerReminderScheduler()
      stopOperationsManagerReminderScheduler()
    }).not.toThrow()
  })

  it('keeps receipt maintenance disabled without retention and stops cleanly', async () => {
    const previous = process.env.OPERATIONS_RECEIPT_RESPONSE_RETENTION_DAYS
    delete process.env.OPERATIONS_RECEIPT_RESPONSE_RETENTION_DAYS
    try {
      expect(await runOperationsReceiptMaintenance()).toBe(0)
      await expect(initOperationsReceiptMaintenance()).resolves.toBeUndefined()
    } finally {
      if (previous === undefined) delete process.env.OPERATIONS_RECEIPT_RESPONSE_RETENTION_DAYS
      else process.env.OPERATIONS_RECEIPT_RESPONSE_RETENTION_DAYS = previous
      stopOperationsReceiptMaintenance()
    }
    expect(() => stopOperationsReceiptMaintenance()).not.toThrow()
  })
})
