import { describe, expect, it } from 'vitest'
import { gateWorkerRequest } from '../cloudflare/trafficGate.js'

const token = 'operator-token-with-at-least-32-characters'
const env = { OPS_TOKEN: token, CATEVIA_TRAFFIC_ENABLED: 'no', APP_RELEASE_ID: 'a'.repeat(40) }

describe('closed production Worker canary gate', () => {
  it('denies public and invalid-token API requests', () => {
    for (const headers of [{}, { 'x-catevia-canary-token': 'wrong' },
      { 'x-catevia-canary-token': 'é'.repeat(token.length) }]) {
      const result = gateWorkerRequest(new Request('https://catevia-api.example/api/auth/me', { headers }), env)
      expect(result.response?.status).toBe(503)
      expect(result.request).toBeUndefined()
    }
  })

  it('allows the operator health check while public traffic is closed', () => {
    const request = new Request('https://catevia-api.example/health', {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(gateWorkerRequest(request, env)).toEqual({ request })
  })

  it('passes an authenticated canary request without forwarding the canary token', () => {
    const request = new Request('https://catevia-api.example/api/auth/me', {
      headers: { 'x-catevia-canary-token': token, authorization: 'Bearer user-session' },
    })
    const result = gateWorkerRequest(request, env)
    expect(result.response).toBeUndefined()
    expect(result.request?.headers.get('x-catevia-canary-token')).toBeNull()
    expect(result.request?.headers.get('authorization')).toBe('Bearer user-session')
    expect(request.headers.get('x-catevia-canary-token')).toBe(token)
  })

  it('preserves the body of a canary mutation', async () => {
    const request = new Request('https://catevia-api.example/api/auth/login', {
      method: 'POST',
      headers: { 'x-catevia-canary-token': token, 'content-type': 'application/json' },
      body: '{"email":"probe@example.com"}',
    })
    const result = gateWorkerRequest(request, env)
    expect(result.request?.method).toBe('POST')
    expect(await result.request?.text()).toBe('{"email":"probe@example.com"}')
    expect(result.request?.headers.get('content-type')).toBe('application/json')
  })

  it('requires a pinned release for canary and public traffic', () => {
    const request = new Request('https://catevia-api.example/api/auth/me', {
      headers: { 'x-catevia-canary-token': token },
    })
    expect(gateWorkerRequest(request, { ...env, APP_RELEASE_ID: 'unreleased' }).response?.status).toBe(503)
    expect(gateWorkerRequest(request, { ...env, CATEVIA_TRAFFIC_ENABLED: 'yes', APP_RELEASE_ID: 'unreleased' }).response?.status).toBe(503)
    expect(gateWorkerRequest(request, { ...env, CATEVIA_TRAFFIC_ENABLED: 'yes' })).toEqual({ request })
  })
})
