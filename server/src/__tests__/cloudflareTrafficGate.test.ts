import { describe, expect, it } from 'vitest'
import { gateWorkerRequest } from '../cloudflare/trafficGate.js'

const token = 'operator-token-with-at-least-32-characters'
const proxySecret = 'proxy-shared-secret-with-at-least-32-characters'
const env = { OPS_TOKEN: token, CATEVIA_TRAFFIC_ENABLED: 'no', APP_RELEASE_ID: 'a'.repeat(40) }
const openEnv = { ...env, CATEVIA_TRAFFIC_ENABLED: 'yes', CATEVIA_PROXY_SHARED_SECRET: proxySecret }

describe('closed production Worker canary gate', () => {
  it('denies public and invalid-token API requests', () => {
    for (const headers of [new Headers(), new Headers({ 'x-catevia-canary-token': 'wrong' }),
      new Headers({ 'x-catevia-canary-token': 'é'.repeat(token.length) })]) {
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

  it('requires a pinned release and proxy authentication for open traffic', () => {
    const request = new Request('https://catevia-api.example/api/auth/me', {
      headers: { 'x-catevia-canary-token': token },
    })
    expect(gateWorkerRequest(request, { ...env, APP_RELEASE_ID: 'unreleased' }).response?.status).toBe(503)
    expect(gateWorkerRequest(request, { ...env, CATEVIA_TRAFFIC_ENABLED: 'yes', APP_RELEASE_ID: 'unreleased' }).response?.status).toBe(503)
    expect(gateWorkerRequest(new Request('https://catevia-api.example/api/auth/me'), openEnv).response?.status).toBe(503)
  })

  it('accepts a verified proxy request and strips untrusted identity headers', () => {
    const request = new Request('https://catevia-api.example/api/auth/me', {
      headers: {
        'x-catevia-proxy-secret': proxySecret,
        'x-catevia-client-ip': '203.0.113.10',
        'x-forwarded-for': '198.51.100.1',
        'x-real-ip': '198.51.100.2',
        'x-vercel-forwarded-for': '198.51.100.3',
      },
    })
    const result = gateWorkerRequest(request, openEnv)
    expect(result.response).toBeUndefined()
    expect(result.request?.headers.get('x-catevia-client-ip')).toBe('203.0.113.10')
    expect(result.request?.headers.get('x-catevia-proxy-secret')).toBeNull()
    expect(result.request?.headers.get('x-forwarded-for')).toBeNull()
    expect(result.request?.headers.get('x-real-ip')).toBeNull()
    expect(result.request?.headers.get('x-vercel-forwarded-for')).toBeNull()
  })

  it('rejects a proxy request without a valid client identity', () => {
    const request = new Request('https://catevia-api.example/api/auth/me', {
      headers: { 'x-catevia-proxy-secret': proxySecret },
    })
    expect(gateWorkerRequest(request, openEnv).response?.status).toBe(503)
  })

  it('keeps the operator canary usable in open mode', () => {
    const request = new Request('https://catevia-api.example/api/auth/me', {
      headers: { 'x-catevia-canary-token': token },
    })
    const result = gateWorkerRequest(request, openEnv)
    expect(result.response).toBeUndefined()
    expect(result.request?.headers.get('x-catevia-canary-token')).toBeNull()
  })
})
