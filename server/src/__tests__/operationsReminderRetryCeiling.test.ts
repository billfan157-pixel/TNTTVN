// @vitest-environment node
import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { operationEvents, operationReminders, users } from '../db/schema.js'
import { MAX_REMINDER_ENQUEUE_ATTEMPTS, processDueOperationReminders } from '../services/operationsReminderService.js'

const suffix = Date.now()
const parish = `ops-remretry-${suffix}`
const eventId = `ops-remretry-event-${suffix}`

async function seedReminder(name: string, attemptCount: number) {
  const id = `rem-${name}-${suffix}`
  await db.insert(operationReminders).values({
    parishId: parish,
    id,
    taskId: null,
    eventId,
    recipientUserId: `user-${suffix}`,
    triggerAt: new Date(Date.now() - 60_000).toISOString(),
    kind: 'EVENT_START',
    dedupeKey: `retry-ceiling:${suffix}:${name}`,
    status: 'PENDING',
    version: 1,
    attemptCount,
    nextAttemptAt: null,
  })
  return id
}

async function readReminder(id: string) {
  const [row] = await db.select().from(operationReminders)
    .where(and(eq(operationReminders.parishId, parish), eq(operationReminders.id, id)))
    .limit(1)
  return row
}

describe('Operations reminder enqueue retry ceiling', () => {
  beforeAll(async () => {
    await db.insert(users).values([
      { id: `user-${suffix}`, username: `remretry-${suffix}`, passwordHash: 'hash', fullName: 'Retry Recipient', role: 'chunhiem', parishId: parish, status: 'ACTIVE', tokenVersion: 1 },
    ]).onConflictDoNothing()
    await db.insert(operationEvents).values({
      id: eventId,
      parishId: parish,
      title: 'Retry ceiling event',
      eventType: 'MEETING',
      startsAt: new Date(Date.now() - 3_600_000).toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      timezone: 'Asia/Ho_Chi_Minh',
      createdBy: 'seed',
      updatedBy: 'seed',
    })
  })

  afterAll(async () => {
    await db.delete(operationReminders).where(eq(operationReminders.parishId, parish))
    await db.delete(operationEvents).where(eq(operationEvents.parishId, parish))
    await db.delete(users).where(eq(users.parishId, parish))
  })

  it('counts a failed enqueue attempt and keeps the row retryable', async () => {
    const id = await seedReminder('retryable', 0)
    const summary = await processDueOperationReminders(new Date(), {
      beforeClaim: reminder => {
        if (reminder.id === id) throw new Error('Simulated persistence failure')
      },
    })
    expect(summary.failed).toBeGreaterThanOrEqual(1)
    await expect(readReminder(id)).resolves.toMatchObject({
      status: 'PENDING',
      attemptCount: 1,
      error: 'Simulated persistence failure',
    })
    const row = await readReminder(id)
    expect(row?.nextAttemptAt).toBeTruthy()
  })

  it('terminalizes the row as FAILED once the attempt ceiling is reached', async () => {
    const id = await seedReminder('exhausted', MAX_REMINDER_ENQUEUE_ATTEMPTS - 1)
    await processDueOperationReminders(new Date(), {
      beforeClaim: reminder => {
        if (reminder.id === id) throw new Error('Simulated persistent failure')
      },
    })
    await expect(readReminder(id)).resolves.toMatchObject({
      status: 'FAILED',
      attemptCount: MAX_REMINDER_ENQUEUE_ATTEMPTS,
      nextAttemptAt: null,
      error: 'Simulated persistent failure',
    })
  })
})
