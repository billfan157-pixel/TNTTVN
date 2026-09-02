import { describe, it, expect } from 'vitest'
import notificationsApp from '../routes/notifications.js'

describe('Server Notifications Route Handler Tests', () => {
  it('blocks unauthenticated POST /subscribe with 401', async () => {
    const res = await notificationsApp.request('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://example.com', keys: { p256dh: 'key', auth: 'auth' } }),
    })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST /unsubscribe with 401', async () => {
    const res = await notificationsApp.request('/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://example.com' }),
    })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated native token registration and removal with 401', async () => {
    const registration = await notificationsApp.request('/native/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installationId: '11111111-1111-4111-8111-111111111111', platform: 'android', token: 'native-token-1234567890' }),
    })
    const removal = await notificationsApp.request('/native/unregister', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installationId: '11111111-1111-4111-8111-111111111111' }),
    })
    expect(registration.status).toBe(401)
    expect(removal.status).toBe(401)
  })

  it('blocks unauthenticated POST /send with 401', async () => {
    const res = await notificationsApp.request('/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', body: 'Test body' }),
    })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated GET /subscriptions with 401', async () => {
    const res = await notificationsApp.request('/subscriptions')
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST /smart/absence with 401', async () => {
    const res = await notificationsApp.request('/smart/absence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName: 'Test', holyName: 'Test', className: 'Lớp 1', date: '2025-01-01', status: 'AbsentUnexcused', parentName: 'Parent', parentPhone: '0901234567' }),
    })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST /smart/report-cards with 401', async () => {
    const res = await notificationsApp.request('/smart/report-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students: [{ studentName: 'A', holyName: 'B', className: 'Lớp 1', score: 8, rank: 'Giỏi', attendanceRate: 90, attendancePresent: 18, attendanceTotal: 20 }] }),
    })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST /smart/reminder/sunday with 401', async () => {
    const res = await notificationsApp.request('/smart/reminder/sunday', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST /smart/reminder/class with 401', async () => {
    const res = await notificationsApp.request('/smart/reminder/class', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ className: 'Lớp 1', date: '2025-01-01' }),
    })
    expect(res.status).toBe(401)
  })
})
