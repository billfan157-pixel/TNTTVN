import { createHash } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { DbExecutor } from '../db/index.js'
import { auditLogs } from '../db/schema.js'

/**
 * A create idempotency key names one immutable create intent. Replaying the
 * key is safe only when the normalized request still describes the row that
 * won the first commit.
 */
export class CreateIdempotencyConflictError<T = unknown> extends Error {
  readonly code = 'IDEMPOTENCY_CONFLICT'
  readonly status = 409
  readonly existing: T

  constructor(existing: T) {
    super('Idempotency key đã được sử dụng với nội dung tạo khác')
    this.name = 'CreateIdempotencyConflictError'
    this.existing = existing
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    )
  }
  return value
}

export function createIntentHash(intent: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(intent)))
    .digest('hex')
}

export async function readCreateIntentHash(
  executor: DbExecutor,
  parishId: string,
  entityType: string,
  entityId: string,
  action: string,
): Promise<string | null> {
  const [entry] = await executor
    .select({ newValue: auditLogs.newValue })
    .from(auditLogs)
    .where(and(
      eq(auditLogs.parishId, parishId),
      eq(auditLogs.entityType, entityType),
      eq(auditLogs.entityId, entityId),
      eq(auditLogs.action, action),
    ))
    .orderBy(desc(auditLogs.createdAt))
    .limit(1)
  if (!entry?.newValue) return null
  try {
    const parsed = JSON.parse(entry.newValue) as Record<string, unknown>
    return typeof parsed.createIntentHash === 'string' ? parsed.createIntentHash : null
  } catch {
    return null
  }
}

export function normalizeJsonCreateField(value: string | null | undefined): unknown {
  if (value == null) return null
  try {
    return canonicalize(JSON.parse(value))
  } catch {
    return value
  }
}

export function assertCreateReplayMatches<T>(
  existing: T,
  persistedIntent: Record<string, unknown>,
  requestedIntent: Record<string, unknown>,
  persistedHash?: string | null,
): T {
  const matches = persistedHash
    ? persistedHash === createIntentHash(requestedIntent)
    : JSON.stringify(canonicalize(persistedIntent)) === JSON.stringify(canonicalize(requestedIntent))
  if (!matches) {
    throw new CreateIdempotencyConflictError(existing)
  }
  return existing
}
