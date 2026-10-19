import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import app from '../../app.js'
import { client } from '../../db/index.js'

/**
 * A-SEC (2026-10-18): mỗi request login/refresh chỉ được đếm ĐÚNG MỘT LẦN vào
 * bucket rate-limit tương ứng.
 *
 * Regression thật đã xảy ra: `loginRateLimiter` được mount ĐỒNG THỜI ở cấp app
 * (`app.use('/api/auth/login', loginRateLimiter)`) và ở cấp route
 * (`auth.post('/login', loginRateLimiter, ...)`). Cả hai dùng chung key
 * `login:<ip>`, nên mỗi lần thử đăng nhập bị tính 2 lần → ngưỡng thiết kế
 * 10 lần/60s thực tế chỉ còn 5 lần, khóa người dùng thật sớm gấp đôi.
 *
 * Test chạy trên app THẬT (`server/src/app.ts`) nên sẽ đỏ ngay nếu ai đó mount
 * lại limiter ở cấp app hoặc thêm một lớp limiter trùng key khác.
 */

const TRUST_PROXY_BEFORE = process.env.TRUST_PROXY

function uniqueIp(octet3: number): string {
  return `198.51.${octet3}.${Math.floor(Math.random() * 200) + 20}`
}

const jsonHeaders = { 'Content-Type': 'application/json' }

async function bucketCount(key: string): Promise<number | null> {
  const res = await client.execute({
    sql: 'SELECT count FROM rate_limits WHERE key = ?',
    args: [key],
  })
  if (res.rows.length === 0) return null
  return Number((res.rows[0] as unknown as { count: number | bigint }).count)
}

describe('login/refresh rate limit — một request chỉ tăng một lần', () => {
  const loginIp = uniqueIp(1)
  const refreshIp = uniqueIp(2)
  const loginKey = `login:${loginIp}`
  const refreshKey = `refresh:${refreshIp}`

  beforeAll(async () => {
    // TRUST_PROXY=true (mô phỏng Nginx của chúng ta) để x-real-ip xác định
    // bucket — app.request() trong Node không có socket conninfo.
    process.env.TRUST_PROXY = 'true'
    await client.execute({ sql: 'DELETE FROM rate_limits WHERE key IN (?, ?)', args: [loginKey, refreshKey] })
  })

  afterAll(async () => {
    await client.execute({ sql: 'DELETE FROM rate_limits WHERE key IN (?, ?)', args: [loginKey, refreshKey] })
    if (TRUST_PROXY_BEFORE === undefined) delete process.env.TRUST_PROXY
    else process.env.TRUST_PROXY = TRUST_PROXY_BEFORE
  })

  it('một POST /api/auth/login → bucket login tăng đúng 1', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { ...jsonHeaders, 'x-real-ip': loginIp },
      body: JSON.stringify({ username: 'khong-ton-tai-rate-limit', password: 'SaiMatKhau1!' }),
    })
    expect(res.status).toBe(401)
    expect(await bucketCount(loginKey)).toBe(1)
  })

  it('request login thứ hai → bucket tăng tiếp lên 2 (limiter vẫn hoạt động)', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { ...jsonHeaders, 'x-real-ip': loginIp },
      body: JSON.stringify({ username: 'khong-ton-tai-rate-limit', password: 'SaiMatKhau1!' }),
    })
    expect(res.status).toBe(401)
    expect(await bucketCount(loginKey)).toBe(2)
  })

  it('một POST /api/auth/refresh → bucket refresh tăng đúng 1', async () => {
    const res = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: { ...jsonHeaders, 'x-real-ip': refreshIp },
      body: JSON.stringify({}),
    })
    // Không có refresh cookie → route từ chối (401/400), nhưng limiter đã đếm.
    expect(res.status).not.toBe(200)
    expect(await bucketCount(refreshKey)).toBe(1)
  })
})
