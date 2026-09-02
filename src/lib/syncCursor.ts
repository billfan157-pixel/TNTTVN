import { getDB } from './db'
import { scopedStorageKey } from './tenantScope'

const CURSOR_KEY = 'sync_cursor_v1'

function getScopedCursorKey(): string {
  const key = scopedStorageKey(CURSOR_KEY)
  if (!key) throw new Error('Cannot access sync cursor without an authenticated tenant scope')
  return key
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

export async function clearSyncCursor(): Promise<void> {
  await getDB().syncMeta.delete(getScopedCursorKey())
}
