// 1. Polyfill IndexedDB for Dexie in Node/jsdom CI environment FIRST
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { webcrypto } from 'node:crypto'

// A-NEW-24: jsdom cung cấp `crypto` nhưng KHÔNG có `subtle` — inject Node
// webcrypto để offlineCipher (AES-GCM) chạy THẬT trong test (không bị rơi
// vào fallback plaintext).
if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.subtle === 'undefined') {
  Object.defineProperty(globalThis.crypto, 'subtle', { value: webcrypto.subtle, configurable: true })
}

// A-NEW-23: rate limit state nằm trong DB (bảng rate_limits) — DB test dùng CHUNG
// cho mọi test file (global-setup tạo 1 DB temp cho cả run) nên rows của file này
// sang file kia. Reset mỗi file = tái lập cô lập giống Map per-process cũ, giữ
// test deterministic (vd bucket 'unknown' của adminReauthRateLimiter 10/60s/IP).
await import('../../server/src/db/index.js').then(async ({ client }) => {
  await client.execute('DELETE FROM rate_limits')
})

// DB_PATH + baseline seed are set in global-setup.ts (main process, inherited by
// workers BEFORE any test module loads) so server tests use a throwaway DB —
// never the committed server/data/parish.db.

if (typeof process !== 'undefined' && !process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test_jwt_secret_key_2026'
  process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_key_2026'
}

if (typeof window !== 'undefined') {
  if (!window.indexedDB && typeof globalThis !== 'undefined' && globalThis.indexedDB) {
    window.indexedDB = globalThis.indexedDB
  }
  const storage: Record<string, string> = {}
  const mockLocalStorage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => { storage[key] = String(value) },
    removeItem: (key: string) => { delete storage[key] },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]) },
    key: (i: number) => Object.keys(storage)[i] ?? null,
    get length() { return Object.keys(storage).length }
  }
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true })
  }
  if (typeof globalThis !== 'undefined' && !globalThis.localStorage) {
    Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true })
  }
}
