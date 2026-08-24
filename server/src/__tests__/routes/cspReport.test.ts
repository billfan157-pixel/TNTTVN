import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import cspReportRouter from '../../routes/cspReport.js'

// OBS-1 (2026-08-24): endpoint CSP report phải luôn trả 204 — kể cả payload lạ —
// và KHÔNG bao giờ fail (browser gửi report tự động, không auth).
const app = new Hono()
app.route('/api/csp-report', cspReportRouter)

describe('OBS-1: CSP violation report collector', () => {
  it('POST báo cáo chuẩn (csp-report) → 204', async () => {
    const res = await app.request('/api/csp-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/csp-report' },
      body: JSON.stringify({
        'csp-report': {
          'document-uri': 'https://tnttvn.vercel.app/',
          'violated-directive': 'script-src',
          'blocked-uri': 'https://evil.example/x.js',
        },
      }),
    })
    expect(res.status).toBe(204)
  })

  it('POST JSON rác / thiếu csp-report → vẫn 204', async () => {
    const res1 = await app.request('/api/csp-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"something":"else"}',
    })
    expect(res1.status).toBe(204)

    const res2 = await app.request('/api/csp-report', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json at all',
    })
    expect(res2.status).toBe(204)
  })

  it('POST body rỗng → vẫn 204', async () => {
    const res = await app.request('/api/csp-report', { method: 'POST' })
    expect(res.status).toBe(204)
  })
})
