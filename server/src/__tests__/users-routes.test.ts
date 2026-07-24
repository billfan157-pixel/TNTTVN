import { describe, it, expect } from 'vitest'
import usersApp from '../routes/users.js'

describe('Server Users Route Handler Tests', () => {
  it('blocks unauthenticated GET / request with 401', async () => {
    const res = await usersApp.request('/')
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST / request with 401', async () => {
    const res = await usersApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', fullName: 'Test User', role: 'chunhiem' }),
    })
    expect(res.status).toBe(401)
  })
})
