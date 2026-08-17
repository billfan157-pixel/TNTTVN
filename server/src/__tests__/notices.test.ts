import { describe, it, expect } from 'vitest'
import noticesApp from '../routes/notices.js'

describe('Server Notices Route Handler Tests', () => {
  it('blocks unauthenticated GET / with 401', async () => {
    const res = await noticesApp.request('/')
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST / with 401', async () => {
    const res = await noticesApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', content: 'Content', date: '2025-09-01', author: 'Admin' }),
    })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated DELETE /:id with 401', async () => {
    const res = await noticesApp.request('/NT-001', { method: 'DELETE' })
    expect(res.status).toBe(401)
  })
})
