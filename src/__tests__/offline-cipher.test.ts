import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDB, db, dexieStorage } from '../lib/db'
import { setTenantScope } from '../lib/tenantScope'
import {
  encryptValue,
  decryptValue,
  encryptValueStrict,
  encryptQueueValue,
  decryptQueueValue,
  isEncryptedValue,
  ensureOfflineKey,
  resetOfflineKeyCache,
  migrateStoredValuesToEncrypted,
} from '../lib/offlineCipher'

/**
 * A-NEW-24 (2026-08-11): mã hóa at-rest dữ liệu offline (bảng `stores` của Dexie)
 * bằng AES-256-GCM — khóa non-extractable, AAD theo tên store, migration legacy
 * plaintext, fallback khi thiếu crypto.subtle.
 *
 * A-NEW-44 (2026-08-12): fix race khởi tạo khóa (singleton + Web Locks), key
 * versioning (không ghi đè key cũ) + multi-key decrypt recovery.
 */

describe('offlineCipher — encrypt/decrypt', () => {
  it('roundtrip: encrypt → ciphertext → decrypt trả về đúng bản rõ', async () => {
    const plain = JSON.stringify({ students: [{ id: 'ST-1', parentPhone: '0901234567', address: '123 Đường X' }] })
    const ct = await encryptValue(plain, 'stores:parish_store_students')
    expect(isEncryptedValue(ct)).toBe(true)
    expect(ct).not.toContain('0901234567')
    expect(ct).not.toContain('ST-1')
    expect(await decryptValue(ct, 'stores:parish_store_students')).toBe(plain)
  })

  it('AAD sai (đổi tên store) → decrypt null — chống swap ciphertext giữa các store', async () => {
    const ct = await encryptValue('secret-data', 'stores:parish_store_students')
    expect(await decryptValue(ct, 'stores:parish_store_theme')).toBeNull()
    expect(await decryptValue(ct, 'stores:parish_store_students')).toBe('secret-data')
  })

  it('ciphertext hỏng / base64 sai → decrypt null (không throw)', async () => {
    const ct = await encryptValue('data', 'aad')
    expect(await decryptValue('enc:v1:not-base64!!.also-not-base64', 'aad')).toBeNull()
    expect(await decryptValue(ct.slice(0, -3), 'aad')).toBeNull()
  })

  it('giá trị legacy plaintext (trước A-NEW-24) → decryptValue trả nguyên (dual-format)', async () => {
    const legacy = JSON.stringify({ students: [] })
    expect(await decryptValue(legacy, 'stores:parish_store_students')).toBe(legacy)
  })

  it('dữ liệu lớn (~1MB) không vỡ base64 chunking', async () => {
    const big = JSON.stringify({ rows: Array.from({ length: 5000 }, (_, i) => ({ id: `R-${i}`, name: 'Tên học sinh Việt Nam'.repeat(20) })) })
    const ct = await encryptValue(big, 'stores:parish_store_grades')
    expect(isEncryptedValue(ct)).toBe(true)
    expect(await decryptValue(ct, 'stores:parish_store_grades')).toBe(big)
  })
})

