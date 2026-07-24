import { describe, it, expect } from 'vitest'
import authApp from '../routes/auth.js'

describe('Server Auth Routes Handler Tests', () => {
  it('rejects login with missing body or invalid credentials', async () => {
    const res = await authApp.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nonexistent', password: 'wrongpassword' }),
    })
    expect(res.status).toBe(401)
    const json = (await res.json()) as any
    expect(json.success).toBe(false)
  })

  it('rejects refresh request with invalid token', async () => {
    const res = await authApp.request('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'invalid_token_string' }),
    })
    expect(res.status).toBe(401)
  })
})
