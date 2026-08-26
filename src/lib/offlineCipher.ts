import { getDB } from './db'

/**
 * A-NEW-24 (2026-08-11): mã hóa dữ liệu offline tại-rest trong IndexedDB.
 *
 * Threat model: kẻ lấy được profile / file IndexedDB thô (backup máy, phần mềm
 * khôi phục, quét thiết bị) sẽ thấy toàn bộ dữ liệu học sinh ở dạng plaintext
 * JSON. Giải pháp: AES-256-GCM qua WebCrypto; khóa dạng NON-EXTRACTABLE
 * (extractable=false) lưu trong chính IndexedDB — trình duyệt serialize khóa
 * dưới dạng được bọc nội bộ, key material không bao giờ lộ dưới dạng bytes
 * đọc được → trích xuất file IDB thô không thu được khóa dùng được.
 *
 * Giới hạn (đã ghi nhận trong audit): XSS trong origin vẫn đọc được dữ liệu
 * (khóa sẵn sàng trong runtime) — ranh giới bảo vệ chính vẫn là CSP strict.
 * AAD gắn tên khóa dữ liệu (vd `stores:parish_store_students`) chống swap
 * ciphertext giữa các store/entity.
 *
 * Fallback: thiếu crypto.subtle (non-secure context hiếm gặp — app chạy https)
 * → truyền thẳng plaintext + log 1 lần. Dữ liệu legacy plaintext vẫn đọc được
 * (dual-format) cho tới khi migration chạy ở initDB.
 */

const KEY_ID_PREFIX = 'parish-offline-aes-key-'
const PREFIX = 'enc:v1:'
const IV_LENGTH = 12

// A-NEW-32 (2026-08-11): AAD riêng cho syncQueue — ciphertext của stores không
// thể dùng lại cho queue (và ngược lại) khi attacker swap dữ liệu giữa các bảng.
const SYNC_QUEUE_AAD = 'syncQueue'

function getSubtle(): SubtleCrypto | null {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.subtle !== 'undefined') {
      return globalThis.crypto.subtle
    }
  } catch {
    // ignore
  }
  return null
}

let cachedKey: CryptoKey | null = null
let missingSubtleWarned = false
let decryptFailLogged = false
let keyInitPromise: Promise<CryptoKey | null> | null = null

/**
 * A-NEW-44 (2026-08-12): fix race khởi tạo khóa — production báo
 * "offlineCipher: decrypt thất bại (khóa khác? hỏng?)" hàng loạt mỗi phiên.
 *
 * Race xảy ra khi nhiều module cùng lúc load (main.tsx) và initDB -> dexieStorage
 * store (student/grade/attendance/notice/class/sync) gọi song song; mỗi call
 * thấy `cachedKey == null` + chưa có row trong DB → mỗi call tự `generateKey`
 * rồi `put` ghi ĐÈ lên cùng một row id cố định `parish-offline-aes-key-v1`.
 * Kết quả: các value trong cùng phiên bị encrypt bằng các khóa khác nhau, các
 * khóa bị đè mất vĩnh viễn (non-extractable) → decrypt chéo fail vĩnh viễn.
 *
 * Fix (3 lớp):
 * 1. Singleton promise (`keyInitPromise`) — đảm bảo 1 lần khởi tạo/tab.
 * 2. Web Locks API (`navigator.locks`) bao quanh read-or-create — 1 tab duy
 *    nhất tạo khóa; tab khác đợi rồi đọc cùng khóa.
 * 3. Key versioning — mỗi khóa mới dùng id unique (`parish-offline-aes-key-<ts>`),
 *    KHÔNG bao giờ ghi đè key cũ; `decryptValue` thử LẦN LƯỢT mọi khóa còn trong
 *    DB (multi-key recovery) trước khi trả null.
 *
 * Giới hạn đã ghi nhận: dữ liệu đã bị encrypt bằng khóa bị ghi đè TRƯỚC khi
 * deploy fix này (id cố định v1) không thể cứu (khóa cũ không còn tồn tại) —
 * fail-open trả null → client tải lại từ server (SSOT).
 */
