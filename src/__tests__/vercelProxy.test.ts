import { afterEach, describe, expect, it, vi } from 'vitest'
import proxy from '../../proxy'

const originalTarget = process.env.CATEVIA_PROXY_TARGET
const originalSecret = process.env.CATEVIA_PROXY_SHARED_SECRET
const proxySecret = 'proxy-shared-secret-with-at-least-32-characters'

function restoreEnv(name: 'CATEVIA_PROXY_TARGET' | 'CATEVIA_PROXY_SHARED_SECRET', value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

afterEach(() => {
  vi.unstubAllGlobals()
  restoreEnv('CATEVIA_PROXY_TARGET', originalTarget)
  restoreEnv('CATEVIA_PROXY_SHARED_SECRET', originalSecret)
})

describe('Vercel backend proxy', () => {
  it('keeps the current Render target as the default ingress', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('render', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    delete process.env.CATEVIA_PROXY_TARGET
    delete process.env.CATEVIA_PROXY_SHARED_SECRET

    const response = await proxy(new Request('https://tnttvn.vercel.app/api/auth/me', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    }))

    expect(response.status).toBe(200)
    const [target, init] = fetchMock.mock.calls[0] ?? []
    expect(String(target)).toBe('https://tnttvn.onrender.com/api/auth/me')
    const headers = new Headers(init?.headers)
    expect(headers.get('x-forwarded-for')).toBeNull()
    expect(headers.get('x-catevia-client-ip')).toBeNull()
  })

  it('authenticates Worker ingress and forwards only a sanitized client IP', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('worker', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    process.env.CATEVIA_PROXY_TARGET = 'https://catevia-api.billfan157.workers.dev'
    process.env.CATEVIA_PROXY_SHARED_SECRET = proxySecret

    const response = await proxy(new Request('https://tnttvn.vercel.app/api/auth/me', {
      headers: {
        'x-forwarded-for': '203.0.113.10',
        'x-catevia-client-ip': '198.51.100.1',
        'x-catevia-proxy-secret': 'client-spoof',
      },
    }))

    expect(response.status).toBe(200)
    const [, init] = fetchMock.mock.calls[0] ?? []
    const headers = new Headers(init?.headers)
    expect(headers.get('x-catevia-proxy-secret')).toBe(proxySecret)
    expect(headers.get('x-catevia-client-ip')).toBe('203.0.113.10')
    expect(headers.get('x-forwarded-for')).toBeNull()
  })

  it('fails closed when the trusted client IP is missing', async () => {
    const fetchMock = vi.fn(async () => new Response('unexpected', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    process.env.CATEVIA_PROXY_TARGET = 'https://catevia-api.billfan157.workers.dev'
    process.env.CATEVIA_PROXY_SHARED_SECRET = proxySecret

    const response = await proxy(new Request('https://tnttvn.vercel.app/api/auth/me'))

    expect(response.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves request bodies for mutations', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe('{"name":"Lớp"}')
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)
    delete process.env.CATEVIA_PROXY_TARGET

    const response = await proxy(new Request('https://tnttvn.vercel.app/api/classes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
      body: '{"name":"Lớp"}',
    }))

    expect(response.status).toBe(204)
  })

  it('marks Worker answers so the public boundary can prove the routing target', async () => {
    const fetchMock = vi.fn(async () => new Response('worker', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    process.env.CATEVIA_PROXY_TARGET = 'https://catevia-api.billfan157.workers.dev'
    process.env.CATEVIA_PROXY_SHARED_SECRET = proxySecret

    const response = await proxy(new Request('https://tnttvn.vercel.app/api/auth/me', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    }))

    expect(response.headers.get('x-catevia-backend')).toBe('cloudflare-worker')
  })

  it('never lets a client spoof or strip the backend marker', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('worker', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    process.env.CATEVIA_PROXY_TARGET = 'https://catevia-api.billfan157.workers.dev'
    process.env.CATEVIA_PROXY_SHARED_SECRET = proxySecret

    const response = await proxy(new Request('https://tnttvn.vercel.app/api/auth/me', {
      headers: { 'x-forwarded-for': '203.0.113.10', 'x-catevia-backend': 'render' },
    }))

    expect(response.headers.get('x-catevia-backend')).toBe('cloudflare-worker')
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(new Headers(init?.headers).get('x-catevia-backend')).toBeNull()
  })

  it('leaves the Render route unmarked so the pre-cutover boundary keeps its evidence', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('render', {
      status: 200, headers: { 'x-render-origin-server': 'Render' },
    })))
    delete process.env.CATEVIA_PROXY_TARGET

    const response = await proxy(new Request('https://tnttvn.vercel.app/api/auth/me', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    }))

    expect(response.headers.get('x-render-origin-server')).toBe('Render')
    expect(response.headers.get('x-catevia-backend')).toBeNull()
    // The ingress marker is what proves Routing Middleware ran instead of the
    // external rewrites in vercel.json, which claim the same paths.
    expect(response.headers.get('x-catevia-ingress')).toBe('routing-middleware')
  })

  it('strips a client-supplied ingress marker before forwarding', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('render', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    delete process.env.CATEVIA_PROXY_TARGET

    const response = await proxy(new Request('https://tnttvn.vercel.app/api/auth/me', {
      headers: { 'x-forwarded-for': '203.0.113.10', 'x-catevia-ingress': 'external-rewrite' },
    }))

    expect(response.headers.get('x-catevia-ingress')).toBe('routing-middleware')
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(new Headers(init?.headers).get('x-catevia-ingress')).toBeNull()
  })
})
