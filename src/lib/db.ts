import Dexie from 'dexie'
import { encryptValueStrict, decryptValue, migrateStoredValuesToEncrypted, isEncryptedValue } from './offlineCipher'
import { scopedStorageKey } from './tenantScope'

interface StoreItem {
  key: string
  value: string
}

export interface SyncQueueItem {
  id: string
  entity: 'student' | 'grade' | 'attendance' | 'class' | 'notice' | 'exam' | 'exam_result' | 'daily_entry'
  entityId: string
  operation: 'CREATE' | 'UPDATE' | 'DELETE'
  payload: string
  /** Encrypted committed CREATE response retained until local ID remap succeeds. */
  serverAcknowledgement?: string
  retryCount: number
  lastError: string | null
  createdAt: string
  updatedAt: string
  status: 'pending' | 'processing' | 'retrying' | 'failed' | 'completed'
  deviceId: string
  /** ADR-016 (S19): Chủ sở hữu của op — ngăn queue của user A bị flush dưới token user B. */
  userId?: string
  /** OFF-TENANT-1: tenant ownership is independent from userId and must match exactly. */
  parishId?: string
}

interface SyncMetaItem {
  key: string
  value: string
}

const STORE_KEYS = [
  'parish_store_students',
  'parish_store_grades',
  'parish_store_attendance',
  'parish_store_filters',
  'parish_store_theme',
  'parish_store_exams',
] as const

// ADR-045 (2026-08-16): snapshot đăng nhập (PII) mã hóa AES tại-rest qua dexieStorage
// (tenant-scoped) — thay cho parish_current_user đầy đủ trong localStorage.
export const AUTH_SNAPSHOT_KEY = 'parish_auth_user'

/** Xóa snapshot đăng nhập mã hóa khi session chết (401 → redirect / logout). */
export function clearAuthSnapshot(): void {
  dexieStorage.removeItem(AUTH_SNAPSHOT_KEY).catch(() => {})
}

const DB = new Dexie('ParishDB') as Dexie & {
  stores: Dexie.Table<StoreItem, string>
  syncQueue: Dexie.Table<SyncQueueItem, string>
  syncMeta: Dexie.Table<SyncMetaItem, string>
  // A-NEW-24 (2026-08-11): khóa AES-GCM non-extractable cho mã hóa at-rest
  // dữ liệu offline (xem src/lib/offlineCipher.ts). A-NEW-44 (2026-08-12):
  // đa-row + createdAt — mỗi khóa id unique, không ghi đè key cũ (multi-key
  // recovery khi decrypt thất bại).
  cryptoKeys: Dexie.Table<{ id: string; key: CryptoKey; createdAt?: string }, string>
  syncConflicts: Dexie.Table<SyncConflict, string>
}

export interface SyncConflict {
  id: string
  entity: string
  entityId: string
  operation: string
  localValue: string
  serverValue: string
  resolved: boolean
  resolvedAt?: string
  createdAt: string
  userId?: string
  parishId?: string
}

DB.version(1).stores({
  stores: 'key',
})

DB.version(2).stores({
  stores: 'key',
  syncQueue: 'id, entity, entityId, status, createdAt',
  syncMeta: 'key',
})

DB.version(3).stores({
  stores: 'key',
  syncQueue: 'id, entity, entityId, status, createdAt',
  syncMeta: 'key',
})

DB.version(4).stores({
  stores: 'key',
  syncQueue: 'id, entity, entityId, status, createdAt',
  syncMeta: 'key',
  cryptoKeys: 'id',
})

// A-NEW-44: thêm index createdAt cho cryptoKeys (multi-key recovery).
// Không đụng dữ liệu cũ — row không có createdAt vẫn giữ (xếp cuối khi sort).
DB.version(5).stores({
  stores: 'key',
  syncQueue: 'id, entity, entityId, status, createdAt',
  syncMeta: 'key',
  cryptoKeys: 'id, createdAt',
})

// ADR-016 (S19): thêm userId index cho syncQueue + syncConflicts table.
// A-NEW-46: scope pending-queue reads by owner without scanning every row.
DB.version(6).stores({
  stores: 'key',
  syncQueue: 'id, entity, entityId, status, createdAt, userId, [userId+status]',
  syncMeta: 'key',
  cryptoKeys: 'id, createdAt',
  syncConflicts: 'id, entity, entityId, resolved, createdAt, userId',
})

// OFF-TENANT-1: a user id is not a tenant boundary. Queue/conflict reads use the
// composite parish + user owner so an account switch can never flush another
// parish's durable mutations under the current access token.
DB.version(7).stores({
  stores: 'key',
  syncQueue: 'id, entity, entityId, status, createdAt, userId, parishId, [parishId+userId], [parishId+userId+status]',
  syncMeta: 'key',
  cryptoKeys: 'id, createdAt',
  syncConflicts: 'id, entity, entityId, resolved, createdAt, userId, parishId, [parishId+userId]',
})

async function migrateFromLocalStorage() {
  await DB.transaction('rw', DB.stores, async () => {
    for (const key of STORE_KEYS) {
      const exists = await DB.stores.get(key)
      if (exists) continue
      const lsValue = localStorage.getItem(key)
      if (lsValue) {
        await DB.stores.put({ key, value: lsValue })
        localStorage.removeItem(key)
      }
    }
  })
}

let initialized = false

export async function initDB() {
  if (initialized) return
  await migrateFromLocalStorage()
  // A-NEW-24: mã hóa lại mọi giá trị legacy plaintext vừa chuyển từ localStorage
  // (và cả row Dexie cũ) sau khi khóa sẵn sàng.
  await migrateStoredValuesToEncrypted()
  initialized = true
}

export const dexieStorage = {
  getItem: async (name: string) => {
    const scopedKey = scopedStorageKey(name)
    if (!scopedKey) return null
    try {
      const item = await DB.stores.get(scopedKey)
      if (item) {
        const decrypted = await decryptValue(item.value, `stores:${scopedKey}`)
        if (decrypted !== null) return decrypted
        // A-NEW-45 (2026-08-12): Self-healing cleanup — nếu bản ghi trong DB.stores
        // đã mã hóa nhưng decrypt thất bại (khóa cũ đã mất từ trước A-NEW-44) →
        // tự động XÓA bản ghi rác khỏi DB.stores để ngắt lỗi lặp lại và cho phép
        // Zustand re-fetch dữ liệu mới từ server.
        if (isEncryptedValue(item.value)) {
          await DB.stores.delete(scopedKey)
        }
      }
    } catch {
    }
    const lsVal = localStorage.getItem(scopedKey)
    if (lsVal) {
      if (isEncryptedValue(lsVal)) {
        const decrypted = await decryptValue(lsVal, `stores:${scopedKey}`)
        if (decrypted !== null) return decrypted
        try { localStorage.removeItem(scopedKey) } catch {}
        return null
      }
      return lsVal
    }
    return null
  },
  setItem: async (name: string, value: string) => {
    const scopedKey = scopedStorageKey(name)
    if (!scopedKey) return
    await DB.stores.put({ key: scopedKey, value: await encryptValueStrict(value, `stores:${scopedKey}`) })
  },
  removeItem: async (name: string) => {
    const scopedKey = scopedStorageKey(name)
    if (!scopedKey) return
    await DB.stores.delete(scopedKey)
  },
}

export function getDB() {
  return DB
}

export const db = DB
