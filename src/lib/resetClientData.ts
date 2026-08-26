import { db } from './db'
import { clearTokens } from './api'
import { resetAllStoresToDefault } from '../stores/resetStores'

export const PURGE_VERSION_KEY = 'parish_purge_version'
export const DEFAULT_LOCAL_PURGE_VERSION = 1

/**
 * PURGE v2.3 — Reset toàn bộ dữ liệu client sau khi server purge:
 * - Xóa SẠCH Dexie (stores + syncQueue + syncMeta) — kể cả op offline đang pending,
 *   nếu giữ lại chúng sẽ "ghost data": queue cũ tự tạo lại học sinh/điểm sau purge.
 * - Xóa toàn bộ localStorage parish_* (token, user, store persist cũ).
 * - Lưu purge_version hiện tại để lần sync sau không wipe nhầm lần nữa.
 * Caller chịu trách nhiệm redirect về /login.
 *
 * A-NEW-35 (2026-08-11): FAIL-CLOSED cho bước xóa Dexie. Trước đây catch → vẫn
 * logout → phiên mới có thể kéo lại dữ liệu purge đã xóa từ server (ghost data
 * tái sinh) HOẶC để lại pending ops ghi đè lên dữ liệu đã purge. Giờ: retry 1 lần,
 * vẫn lỗi → THROW (caller KHÔNG logout, KHÔNG xóa tokens) — dữ liệu an toàn bên
 * lề trong trạng thái purge chưa xác nhận, lần chạy sau xử lý lại.
 */
export async function resetClientData(purgeVersion: number): Promise<void> {
  async function clearDexie(): Promise<void> {
    await db.stores.clear()
    await db.syncQueue.clear()
    await db.syncMeta.clear()
    // A-NEW-24: khóa mã hóa offline cũng bị xóa — mọi dữ liệu đã clear, khóa
    // mới sẽ được sinh lại ở lần initDB kế tiếp.
    await db.cryptoKeys.clear()
  }
  try {
    await clearDexie()
  } catch (firstErr) {
    console.error('Failed to clear Dexie after purge — retry 1 lần:', firstErr)
    try {
      await clearDexie()
    } catch (secondErr) {
      console.error('Failed to clear Dexie after purge (lần 2) — TỪ CHỐI logout để chống ghost data:', secondErr)
      throw new Error('Không thể xóa dữ liệu cục bộ sau khi giáo xứ đã purge — hãy thử lại. (Dexie clear thất bại)')
    }
  }

  await resetAllStoresToDefault()

  try {
    localStorage.setItem(PURGE_VERSION_KEY, String(purgeVersion))
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('parish_') && key !== PURGE_VERSION_KEY) toRemove.push(key)
    }
    for (const key of toRemove) localStorage.removeItem(key)
  } catch {
    // Ignore storage issues
  }

  clearTokens()
}

export function getLocalPurgeVersion(): number {
  try {
    const raw = localStorage.getItem(PURGE_VERSION_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_LOCAL_PURGE_VERSION
  } catch {
    return DEFAULT_LOCAL_PURGE_VERSION
  }
}
