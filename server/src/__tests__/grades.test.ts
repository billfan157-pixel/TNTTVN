import { describe, it, expect } from 'vitest'
import gradesApp from '../routes/grades.js'

describe('Server Grades Route Handler Tests', () => {
  it('blocks unauthenticated GET / with 401', async () => {
    const res = await gradesApp.request('/')
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST / with 401', async () => {
    const res = await gradesApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: 'ST-001', semester: 1 }),
    })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST /batch with 401', async () => {
    const res = await gradesApp.request('/batch', { method: 'POST' })
    expect(res.status).toBe(401)
  })
})
