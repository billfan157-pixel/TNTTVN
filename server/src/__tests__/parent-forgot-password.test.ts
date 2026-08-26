import { describe, expect, it } from 'vitest'
import authApp from '../routes/auth.js'

describe('parent password recovery hardening (ADR-058)', () => {
  it('returns 410 and never accepts child KBA as proof of identity', async () => {
    const response = await authApp.request('/parent-reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '0901234567',
        childDob: '2015-01-02',
        childName: 'Tên có thật cũng không được dùng',
        newPassword: 'NewPass@123',
      }),
    })
    expect(response.status).toBe(410)
    const body = await response.json() as any
    expect(body.error.code).toBe('PARENT_SELF_RESET_REMOVED')
    expect(body.error.message).toMatch(/Ban Giáo Lý/)
  })

  it('does not require or echo child data from legacy clients', async () => {
    const response = await authApp.request('/parent-reset-password', { method: 'POST' })
    expect(response.status).toBe(410)
    expect(JSON.stringify(await response.json())).not.toMatch(/ngày sinh|tên của con/i)
  })
})
