import { db, type DbTransaction } from '../db/index.js'
import { outboxMessages } from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { eq, sql } from 'drizzle-orm'
import { sendTelegramInfo, isTelegramEnabled } from './telegram.js'

export interface IntegrationEvent<T = any> {
  id: string
  aggregateId: string
  eventType: string
  payload: T
  createdAt: string
}

export type EventSubscriber = (event: IntegrationEvent) => Promise<void>

class OutboxPublisher {
  private subscribers: Map<string, EventSubscriber[]> = new Map()

  subscribe(eventType: string, handler: EventSubscriber) {
    const list = this.subscribers.get(eventType) || []
    list.push(handler)
    this.subscribers.set(eventType, list)
  }

  async publish(event: IntegrationEvent): Promise<void> {
    const handlers = this.subscribers.get(event.eventType) || []
    for (const handler of handlers) {
      await handler(event)
    }
  }
}

export const eventPublisher = new OutboxPublisher()

let subscribersRegistered = false

/**
 * Đăng ký subscriber cho các sự kiện tích hợp (ADR-014). Nếu telegram chưa được
 * cấu hình, handler NÉM để message giữ trạng thái 'failed' — worker sẽ re-queue
 * về 'pending' cho tới khi telegram bật, tránh mất event vĩnh viễn.
 */
export function registerOutboxSubscribers(): void {
  if (subscribersRegistered) return
  subscribersRegistered = true

  const requireTelegram = () => {
    if (!isTelegramEnabled()) {
      throw new Error('Telegram chưa được cấu hình — chờ bật để gửi event tích hợp.')
    }
  }

  eventPublisher.subscribe('GradeOverrideCreated', async (event) => {
    requireTelegram()
    const p = (event.payload || {}) as Record<string, any>
    await sendTelegramInfo(
      `Điểm thủ công đã lưu\n• Thiếu nhi: ${p.studentName || p.studentId || '?'}\n` +
      `• Cột điểm: ${p.scoreField || '?'} = ${p.manualValue ?? '?'}\n• Lý do: ${p.reasonCode || '?'}`
    )
  })

  eventPublisher.subscribe('GradeOverrideRemoved', async (event) => {
    requireTelegram()
    const p = (event.payload || {}) as Record<string, any>
    await sendTelegramInfo(`Điểm thủ công đã được khôi phục (thiếu nhi ${p.studentId || '?'}, cột ${p.scoreField || '?'})`)
  })

  eventPublisher.subscribe('PromotionApproved', async (event) => {
    requireTelegram()
    const p = (event.payload || {}) as Record<string, any>
    await sendTelegramInfo(`Đã duyệt thăng tiến: ${p.studentName || p.studentId || '?'}`)
  })
}

/**
 * Worker poll outbox và dispatch với retry semantics (ADR-014 + ADR-016):
 * trước tiên re-queue các msg 'failed' về 'pending', sau đó dispatch các msg 'pending'.
 */
export async function processOutboxCycle(): Promise<{ requeued: number; processed: number; failed: number }> {
  const requeued = await retryFailedOutboxMessages()
  const result = await dispatchPendingOutboxEvents()
  return { requeued, processed: result.processed, failed: result.failed }
}

let outboxTimer: ReturnType<typeof setInterval> | null = null
let isProcessing = false

export function startOutboxWorker(intervalMs = 10000): void {
  if (outboxTimer) return
  const run = async () => {
    if (isProcessing) return
    isProcessing = true
    try {
      const { requeued, processed, failed } = await processOutboxCycle()
      if (requeued > 0 || processed > 0 || failed > 0) {
        console.log(`[outbox] re-queued ${requeued}, dispatched ${processed}, failed ${failed}`)
      }
    } catch (err) {
      console.error('[outbox] worker cycle failed:', err)
    } finally {
      isProcessing = false
    }
  }
  void run()
  outboxTimer = setInterval(run, intervalMs)
}

export function stopOutboxWorker(): void {
  if (outboxTimer) {
    clearInterval(outboxTimer)
    outboxTimer = null
  }
}

/**
 * Saves an Integration Event to the Outbox Table atomically within the current DB transaction. (ADR-014)
 */
export async function saveToOutbox(
  tx: DbTransaction,
  aggregateId: string,
  eventType: string,
  payload: any,
  sequenceNumber?: number
): Promise<string> {
  const id = generateId('OUT')

  let seq = sequenceNumber
  if (!seq) {
    const [maxRow] = await tx
      .select({ max: sql<number>`COALESCE(MAX(sequence_number), 0)` })
      .from(outboxMessages)
      .where(eq(outboxMessages.aggregateId, aggregateId))
    seq = ((maxRow as { max?: number } | undefined)?.max ?? 0) + 1
  }

  await tx.insert(outboxMessages).values({
    id,
    aggregateId,
    eventType,
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
    status: 'pending',
    sequenceNumber: seq,
    createdAt: new Date().toISOString(),
  })
  return id
}

/**
 * Worker routine polling pending outbox messages and dispatching them with retry semantics.
 */
/**
 * ADR-016: Re-queue a previously-failed outbox message back to 'pending' so a
 * transient subscriber failure (telegram down, network timeout) can be retried
 * on the next dispatch cycle instead of being permanently dead.
 */
export async function retryFailedOutboxMessages(): Promise<number> {
  const failed = await db
    .select()
    .from(outboxMessages)
    .where(eq(outboxMessages.status, 'failed'))
    .limit(50)

  for (const msg of failed) {
    await db
      .update(outboxMessages)
      .set({ status: 'pending' })
      .where(eq(outboxMessages.id, msg.id))
  }

  return failed.length
}

export async function dispatchPendingOutboxEvents(): Promise<{ processed: number; failed: number }> {
  const pending = await db
    .select()
    .from(outboxMessages)
    .where(eq(outboxMessages.status, 'pending'))
    .limit(50)

  let processed = 0
  let failed = 0

  for (const msg of pending) {
    try {
      const event: IntegrationEvent = {
        id: msg.id,
        aggregateId: msg.aggregateId,
        eventType: msg.eventType,
        payload: JSON.parse(msg.payload),
        createdAt: msg.createdAt,
      }

      await eventPublisher.publish(event)

      await db
        .update(outboxMessages)
        .set({ status: 'dispatched' })
        .where(eq(outboxMessages.id, msg.id))

      processed++
    } catch {
      // ADR-016: Mark failed but keep it recoverable — the next dispatch cycle
      // should first re-queue failed messages so transient errors are retried.
      await db
        .update(outboxMessages)
        .set({ status: 'failed' })
        .where(eq(outboxMessages.id, msg.id))

      failed++
    }
  }

  return { processed, failed }
}
