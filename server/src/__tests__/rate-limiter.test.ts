import { describe, it, expect } from 'vitest'
import { loginRateLimiter, refreshRateLimiter, purgeRateLimiter } from '../middleware/security.js'

interface MockResponse {
  status: number
  body: any
}

function makeContext(headers: Record<string, string>, remoteAddress?: string) {
  const response: MockResponse = { status: 200, body: null }
  const ctx: any = {
    req: {
      header: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? undefined,
    },
    json: (body: any, status: number) => {
      response.body = body
      response.status = status
      return response
    },
    header: () => {},
    _response: response,
  }
  // A15: rate limiter đếm theo socket IP thật (getClientIp conninfo)
  if (remoteAddress) {
    ctx.env = { server: { incoming: { socket: { remoteAddress } } } }
  }
  return ctx
}

async function runMiddleware(mw: any, ctx: any) {
  await mw(ctx, async () => {})
  return ctx
}

/**
 * A15 (2026-08-10): limiter key = socket IP thật — KHÔNG còn phụ thuộc header
 * cf-connecting-ip / x-forwarded-for / x-real-ip mà client tự đặt được.
 */
describe('loginRateLimiter — chống bypass qua spoof proxy header', () => {
  it('cho phép dưới 10 request từ cùng IP', async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 100}`
    for (let i = 0; i < 9; i++) {
      const ctx = makeContext({}, ip)
      await runMiddleware(loginRateLimiter, ctx)
      expect(ctx._response.status).toBe(200)
    }
  })

  it('chặn request thứ 11 từ cùng IP', async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 100}`
    let blocked = false
    for (let i = 0; i < 11; i++) {
      const ctx = makeContext({}, ip)
      await runMiddleware(loginRateLimiter, ctx)
      if (ctx._response.status === 429) blocked = true
    }
    expect(blocked).toBe(true)
  })

  it('KHÔNG bypass được khi đổi cf-connecting-ip / x-forwarded-for giả mạo mỗi request', async () => {
    // socket IP thật cố định → đổi header mỗi lần vô ích, vẫn bị chặn ở request 11
    const realIp = `192.0.2.${Math.floor(Math.random() * 200) + 100}`
    let blocked = false
    for (let i = 0; i < 11; i++) {
      const ctx = makeContext({
        'cf-connecting-ip': `203.0.113.${i}`,
        'x-real-ip': `172.16.0.${i}`,
        'x-forwarded-for': `1.1.1.${i}, 2.2.2.${i}`,
      }, realIp)
      await runMiddleware(loginRateLimiter, ctx)
      if (ctx._response.status === 429) blocked = true
    }
    expect(blocked).toBe(true)
  })

  it('KHÔNG bypass được khi đổi socket IP ảo qua header (không có conninfo → fallback unknown chung)', async () => {
    // Nhấn mạnh: header giả KHÔNG tạo bucket riêng — tất cả gom về key 'unknown'
    let blocked = false
    for (let i = 0; i < 11; i++) {
      const ctx = makeContext({ 'x-forwarded-for': `203.0.113.${i}` })
      await runMiddleware(loginRateLimiter, ctx)
      if (ctx._response.status === 429) blocked = true
    }
    expect(blocked).toBe(true)
  })
})

describe('refreshRateLimiter', () => {
  it('chặn sau 30 request từ cùng IP', async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 100}`
    let blocked = false
    for (let i = 0; i < 31; i++) {
      const ctx = makeContext({}, ip)
      await runMiddleware(refreshRateLimiter, ctx)
      if (ctx._response.status === 429) blocked = true
    }
    expect(blocked).toBe(true)
  })
})

describe('purgeRateLimiter', () => {
  it('chặn sau 10 request từ cùng IP', async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 100}`
    let blocked = false
    for (let i = 0; i < 11; i++) {
      const ctx = makeContext({}, ip)
      await runMiddleware(purgeRateLimiter, ctx)
      if (ctx._response.status === 429) blocked = true
    }
    expect(blocked).toBe(true)
  })
})