describe('offlineCipher — khóa', () => {
  it('khóa sinh ra là AES-GCM 256, NON-extractable, tái sử dụng sau khi đã có', async () => {
    const key = await ensureOfflineKey()
    expect(key).not.toBeNull()
    expect(key!.algorithm.name).toBe('AES-GCM')
    expect((key!.algorithm as AesKeyAlgorithm).length).toBe(256)
    expect(key!.extractable).toBe(false)
    expect(await ensureOfflineKey()).toBe(key)
  })

  it('khóa được lưu trong Dexie cryptoKeys (row tồn tại sau khi tạo)', async () => {
    const rows = await db.cryptoKeys.toArray()
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].key.extractable).toBe(false)
  })

  // ─── A-NEW-44 (2026-08-12): fix race khởi tạo khóa ───
  it('A-NEW-44: gọi song song nhiều lần → CHỈ 1 khóa duy nhất (singleton promise)', async () => {
    await getDB().cryptoKeys.clear()
    resetOfflineKeyCache()
    const keys = await Promise.all(Array.from({ length: 8 }, () => ensureOfflineKey()))
    const nonNull = keys.filter((k) => k !== null)
    expect(nonNull.length).toBe(8)
    // tất cả cùng 1 tham chiếu khóa (cùng CryptoKey)
    for (const k of nonNull) expect(k).toBe(nonNull[0])
    const rows = await db.cryptoKeys.toArray()
    expect(rows.length).toBe(1)
  })

  it('A-NEW-44: key mới KHÔNG ghi đè key cũ — dữ liệu encrypt key cũ vẫn đọc được (multi-key recovery)', async () => {
    await getDB().cryptoKeys.clear()
    resetOfflineKeyCache()

    const k1 = await ensureOfflineKey()
    const ct1 = await encryptValue('data-by-old-key', 'stores:test')
    const rowsBefore = await db.cryptoKeys.toArray()
    expect(rowsBefore.length).toBe(1)

    // Mô phỏng phiên mới: thêm khóa mới (id unique + createdAt mới hơn) →
    // key cũ vẫn nằm trong DB; ciphertext của key cũ phải đọc lại được.
    const subtle = globalThis.crypto.subtle
    const k2 = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await db.cryptoKeys.put({ id: `parish-offline-aes-key-${Date.now() + 1000}`, key: k2, createdAt: new Date(Date.now() + 5000).toISOString() })
    resetOfflineKeyCache()

    const active = await ensureOfflineKey()
    // xác minh active là k2 (khóa mới nhất): dữ liệu viết bằng active phải
    // decrypt được bằng k2 (CryptoKey clone qua IDB không so `toBe` được)
    const iv2 = globalThis.crypto.getRandomValues(new Uint8Array(12))
    const pt2 = 'data-by-new-key'
    const ct2 = await subtle.encrypt({ name: 'AES-GCM', iv: iv2 }, k2, new TextEncoder().encode(pt2))
    const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv: iv2 }, active!, ct2)
    expect(new TextDecoder().decode(decrypted)).toBe(pt2)
    // dữ liệu encrypt bằng key CŨ vẫn đọc được (multi-key recovery)
    expect(await decryptValue(ct1, 'stores:test')).toBe('data-by-old-key')
    void k1
  })
})

describe('offlineCipher — wire vào dexieStorage', () => {
  beforeEach(async () => {
    setTenantScope({ parishId: 'test-parish', userId: 'test-user' })
    await getDB().stores.clear()
  })

  it('setItem → DB chứa ciphertext; getItem → trả về đúng bản rõ', async () => {
    const plain = JSON.stringify({ students: [{ id: 'ST-9', parentPhone: '0900000000' }] })
    await dexieStorage.setItem('parish_store_students', plain)
    const raw = await db.stores.get('parish_store_students:test-parish:test-user')
    expect(raw!.value).toContain('enc:v1:')
    expect(raw!.value).not.toContain('ST-9')
    expect(await dexieStorage.getItem('parish_store_students')).toBe(plain)
  })

  it('removeItem xóa row', async () => {
    await dexieStorage.setItem('parish_store_theme', '{"theme":"light"}')
    await dexieStorage.removeItem('parish_store_theme')
    expect(await db.stores.get('parish_store_theme:test-parish:test-user')).toBeUndefined()
  })
})

describe('offlineCipher — migration legacy plaintext', () => {
  beforeEach(async () => {
    setTenantScope({ parishId: 'test-parish', userId: 'test-user' })
    await getDB().stores.clear()
  })

  it('row plaintext cũ được mã hóa lại (idempotent), vẫn đọc đúng qua dexieStorage', async () => {
    const legacy = JSON.stringify({ students: [{ id: 'ST-OLD', parentName: 'Cha Mẹ Cũ' }] })
    await db.stores.put({ key: 'parish_store_students:test-parish:test-user', value: legacy })

    await migrateStoredValuesToEncrypted()
    await migrateStoredValuesToEncrypted() // idempotent

    const raw = await db.stores.get('parish_store_students:test-parish:test-user')
    expect(isEncryptedValue(raw!.value)).toBe(true)
    expect(await dexieStorage.getItem('parish_store_students')).toBe(legacy)
  })
})

