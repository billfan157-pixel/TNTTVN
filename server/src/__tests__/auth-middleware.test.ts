import { describe, it, expect, vi } from 'vitest'
import { generateTokens, verifyToken, JwtPayload } from '../middleware/auth'

describe('Auth Middleware & JWT Token Security', () => {
  const mockPayload: JwtPayload = {
    userId: 'USR-001',
    username: 'admin',
    role: 'admin',
    parishId: 'thanh-gia',
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
})
