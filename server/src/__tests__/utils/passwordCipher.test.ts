import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encryptPassword, decryptPassword } from '../../utils/passwordCipher.js'

// A-NEW-24 (2026-08-11): re-audit 4 claims passwordCipher + auth secrets.
// - Claim 13 "secret đọc env mỗi lần gọi" → NOT CONFIRMED (auth.ts module-level const).
// - Claim 14/15 AES-256-GCM reversible + không key rotation → CONFIRMED, ACCEPTED (ADR-021;
//   production KHÔNG set PASSWORD_CIPHER_KEY → không tồn tại bản mã hóa; rotation = đổi env).
// - Claim 16 "getKey() đọc env mỗi lần" → CONFIRMED → FIXED: memoize theo env (test dưới).

const KEY_A = 'a'.repeat(64) // hex 64 = 32 bytes hợp lệ
const KEY_B = 'b'.repeat(64)
const KEY_INVALID = 'abcdef' // < 32 bytes

describe('A-NEW-24 — passwordCipher (AES-256-GCM, key memoized theo env)', () => {
  beforeEach(() => vi.stubEnv('PASSWORD_CIPHER_KEY', KEY_A))
  afterEach(() => vi.unstubAllEnvs())

  it('roundtrip encrypt → decrypt + format v1:iv:tag:ct', () => {
    const enc = encryptPassword('MatKhauTam@123')
    expect(enc).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/)
    expect(decryptPassword(enc)).toBe('MatKhauTam@123')
  })

  it('mỗi encrypt dùng IV ngẫu nhiên → ciphertext khác nhau cho cùng plaintext', () => {
    const e1 = encryptPassword('same-password')!
    const e2 = encryptPassword('same-password')!
    expect(e1).not.toBe(e2)
    expect(decryptPassword(e1)).toBe('same-password')
    expect(decryptPassword(e2)).toBe('same-password')
  })

  it('A-NEW-24: đổi env sau lần gọi đầu → key recompute (consistent theo env hiện tại)', () => {
    const enc = encryptPassword('secret-123')! // mã hóa bằng KEY_A
    vi.stubEnv('PASSWORD_CIPHER_KEY', KEY_B)
    expect(decryptPassword(enc)).toBeNull() // KEY_B sai → GCM tag reject
    vi.stubEnv('PASSWORD_CIPHER_KEY', KEY_A)
    expect(decryptPassword(enc)).toBe('secret-123') // về KEY_A → decrypt lại được
  })

  it('key không hợp lệ (không đủ 32 bytes) → null, không crash', () => {
    vi.stubEnv('PASSWORD_CIPHER_KEY', KEY_INVALID)
    expect(encryptPassword('abc')).toBeNull()
    expect(decryptPassword('v1:aa:bb:cc')).toBeNull()
  })

  it('không có key → null (ADR-021: thiếu key → không mã hóa, cột hiển thị "—")', () => {
    vi.stubEnv('PASSWORD_CIPHER_KEY', '')
    expect(encryptPassword('abc')).toBeNull()
    expect(decryptPassword('v1:aa:bb:cc')).toBeNull()
  })

  it('format hỏng → null (không crash)', () => {
    expect(decryptPassword('v1:xyz')).toBeNull()
    expect(decryptPassword('v2:aa:bb:cc')).toBeNull()
    expect(decryptPassword('')).toBeNull()
    expect(decryptPassword(null)).toBeNull()
  })
})
