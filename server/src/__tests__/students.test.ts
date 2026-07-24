import { describe, it, expect } from 'vitest'
import studentsApp from '../routes/students.js'

describe('Server Students Route Handler Tests', () => {
  it('blocks unauthenticated GET / with 401', async () => {
    const res = await studentsApp.request('/')
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST / with 401', async () => {
    const res = await studentsApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Test', holyName: 'Test', gender: 'Nam', dateOfBirth: '2015-01-01', branch: 'AuNhi', classId: 'AU1' }),
    })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated DELETE /:id with 401', async () => {
    const res = await studentsApp.request('/ST-001', { method: 'DELETE' })
    expect(res.status).toBe(401)
  })
})
