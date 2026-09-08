import { compactOperationsMutationReceiptResponses } from './operationsIdempotency.js'

const DAY_MS = 24 * 60 * 60 * 1000
const COMPACTION_BATCH_SIZE = 500

let timer: ReturnType<typeof setInterval> | null = null

export function getOperationsReceiptRetentionDays(envValue = process.env.OPERATIONS_RECEIPT_RESPONSE_RETENTION_DAYS): number | null {
  if (envValue === undefined || envValue.trim() === '') return null
  const days = Number(envValue)
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new Error('OPERATIONS_RECEIPT_RESPONSE_RETENTION_DAYS must be an integer from 1 to 3650.')
  }
  return days
}

export async function runOperationsReceiptMaintenance(now = new Date()): Promise<number> {
  const retentionDays = getOperationsReceiptRetentionDays()
  if (retentionDays === null) return 0
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS)
  let total = 0
  while (true) {
    const compacted = await compactOperationsMutationReceiptResponses(cutoff, COMPACTION_BATCH_SIZE)
    total += compacted
    if (compacted < COMPACTION_BATCH_SIZE) return total
  }
}

/**
 * Response compaction is opt-in until product/data governance approves a
 * retention duration. When configured, run once at startup and then daily.
 */
export async function initOperationsReceiptMaintenance(): Promise<void> {
  if (timer || getOperationsReceiptRetentionDays() === null) return
  await runOperationsReceiptMaintenance()
  timer = setInterval(() => {
    void runOperationsReceiptMaintenance().catch(error => console.error('[operationsReceiptMaintenance] tick failed:', error))
  }, DAY_MS)
  timer.unref?.()
}

export function stopOperationsReceiptMaintenance(): void {
  if (timer) clearInterval(timer)
  timer = null
}