export function ensureOfflineKey(): Promise<CryptoKey | null> {
  if (cachedKey) return Promise.resolve(cachedKey)
  if (keyInitPromise) return keyInitPromise
  keyInitPromise = initOfflineKey()
  return keyInitPromise
}

async function initOfflineKey(): Promise<CryptoKey | null> {
  const subtle = getSubtle()
  if (!subtle) {
    if (!missingSubtleWarned) {
      console.warn('offlineCipher: crypto.subtle không có — dữ liệu offline không được mã hóa (fallback plaintext)')
      missingSubtleWarned = true
    }
    return null
  }
  const doInit = async (): Promise<CryptoKey> => {
    const db = getDB()
    const existing = await getAllKeys()
    if (existing.length > 0) {
      cachedKey = existing[0]
      return cachedKey
    }
    // Không có key nào: tạo mới với id unique (không ghi đè key lịch sử).
    const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const id = `${KEY_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await db.cryptoKeys.put({ id, key, createdAt: new Date().toISOString() })
    cachedKey = key
    return key
  }
  // Web Locks: cross-tab read-or-create an toàn (fallback: chạy thẳng nếu không hỗ trợ).
  if (typeof navigator !== 'undefined' && typeof navigator.locks !== 'undefined') {
    try {
      return await navigator.locks.request('tntt-parish-offline-key', () => doInit())
    } catch {
      // lock bị lỗi (trình duyệt lạ) — vẫn tiếp tục với singleton trong tab
      return doInit()
    }
  }
  return doInit()
}

/**
 * Tất cả khóa còn trong DB, khóa mới nhất (theo createdAt) đứng đầu.
 * Khóa cũ không có createdAt (trước A-NEW-44) xếp cuối — vẫn được thử trong
 * multi-key recovery.
 */
async function getAllKeys(): Promise<CryptoKey[]> {
  try {
    const rows = await getDB().cryptoKeys.toArray()
    return rows
      .filter((r) => r.key)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .map((r) => r.key)
  } catch {
    return []
  }
}

/** Test-only: reset cache khóa (mô phỏng phiên mới). */
export function resetOfflineKeyCache() {
  cachedKey = null
  keyInitPromise = null
  decryptFailLogged = false
}

export function isEncryptedValue(value: string): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  // tránh spread quá giới hạn đối số (~65k) khi dữ liệu lớn
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Mã hóa giá trị; không có khóa/subtle → trả về nguyên plaintext (fail-open). */
export async function encryptValue(plain: string, aad?: string): Promise<string> {
  const subtle = getSubtle()
  const key = await ensureOfflineKey()
  if (!subtle || !key) return plain
  return encryptWithKey(subtle, key, plain, aad)
}

/**
 * A-NEW-33 (2026-08-11): mã hóa FAIL-CLOSED — dữ liệu yêu cầu mã hóa nhưng
 * crypto.subtle/khóa/encrypt lỗi → THROW thay vì ghi plaintext. Dùng cho mọi
 * WRITE mới (dexieStorage.setItem, syncQueue) để encryption không âm thầm suy
 * giảm thành plaintext (threat model: trích xuất file IndexedDB thô). Legacy
 * plaintext vẫn đọc được qua dual-format — chỉ chặn ghi plaintext MỚI.
 */
export async function encryptValueStrict(plain: string, aad?: string): Promise<string> {
  const subtle = getSubtle()
  const key = await ensureOfflineKey()
  if (!subtle || !key) {
    throw new Error('offlineCipher: mã hóa bắt buộc nhưng crypto.subtle/khóa không khả dụng — từ chối ghi plaintext')
  }
  try {
    return await encryptWithKey(subtle, key, plain, aad)
  } catch (err) {
    throw new Error(`offlineCipher: encrypt thất bại — từ chối ghi plaintext: ${String(err)}`)
  }
}

async function encryptWithKey(subtle: SubtleCrypto, key: CryptoKey, plain: string, aad?: string): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const data = new TextEncoder().encode(plain)
  const aadBytes = aad ? new TextEncoder().encode(aad) : undefined
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadBytes }, key, data)
  return `${PREFIX}${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ct))}`
}

/**
 * A-NEW-32 (2026-08-11): mã hóa payload/lastError của syncQueue tại-rest (PII
 * học sinh/điểm/điểm danh). AAD `syncQueue` — tách biệt với stores ciphertext.
 */
export function encryptQueueValue(plain: string): Promise<string> {
  return encryptValueStrict(plain, SYNC_QUEUE_AAD)
}

/**
 * Giải mã giá trị queue. Ciphertext hỏng/khóa khác → null (caller bỏ qua op);
 * plaintext legacy (queue cũ / test mocks) trả nguyên — dual-format.
 */
export async function decryptQueueValue(stored: string): Promise<string | null> {
  return decryptValue(stored, SYNC_QUEUE_AAD)
}

/**
 * Giải mã giá trị.
 * - Ciphertext: AES-GCM; AAD sai / khóa sai / dữ liệu hỏng → null (data không
 *   đọc được từ khóa hiện tại — caller nên coi như chưa có và tải lại từ server).
 * - Plaintext legacy (trước A-NEW-24): trả nguyên — migration ở initDB sẽ mã hóa lại.
 */
export async function decryptValue(stored: string, aad?: string): Promise<string | null> {
  if (!isEncryptedValue(stored)) return stored
  const subtle = getSubtle()
  if (!subtle) return null
  // Đảm bảo khóa tồn tại (lần đầu) rồi thử lần lượt MỌI khóa còn trong DB —
  // phục hồi dữ liệu được encrypt bằng khóa cũ khi key mới đã active
  // (A-NEW-44: multi-key recovery).
  const key = await ensureOfflineKey()
  if (!key) return null
  const keys = await getAllKeys()
  if (keys.length === 0) return null
  const aadBytes = aad ? new TextEncoder().encode(aad) : undefined
  let lastErr: unknown = null
  for (const candidate of keys) {
    try {
      const body = stored.slice(PREFIX.length)
      const dot = body.indexOf('.')
      if (dot < 0) return null
      const iv = base64ToBytes(body.slice(0, dot))
      const ct = base64ToBytes(body.slice(dot + 1))
      const pt = await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aadBytes }, candidate, ct)
      return new TextDecoder().decode(pt)
    } catch (err) {
      lastErr = err
      // thử khóa tiếp theo
    }
  }
  if (!decryptFailLogged) {
    decryptFailLogged = true
    if (import.meta.env?.DEV) {
      console.warn('offlineCipher: bản ghi cũ không giải mã được với khóa hiện tại — tự động dọn dẹp và tải mới từ server:', lastErr)
    }
  }
  return null
}

/**
 * Migration một lần (gọi từ initDB): ghi đè mọi giá trị legacy plaintext trong
 * bảng `stores` thành ciphertext. Idempotent — value đã có prefix `enc:v1:` bỏ qua.
 * Không có subtle → bỏ qua (dữ liệu vẫn đọc được qua dual-format).
 */
export async function migrateStoredValuesToEncrypted(): Promise<void> {
  const subtle = getSubtle()
  if (!subtle || !(await ensureOfflineKey())) return
  try {
    const db = getDB()
    const rows = await db.stores.toArray()
    for (const row of rows) {
      if (isEncryptedValue(row.value)) continue
      await db.stores.put({ key: row.key, value: await encryptValue(row.value, `stores:${row.key}`) })
    }
  } catch (err) {
    console.error('offlineCipher: migration thất bại — giá trị plaintext cũ vẫn đọc được:', err)
  }
}
