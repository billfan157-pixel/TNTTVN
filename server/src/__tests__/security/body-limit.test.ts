import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

// A-NEW-26 (2026-08-11): bodyLimit 10MB toàn /api/* (index.ts:56) — claim "upload song song
// 10MB gây memory pressure". Evidence: middleware REJECT sớm (413) khi vượt giới hạn —
// body không được parse/giữ trong memory; memory pressure bị chặn tại boundary.
describe('A-NEW-26 — bodyLimit (10MB) trên /api/*', () => {
  const app = new Hono()
  app.use('*', bodyLimit({ maxSize: 10 * 1024 * 1024 }))
  app.post('/api/test', async (c) => {
    await c.req.json()
    return c.json({ ok: true })
  })

  it('payload dưới giới hạn → 200, parse được', async () => {
    const res = await app.request('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'x'.repeat(1024) }),
    })
    expect(res.status).toBe(200)
  })

  it('payload vượt 10MB → 413 sớm (không parse body, không giữ memory)', async () => {
    const res = await app.request('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'x'.repeat(10 * 1024 * 1024 + 1024) }),
    })
    expect(res.status).toBe(413)
  })

  it('tiêu đề Content-Length báo > 10MB → reject trước khi đọc body', async () => {
    const res = await app.request('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(11 * 1024 * 1024) },
      body: '{}',
    })
    // Honø kiểm tra Content-Length trước → 413 ngay, không cần đọc hết body
    expect(res.status).toBe(413)
  })
})