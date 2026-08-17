import { describe, it, expect } from 'vitest'
import attendanceApp from '../routes/attendance.js'

describe('Server Attendance Route Handler Tests', () => {
  it('blocks unauthenticated GET / with 401', async () => {
    const res = await attendanceApp.request('/')
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST / with 401', async () => {
    const res = await attendanceApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: 'ST-001', date: '2025-09-01', type: 'CatechismClass', status: 'Present' }),
    })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST /batch with 401', async () => {
    const res = await attendanceApp.request('/batch', { method: 'POST' })
    expect(res.status).toBe(401)
  })
})
