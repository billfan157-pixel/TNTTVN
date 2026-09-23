import { decryptQueueValue } from './offlineCipher'
import type { TiniPreviewItem } from './api/tiniImport'
import { getOwnUnsettledSyncOperations } from '../stores/syncStore'

/**
 * UX guard for the initiating device. The server OCC check remains authoritative
 * for concurrent work on this or another device.
 */
export async function hasUnsettledLocalAttendanceInSelectedScope(
  items: TiniPreviewItem[],
  selectedIndexes: ReadonlySet<number>,
): Promise<boolean> {
  const selectedScopes = new Set(items
    .filter(item => selectedIndexes.has(item.index) && item.normalized)
    .map(item => JSON.stringify([item.observation.date, item.normalized!.type])))
  if (selectedScopes.size === 0) return false

  const unsettled = (await getOwnUnsettledSyncOperations())
    .filter(item => item.entity === 'attendance')
  for (const item of unsettled) {
    const raw = await decryptQueueValue(item.payload)
    if (!raw) return true
    try {
      const payload = JSON.parse(raw) as { date?: unknown; type?: unknown }
      if (typeof payload.date !== 'string' || typeof payload.type !== 'string') return true
      if (selectedScopes.has(JSON.stringify([payload.date, payload.type]))) return true
    } catch {
      return true
    }
  }
  return false
}
