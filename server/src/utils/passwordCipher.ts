import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// AES-256-GCM: bản mã hóa "đọc được" của mật khẩu — cho phép admin xem lại mật khẩu
// hiện tại (tạm hay đã đổi) trong trang Quản Lý Tài Khoản mà KHÔNG lưu plaintext.
// Key: PASSWORD_CIPHER_KEY (hex 64 ký tự = 32 bytes). Thiếu key → không mã hóa được
// (trả null), cột Mật Khẩu hiển thị "—" thay vì pass (ADR-021).
//
// Format: v1:<iv hex>:<tag hex>:<ciphertext hex>
const VERSION = 'v1'

// A-NEW-24 (2026-08-11): memoize key theo giá trị env — tránh parse Buffer.from hex
// mỗi lần gọi (re-audit claim: "getKey() đọc env mỗi lần — không cache"). Cache bị
// invalidate ngay khi env ĐỔI giá trị → behavior LUÔN consistent với env hiện tại
// (production process.env là snapshot lúc boot, nhưng test vẫn set được env giữa chừng).
let cachedKey: Buffer | null | undefined = undefined
let cachedKeyEnv: string | undefined

function getKey(): Buffer | null {
  const keyHex = process.env.PASSWORD_CIPHER_KEY || ''
  if (keyHex === cachedKeyEnv) {
    return cachedKey ?? null
  }
  cachedKeyEnv = keyHex
  const key = keyHex ? Buffer.from(keyHex, 'hex') : null
  cachedKey = key && key.length === 32 ? key : null
  return cachedKey
}

export function encryptPassword(plaintext: string): string | null {
  if (!plaintext) return null
  const key = getKey()
  if (!key) return null
  try {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `${VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`
  } catch {
    return null
  }
}

export function decryptPassword(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null
  const key = getKey()
  if (!key) return null
  try {
    const [version, ivHex, tagHex, ctHex] = encrypted.split(':')
    if (version !== VERSION || !ivHex || !tagHex || !ctHex) return null
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
