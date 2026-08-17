import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import { generateTokens, verifyToken, type JwtPayload } from '../middleware/auth.js'

describe('Auth Middleware & JWT Token Security', () => {
const mockPayload: JwtPayload = {
     userId: 'USR-001',
     username: 'admin',
     role: 'admin',
     parishId: 'gia-ton',
     tokenVersion: 1,
   }

  it('generates valid access and refresh tokens containing tokenVersion', () => {
    const tokens = generateTokens(mockPayload)
    expect(tokens.accessToken).toBeDefined()
    expect(tokens.refreshToken).toBeDefined()

    const verified = verifyToken(tokens.accessToken)
    expect(verified).not.toBeNull()
    expect(verified?.userId).toBe('USR-001')
    expect(verified?.tokenVersion).toBe(1)
  })

  it('returns null when verifying an invalid or corrupted token', () => {
    const verified = verifyToken('invalid.token.payload')
    expect(verified).toBeNull()
  })

  it('correctly decodes role in payload for RBAC checks', () => {
    const tokens = generateTokens(mockPayload)
    const payload = verifyToken(tokens.accessToken)
    expect(payload?.role).toBe('admin')
  })

  // A-NEW-25 (2026-08-11): chống algorithm-confusion (CVE-2022-23529/23539/23540/23541) —
  // verify phải từ chối token ký bằng alg KHÁC HS256 dù cùng secret (whitelist algorithms:[HS256]).
  it('rejects tokens signed with a different algorithm (algorithm-confusion defense)', () => {
    const forged = jwt.sign({ ...mockPayload }, process.env.JWT_SECRET || 'default-test-jwt-secret-key-32-chars-long', { algorithm: 'HS384', expiresIn: '15m' })
    expect(verifyToken(forged)).toBeNull()
  })

  it('rejects tokens with alg=none header (unsigned token injection)', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ ...mockPayload, exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url')
    const unsigned = `${header}.${payload}.` // signature trống
    expect(verifyToken(unsigned)).toBeNull()
  })
})
