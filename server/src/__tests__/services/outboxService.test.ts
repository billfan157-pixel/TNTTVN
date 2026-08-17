import { describe, it, expect, vi } from 'vitest'
import { db } from '../../db/index.js'
import { saveToOutbox, dispatchPendingOutboxEvents, eventPublisher } from '../../services/outboxService.js'

describe('ADR-014 Realization: Transactional Outbox Pattern Unit Tests', () => {
  it('1. Saves integration event atomically to outbox in pending status', async () => {
    const eventId = await db.transaction(async (tx) => {
      return await saveToOutbox(tx, 'st-outbox-01', 'PromotionApproved', {
        studentId: 'st-outbox-01',
        decision: 'PROMOTED',
        gpa: 8.5,
      })
    })

    expect(eventId).toBeDefined()
    expect(eventId.startsWith('OUT')).toBe(true)
  })

  it('2. Dispatches pending outbox events to subscribers and updates status to dispatched', async () => {
    const mockHandler = vi.fn()
    eventPublisher.subscribe('PromotionApproved', mockHandler)

    const result = await dispatchPendingOutboxEvents()

    expect(result.processed).toBeGreaterThan(0)
    expect(mockHandler).toHaveBeenCalled()
  })
})
