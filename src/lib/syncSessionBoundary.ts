import { db, type SyncQueueItem } from './db'
import { decryptQueueValue, encryptQueueValue } from './offlineCipher'
import { isTenantScopeCurrent, type TenantScopeSnapshot } from './tenantScope'

export interface SyncOwnerScope {
  parishId: string
  userId: string
}

export interface DurableSyncResult {
  ok: boolean
  recoverable?: boolean
  isAuthError?: boolean
  isConflict?: boolean
  error?: string
  data?: unknown
}

interface DurableSyncResultEnvelope {
  kind: 'catevia-sync-result-v1'
  result: DurableSyncResult
}

const INVALIDATED_SCOPES_KEY = 'parish_invalidated_sync_scopes_v1'
const UNSETTLED_STATUSES = new Set<SyncQueueItem['status']>(['pending', 'processing', 'retrying', 'failed'])
const INVALIDATED_SESSION_ERROR = 'Client error 401: Session authority was revoked before server acknowledgement; this queued operation is quarantined and will not auto-sync.'
let volatileMarkedScopes: SyncOwnerScope[] = []

function scopeKey(scope: SyncOwnerScope): string {
  return `${scope.parishId}:${scope.userId}`
}

export function isSyncOwnerCurrent(owner: TenantScopeSnapshot, op?: Pick<SyncQueueItem, 'userId' | 'parishId'>): boolean {
  return isTenantScopeCurrent(owner)
    && (!op || (op.userId === owner.userId && op.parishId === owner.parishId))
}

/**
 * Journal a received server result against the queue row's immutable owner.
 * This deliberately does not use ambient account state: a late response for A
 * may be retained for A while B is active, but it must never touch B's stores.
 */
export async function persistSyncResultForOwner(op: SyncQueueItem, result: DurableSyncResult): Promise<void> {
  if (!result.ok) return
  const envelope: DurableSyncResultEnvelope = { kind: 'catevia-sync-result-v1', result }
  const encrypted = await encryptQueueValue(JSON.stringify(envelope))
  await db.transaction('rw', db.syncQueue, async () => {
    const current = await db.syncQueue.get(op.id)
    if (!current || current.userId !== op.userId || current.parishId !== op.parishId) {
      throw new Error('Cannot retain server acknowledgement for a different queue owner')
    }
    await db.syncQueue.update(op.id, {
      serverAcknowledgement: encrypted,
      status: 'retrying',
      updatedAt: new Date().toISOString(),
    })
  })
}

export async function readPersistedSyncResult(op: SyncQueueItem): Promise<DurableSyncResult | null> {
  if (!op.serverAcknowledgement) return null
  const raw = await decryptQueueValue(op.serverAcknowledgement)
  if (!raw) throw new Error('Cannot read committed sync acknowledgement')
  const parsed = JSON.parse(raw) as unknown
  if (parsed && typeof parsed === 'object'
    && (parsed as DurableSyncResultEnvelope).kind === 'catevia-sync-result-v1') {
    return (parsed as DurableSyncResultEnvelope).result
  }
  // Backward compatibility for pre-v1 CREATE acknowledgements, which stored
  // the canonical response object directly.
  if (op.operation === 'CREATE') return { ok: true, data: parsed }
  throw new Error('Unsupported sync acknowledgement format')
}

function readMarkedScopes(): SyncOwnerScope[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(INVALIDATED_SCOPES_KEY) || '[]') as unknown
    const persisted = Array.isArray(parsed) ? parsed.filter((scope): scope is SyncOwnerScope => Boolean(
      scope && typeof scope === 'object'
      && typeof (scope as SyncOwnerScope).parishId === 'string'
      && (scope as SyncOwnerScope).parishId
      && typeof (scope as SyncOwnerScope).userId === 'string'
      && (scope as SyncOwnerScope).userId,
    )) : []
    return [...persisted, ...volatileMarkedScopes]
      .filter((scope, index, all) => all.findIndex(item => scopeKey(item) === scopeKey(scope)) === index)
  } catch {
    return [...volatileMarkedScopes]
  }
}

function writeMarkedScopes(scopes: SyncOwnerScope[]): void {
  volatileMarkedScopes = [...scopes]
  try {
    if (scopes.length === 0) localStorage.removeItem(INVALIDATED_SCOPES_KEY)
    else localStorage.setItem(INVALIDATED_SCOPES_KEY, JSON.stringify(scopes))
  } catch {
    // The in-memory marker still blocks this document. Without localStorage a
    // reload also has no auth marker, so no queue can become eligible to sync.
  }
}

/**
 * Persist the security boundary before any asynchronous IndexedDB work. If the
 * tab closes or IndexedDB is temporarily unavailable, the next sync cycle must
 * quarantine the scope before it can flush another operation.
 */
export function markSyncScopeInvalidated(scope: SyncOwnerScope): void {
  const scopes = readMarkedScopes()
  if (!scopes.some(item => scopeKey(item) === scopeKey(scope))) {
    writeMarkedScopes([...scopes, scope])
  }
}

export async function quarantineInvalidatedSyncScope(scope: SyncOwnerScope): Promise<number> {
  const rows = await db.syncQueue
    .where('userId')
    .equals(scope.userId)
    .filter(item => item.parishId === scope.parishId && UNSETTLED_STATUSES.has(item.status))
    .toArray()

  const now = new Date().toISOString()
  const lastError = await encryptQueueValue(INVALIDATED_SESSION_ERROR)
  await db.transaction('rw', db.syncQueue, async () => {
    for (const row of rows) {
      await db.syncQueue.update(row.id, {
        status: 'failed',
        lastError,
        updatedAt: now,
      })
    }
  })

  writeMarkedScopes(readMarkedScopes().filter(item => scopeKey(item) !== scopeKey(scope)))
  return rows.length
}

/** Fail closed before a sync cycle if a previous invalidation could not finish. */
export async function quarantineMarkedSyncScopes(): Promise<number> {
  let count = 0
  for (const scope of readMarkedScopes()) {
    count += await quarantineInvalidatedSyncScope(scope)
  }
  return count
}
