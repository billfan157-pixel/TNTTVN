import Dexie from 'dexie'

interface StoreItem {
  key: string
  value: string
}

export interface SyncQueueItem {
  id: string
  entity: 'student' | 'grade' | 'attendance'
  entityId: string
  operation: 'CREATE' | 'UPDATE' | 'DELETE'
  payload: string
  retryCount: number
  lastError: string | null
  createdAt: string
  updatedAt: string
  status: 'pending' | 'processing' | 'retrying' | 'failed' | 'completed'
  deviceId: string
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
] as const

const DB = new Dexie('ParishDB') as Dexie & {
  stores: Dexie.Table<StoreItem, string>
  syncQueue: Dexie.Table<SyncQueueItem, string>
  syncMeta: Dexie.Table<SyncMetaItem, string>
}

DB.version(1).stores({
  stores: 'key',
})

DB.version(2).stores({
  stores: 'key',
  syncQueue: 'id, entity, entityId, status, createdAt',
  syncMeta: 'key',
})

async function migrateFromLocalStorage() {
  for (const key of STORE_KEYS) {
    const exists = await DB.stores.get(key)
    if (exists) continue
    const lsValue = localStorage.getItem(key)
    if (lsValue) {
      await DB.stores.put({ key, value: lsValue })
      localStorage.removeItem(key)
    }
  }
}

let initialized = false

export async function initDB() {
  if (initialized) return
  await migrateFromLocalStorage()
  initialized = true
}

export const dexieStorage = {
  getItem: async (name: string) => {
    try {
      const item = await DB.stores.get(name)
      if (item) return item.value
    } catch {
    }
    return localStorage.getItem(name)
  },
  setItem: async (name: string, value: string) => {
    await DB.stores.put({ key: name, value })
  },
  removeItem: async (name: string) => {
    await DB.stores.delete(name)
  },
}

export function getDB() {
  return DB
}
