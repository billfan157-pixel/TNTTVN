import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// SEC-HMAC-1 (2026-08-24): hmacSigner phải
// - ký bằng REPORT_HMAC_SECRET khi có,
// - verify chấp nhận chữ ký legacy (ký bằng JWT_SECRET) để QR đã phát hành cũ còn xác thực được,
// - fail-closed ở production nếu thiếu REPORT_HMAC_SECRET (module-level),
// - từ chối chữ ký bị giả mạo.

const P = 'parish-1'
const S = 'ST-1'
const Y = '2026-2027'
const C = 'CERT-1'

async function importFresh() {
  vi.resetModules()
  return await import('../../utils/hmacSigner.js')
}

describe('SEC-HMAC-1: hmacSigner', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sign/verify roundtrip với REPORT_HMAC_SECRET', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('REPORT_HMAC_SECRET', 'a'.repeat(32))
    const mod = await importFresh()
    const sig = mod.signReportPayload(P, S, Y, C)
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
    expect(mod.verifyReportSignature(P, S, Y, C, sig)).toBe(true)
  })

  it('verify vẫn TRUE cho chữ ký legacy ký bằng JWT_SECRET sau khi set REPORT_HMAC_SECRET', async () => {
    // Bước 1: môi trường cũ — không có REPORT_HMAC_SECRET, ký bằng JWT_SECRET.
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('JWT_SECRET', 'legacy-jwt-secret-for-hmac-test')
    vi.stubEnv('REPORT_HMAC_SECRET', '')
    const legacy = await importFresh()
    const legacySig = legacy.signReportPayload(P, S, Y, C)

    // Bước 2: prod set REPORT_HMAC_SECRET riêng → QR cũ vẫn verify được.
    const hardened = await importFresh()
    vi.stubEnv('REPORT_HMAC_SECRET', 'b'.repeat(32))
    expect(hardened.verifyReportSignature(P, S, Y, C, legacySig)).toBe(true)
  })

  it('từ chối chữ ký giả mạo / sai tham số / rác', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('REPORT_HMAC_SECRET', 'c'.repeat(32))
    const mod = await importFresh()
    const sig = mod.signReportPayload(P, S, Y, C)

    expect(mod.verifyReportSignature(P, S, Y, 'CERT-2', sig)).toBe(false)
    expect(mod.verifyReportSignature(P + 'x', S, Y, C, sig)).toBe(false)
    expect(mod.verifyReportSignature(P, S, Y, C, 'deadbeef'.repeat(8))).toBe(false)
    expect(mod.verifyReportSignature(P, S, Y, C, 'not-hex!')).toBe(false)
  })

  it('production thiếu REPORT_HMAC_SECRET → import module FAIL (fail-closed)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('REPORT_HMAC_SECRET', '')
    vi.stubEnv('JWT_SECRET', 'some-jwt-secret')
    await expect(importFresh()).rejects.toThrow(/REPORT_HMAC_SECRET is required in production/)
  })

  it('non-production không có secret nào → dùng fallback dev (không throw), verify tự khớp', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('REPORT_HMAC_SECRET', '')
    vi.stubEnv('JWT_SECRET', '')
    const mod = await importFresh()
    const sig = mod.signReportPayload(P, S, Y, C)
    expect(mod.verifyReportSignature(P, S, Y, C, sig)).toBe(true)
  })
})