describe('offlineCipher — fallback khi thiếu crypto.subtle', () => {
  let originalSubtle: SubtleCrypto | undefined
  let originalCrypto: Crypto | undefined

  beforeEach(async () => {
    setTenantScope({ parishId: 'test-parish', userId: 'test-user' })
    originalSubtle = globalThis.crypto?.subtle
    originalCrypto = globalThis.crypto
    await getDB().stores.clear()
  })

  afterEach(() => {
    setTenantScope(null)
    if (originalCrypto && originalSubtle) {
      Object.defineProperty(originalCrypto, 'subtle', { value: originalSubtle, configurable: true })
    }
  })

  it('không có subtle → encrypt/decrypt truyền thẳng plaintext (fail-open)', async () => {
    Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined, configurable: true })
    const plain = '{"students":[]}'
    const stored = await encryptValue(plain, 'stores:x')
    expect(stored).toBe(plain)
    expect(isEncryptedValue(stored)).toBe(false)
    expect(await decryptValue(stored, 'stores:x')).toBe(plain)
  })

  // ─── A-NEW-33 (2026-08-11): fail-closed cho mọi WRITE mới ───
  it('không có subtle → encryptValueStrict THROW (từ chối ghi plaintext)', async () => {
    Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined, configurable: true })
    await expect(encryptValueStrict('{"students":[]}', 'stores:x')).rejects.toThrow(/từ chối ghi plaintext/)
    await expect(encryptQueueValue('{"scoreFinal":8}')).rejects.toThrow(/từ chối ghi plaintext/)
  })

  it('không có subtle → dexieStorage.setItem THROW (không ghi row plaintext)', async () => {
    Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined, configurable: true })
    await expect(dexieStorage.setItem('parish_store_students', '{"students":[]}')).rejects.toThrow()
    expect(await db.stores.get('parish_store_students')).toBeUndefined()
  })
})

// ─── A-NEW-32 (2026-08-11): mã hóa syncQueue (AAD riêng 'syncQueue') ───
describe('offlineCipher — syncQueue (A-NEW-32)', () => {
  it('roundtrip: encryptQueueValue → ciphertext enc:v1 → decryptQueueValue trả bản rõ', async () => {
    const plain = JSON.stringify({ studentId: 'ST-1', scoreFinal: 8, fullName: 'Nguyễn Văn A' })
    const ct = await encryptQueueValue(plain)
    expect(ct.startsWith('enc:v1:')).toBe(true)
    expect(ct).not.toContain('ST-1')
    expect(ct).not.toContain('Nguyễn Văn A')
    expect(await decryptQueueValue(ct)).toBe(plain)
  })

  it('AAD tách biệt: ciphertext queue KHÔNG decrypt được bằng AAD stores (chống swap)', async () => {
    const plain = JSON.stringify({ studentId: 'ST-1' })
    const queueCt = await encryptQueueValue(plain)
    const storeDecrypted = await decryptValue(queueCt, 'stores:parish_store_students')
    expect(storeDecrypted).toBeNull()
  })

  it('legacy plaintext queue → decryptQueueValue trả nguyên (dual-format)', async () => {
    const legacy = '{"fullName":"Cũ"}'
    expect(await decryptQueueValue(legacy)).toBe(legacy)
  })

  it('ciphertext queue hỏng → null (không throw)', async () => {
    expect(await decryptQueueValue('enc:v1:bad')).toBeNull()
  })
})

describe('offlineCipher — A-NEW-45 Self-Healing Storage Cleanup', () => {
  it('dexieStorage.getItem tự động xóa bản ghi ciphertext hỏng/khác khóa khỏi DB.stores', async () => {
    setTenantScope({ parishId: 'test-parish', userId: 'test-user' })
    const db = getDB()
    const invalidCiphertext = 'enc:v1:AAAA.BBBB'
    const scopedKey = 'parish_store_corrupted:test-parish:test-user'
    await db.stores.put({ key: scopedKey, value: invalidCiphertext })

    const res = await dexieStorage.getItem('parish_store_corrupted')
    expect(res).toBeNull()

    // Bản ghi rác phải bị xóa khỏi DB.stores để không spam console.error ở các lần getItem sau
    const checkAfter = await db.stores.get(scopedKey)
    expect(checkAfter).toBeUndefined()
  })
})
