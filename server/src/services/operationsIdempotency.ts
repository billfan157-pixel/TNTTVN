import { createHash } from 'node:crypto'
import { and, asc, eq, isNull, lt } from 'drizzle-orm'
import { db, runDbTransaction } from '../db/index.js'
import { operationMutationReceipts } from '../db/schema.js'
import type { DbTransaction } from '../db/transactions.js'
import type { ActorContext } from '../types/actor.js'

export class OperationsIdempotencyError extends Error {
  readonly code: 'IDEMPOTENCY_KEY_REQUIRED' | 'IDEMPOTENCY_CONFLICT' | 'IDEMPOTENCY_REPLAY_EXPIRED'

  constructor(code: 'IDEMPOTENCY_KEY_REQUIRED' | 'IDEMPOTENCY_CONFLICT' | 'IDEMPOTENCY_REPLAY_EXPIRED', message: string) {
    super(message)
    this.code = code
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]))
  }
  return value
}

export function requireOperationsIdempotencyKey(value: string | undefined): string {
  const key = value?.trim()
  if (!key || key.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new OperationsIdempotencyError('IDEMPOTENCY_KEY_REQUIRED', 'Mutation Operations cần Idempotency-Key hợp lệ.')
  }
  return key
}

function requestHash(command: string, payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical({ command, payload }))).digest('hex')
}

async function loadReceipt<T>(actor: ActorContext, key: string, command: string, hash: string): Promise<T | null> {
  const [receipt] = await db.select({ command: operationMutationReceipts.command, requestHash: operationMutationReceipts.requestHash, responseJson: operationMutationReceipts.responseJson, responsePrunedAt: operationMutationReceipts.responsePrunedAt })
    .from(operationMutationReceipts)
    .where(and(
      eq(operationMutationReceipts.parishId, actor.parishId),
      eq(operationMutationReceipts.actorUserId, actor.userId),
      eq(operationMutationReceipts.idempotencyKey, key),
    )).limit(1)
  if (!receipt) return null
  if (receipt.command !== command || receipt.requestHash !== hash) {
    throw new OperationsIdempotencyError('IDEMPOTENCY_CONFLICT', 'Idempotency-Key đã được dùng cho một command hoặc payload khác.')
  }
  if (receipt.responsePrunedAt) {
    throw new OperationsIdempotencyError('IDEMPOTENCY_REPLAY_EXPIRED', 'Mutation đã được ghi nhận nhưng response snapshot đã hết thời hạn lưu. Không thực thi lại để tránh tạo dữ liệu trùng.')
  }
  return JSON.parse(receipt.responseJson) as T
}

/**
 * Compact only replay response bodies. The immutable key/command/hash tombstone
 * remains, so an old retry is rejected instead of executing the mutation again.
 * Retention duration is deliberately supplied by deployment policy; this
 * function never invents a business retention default.
 */
export async function compactOperationsMutationReceiptResponses(before: Date, maxRows: number): Promise<number> {
  if (!Number.isFinite(before.getTime())) throw new Error('Operations receipt cutoff is invalid.')
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 5000) throw new Error('Operations receipt compaction batch must be between 1 and 5000.')
  const cutoff = before.toISOString()
  const prunedAt = new Date().toISOString()
  return runDbTransaction(async tx => {
    const candidates = await tx.select({
      parishId: operationMutationReceipts.parishId,
      actorUserId: operationMutationReceipts.actorUserId,
      idempotencyKey: operationMutationReceipts.idempotencyKey,
    }).from(operationMutationReceipts).where(and(
      isNull(operationMutationReceipts.responsePrunedAt),
      lt(operationMutationReceipts.createdAt, cutoff),
    )).orderBy(asc(operationMutationReceipts.createdAt)).limit(maxRows)
    for (const receipt of candidates) {
      await tx.update(operationMutationReceipts).set({
        responseJson: '{"receiptResponsePruned":true}',
        responsePrunedAt: prunedAt,
      }).where(and(
        eq(operationMutationReceipts.parishId, receipt.parishId),
        eq(operationMutationReceipts.actorUserId, receipt.actorUserId),
        eq(operationMutationReceipts.idempotencyKey, receipt.idempotencyKey),
        isNull(operationMutationReceipts.responsePrunedAt),
      ))
    }
    return candidates.length
  })
}

export async function runIdempotentOperationsCommand<T>(
  actor: ActorContext,
  key: string,
  command: string,
  payload: unknown,
  execute: (tx: DbTransaction) => Promise<T>,
): Promise<{ value: T; replayed: boolean }> {
  const hash = requestHash(command, payload)
  const existing = await loadReceipt<T>(actor, key, command, hash)
  if (existing !== null) return { value: existing, replayed: true }

  try {
    const value = await runDbTransaction(async tx => {
      const [inside] = await tx.select({ command: operationMutationReceipts.command, requestHash: operationMutationReceipts.requestHash, responseJson: operationMutationReceipts.responseJson, responsePrunedAt: operationMutationReceipts.responsePrunedAt })
        .from(operationMutationReceipts)
        .where(and(
          eq(operationMutationReceipts.parishId, actor.parishId),
          eq(operationMutationReceipts.actorUserId, actor.userId),
          eq(operationMutationReceipts.idempotencyKey, key),
        )).limit(1)
      if (inside) {
        if (inside.command !== command || inside.requestHash !== hash) throw new OperationsIdempotencyError('IDEMPOTENCY_CONFLICT', 'Idempotency-Key đã được dùng cho một command hoặc payload khác.')
        if (inside.responsePrunedAt) throw new OperationsIdempotencyError('IDEMPOTENCY_REPLAY_EXPIRED', 'Mutation đã được ghi nhận nhưng response snapshot đã hết thời hạn lưu. Không thực thi lại để tránh tạo dữ liệu trùng.')
        return JSON.parse(inside.responseJson) as T
      }
      const result = await execute(tx)
      await tx.insert(operationMutationReceipts).values({
        parishId: actor.parishId,
        actorUserId: actor.userId,
        idempotencyKey: key,
        command,
        requestHash: hash,
        responseJson: JSON.stringify(result),
        createdAt: new Date().toISOString(),
      })
      return result
    })
    return { value, replayed: false }
  } catch (error: any) {
    const databaseError = `${error?.code || ''} ${error?.cause?.code || ''} ${error?.message || ''} ${error?.cause?.message || ''}`
    if (!databaseError.includes('UNIQUE') && !databaseError.includes('SQLITE_CONSTRAINT')) throw error
    const raced = await loadReceipt<T>(actor, key, command, hash)
    if (raced !== null) return { value: raced, replayed: true }
    throw error
  }
}
