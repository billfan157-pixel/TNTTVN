const SYNC_LEASE_KEY = 'parish_sync_lease'
const SYNC_LEASE_TTL_MS = 60_000

type SyncLeaseRecord = {
  owner: string
  expiresAt: number
}

function getOwnerId(): string {
  try {
    const existing = sessionStorage.getItem('parish_sync_owner')
    if (existing) return existing
    const generated = `SYNC-${crypto.randomUUID()}`
    sessionStorage.setItem('parish_sync_owner', generated)
    return generated
  } catch {
    return 'SYNC-fallback'
  }
}

const ownerId = getOwnerId()

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * Coordinates periodic sync across browser tabs. The lease is deliberately
 * short-lived and released in a finally block by the sync engine, so a crashed
 * tab cannot block synchronization indefinitely.
 */
export function acquireSyncLease(now = Date.now()): boolean {
  const storage = getStorage()
  if (!storage) return true

  try {
    const raw = storage.getItem(SYNC_LEASE_KEY)
    if (raw) {
      const current = JSON.parse(raw) as Partial<SyncLeaseRecord>
      if (typeof current.owner === 'string' && current.owner !== ownerId &&
          typeof current.expiresAt === 'number' && current.expiresAt > now) {
        return false
      }
    }

    const next: SyncLeaseRecord = { owner: ownerId, expiresAt: now + SYNC_LEASE_TTL_MS }
    storage.setItem(SYNC_LEASE_KEY, JSON.stringify(next))
    const confirmed = JSON.parse(storage.getItem(SYNC_LEASE_KEY) || '{}') as Partial<SyncLeaseRecord>
    return confirmed.owner === ownerId && confirmed.expiresAt === next.expiresAt
  } catch {
    // A storage/quota error must not disable sync in this tab.
    return true
  }
}

export function releaseSyncLease(): void {
  const storage = getStorage()
  if (!storage) return

  try {
    const current = JSON.parse(storage.getItem(SYNC_LEASE_KEY) || '{}') as Partial<SyncLeaseRecord>
    if (current.owner === ownerId) storage.removeItem(SYNC_LEASE_KEY)
  } catch {
    // Ignore cleanup failures; the lease will expire naturally.
  }
}

export const syncLeaseConfig = {
  key: SYNC_LEASE_KEY,
  ttlMs: SYNC_LEASE_TTL_MS,
}
