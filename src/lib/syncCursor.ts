import { getDB } from './db'
import { scopedStorageKey } from './tenantScope'

const CURSOR_KEY = 'sync_cursor_v1'

function getScopedCursorKey(): string {
  const key = scopedStorageKey(CURSOR_KEY)
  if (!key) throw new Error('Cannot access sync cursor without an authenticated tenant scope')
  return key
}

/** Capture the exact tenant/user namespace that owns an in-flight pull. */
export function captureSyncCursorScope(): string | null {
  return scopedStorageKey(CURSOR_KEY)
}

export async function readSyncCursor(): Promise<string | null> {
  const row = await getDB().syncMeta.get(getScopedCursorKey())
  if (!row?.value) return null
  const parsed = Date.parse(row.value)
  return Number.isFinite(parsed) ? row.value : null
}

export async function writeSyncCursor(serverTime: string): Promise<void> {
  if (!Number.isFinite(Date.parse(serverTime))) throw new Error('Invalid server sync watermark')
  await getDB().syncMeta.put({ key: getScopedCursorKey(), value: serverTime })
}

/**
 * Commit a pull watermark only while the authenticated scope is still the one
 * that started the pull. A logout/account switch may complete while network
 * requests are in flight; writing through the ambient scope in that case can
 * either throw or advance another account's cursor past data it never received.
 */
export async function writeSyncCursorIfScopeMatches(
  serverTime: string,
  expectedScopeKey: string | null,
): Promise<boolean> {
  if (!Number.isFinite(Date.parse(serverTime))) throw new Error('Invalid server sync watermark')
  if (!expectedScopeKey || captureSyncCursorScope() !== expectedScopeKey) return false

  await getDB().syncMeta.put({ key: expectedScopeKey, value: serverTime })
  return captureSyncCursorScope() === expectedScopeKey
}

export async function clearSyncCursor(): Promise<void> {
  await getDB().syncMeta.delete(getScopedCursorKey())
}
