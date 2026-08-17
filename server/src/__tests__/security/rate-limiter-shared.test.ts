import { describe, it, expect, beforeAll } from 'vitest'
import { loginRateLimiter, rateLimiter } from '../../middleware/security.js'
import { client } from '../../db/index.js'

/**
 * A-NEW-23 (2026-08-11): rate limit state nằm trong DB (bảng rate_limits) —
 * mọi app instance chia sẻ cùng SQLite file (cùng volume) đều đếm CHUNG một
 * bucket/IP, không còn Map per-process cho phép attacker nhân hệ số qua N replica.
 *
 * Verify: entry thật trong DB, đếm tăng theo UPSERT atomic, window hết hạn reset,
 * header X-RateLimit đúng, và state DB tăng dần qua các request cùng IP.
 */

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
    header: (name: string, value: string) => { ctx.headers = { ...(ctx.headers ?? {}), [name]: value } },
    _response: response,
  }
  if (remoteAddress) {
    ctx.env = { server: { incoming: { socket: { remoteAddress } } } }
  }
  return ctx
}

async function runMiddleware(mw: any, ctx: any) {
  await mw(ctx, async () => {})
  return ctx
}

async function dbRow(key: string): Promise<{ count: number; reset_at: number } | null> {
  const res = await client.execute({ sql: 'SELECT count, reset_at FROM rate_limits WHERE key = ?', args: [key] })
  if (res.rows.length === 0) return null
  const r = res.rows[0] as unknown as { count: number; reset_at: number }
  return { count: Number(r.count), reset_at: Number(r.reset_at) }
}

describe('A-NEW-23 — rate limit state chia sẻ qua DB (shared store)', () => {
  const ip = `10.${Date.now() % 200}.${Math.floor(Math.random() * 200) + 100}.${Math.floor(Math.random() * 200) + 100}`
  const key = `login:${ip}`

  beforeAll(async () => {
    await client.execute({ sql: 'DELETE FROM rate_limits WHERE key = ?', args: [key] })
  })

  it('request đầu tiên trong window → tạo row trong DB với count=1, reset_at ≈ now+60s', async () => {
    const ctx = makeContext({}, ip)
    await runMiddleware(loginRateLimiter, ctx)
    expect(ctx._response.status).toBe(200)
    const row = await dbRow(key)
    expect(row).not.toBeNull()
    expect(row!.count).toBe(1)
    expect(row!.reset_at).toBeGreaterThan(Date.now() + 50_000)
    expect(row!.reset_at).toBeLessThanOrEqual(Date.now() + 60_000)
  })

  it('request tiếp theo cùng IP → count tăng lên trong DB (không reset)', async () => {
    await runMiddleware(loginRateLimiter, makeContext({}, ip))
    const row = await dbRow(key)
    expect(row!.count).toBe(2)
  })

  it('IP khác → bucket riêng (không cộng dồn)', async () => {
    const otherIp = `10.${Date.now() % 199}.${Math.floor(Math.random() * 100) + 200}.7`
    const otherKey = `login:${otherIp}`
    await client.execute({ sql: 'DELETE FROM rate_limits WHERE key = ?', args: [otherKey] })
    await runMiddleware(loginRateLimiter, makeContext({}, otherIp))
    await runMiddleware(loginRateLimiter, makeContext({}, otherIp))
    expect((await dbRow(key))!.count).toBe(2)
    expect((await dbRow(otherKey))!.count).toBe(2)
  })

  it('row hết hạn (reset_at quá khứ) → request tiếp theo reset về count=1', async () => {
    const expiredIp = `10.${Date.now() % 198}.${Math.floor(Math.random() * 100) + 300}.9`
    const expiredKey = `login:${expiredIp}`
    await client.execute({
      sql: 'INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 99, ?)',
      args: [expiredKey, Date.now() - 1000],
    })
    await runMiddleware(loginRateLimiter, makeContext({}, expiredIp))
    const row = await dbRow(expiredKey)
    expect(row!.count).toBe(1)
    expect(row!.reset_at).toBeGreaterThan(Date.now())
  })

  it('global rateLimiter vẫn set header X-RateLimit-Limit/Remaining/Reset', async () => {
    const gIp = `10.${Date.now() % 197}.${Math.floor(Math.random() * 100) + 400}.3`
    const ctx = makeContext({}, gIp)
    await runMiddleware(rateLimiter, ctx)
    expect(ctx.headers['X-RateLimit-Limit']).toBe('1000')
    expect(Number(ctx.headers['X-RateLimit-Remaining'])).toBe(999)
    expect(Number(ctx.headers['X-RateLimit-Reset'])).toBeGreaterThan(Date.now())
  })
})
