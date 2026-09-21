import { afterEach, describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import cspReportRouter from '../../routes/cspReport.js'

// OBS-1 (2026-08-24): endpoint CSP report phải luôn trả 204 — kể cả payload lạ —
// và KHÔNG bao giờ fail (browser gửi report tự động, không auth).
const app = new Hono()
app.route('/api/csp-report', cspReportRouter)

describe('OBS-1: CSP violation report collector', () => {
  afterEach(() => vi.restoreAllMocks())

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

  it('redacts signed verification queries and arbitrary payload values from logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dummySig = 'test-verification-sig-value-xyz'

    const standard = await app.request('/api/csp-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/csp-report' },
      body: JSON.stringify({
        'csp-report': {
          'document-uri': `https://tnttvn.vercel.app/verify?studentId=child-123&sig=${dummySig}`,
          'violated-directive': 'script-src',
          'blocked-uri': `https://cdn.example/script.js?token=${dummySig}`,
          'source-file': `https://tnttvn.vercel.app/assets/app.js?debug=${dummySig}`,
        },
      }),
    })
    expect(standard.status).toBe(204)

    const unknown = await app.request('/api/csp-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `student name ${dummySig}`, authorization: `Bearer ${dummySig}` }),
    })
    expect(unknown.status).toBe(204)

    const logs = warn.mock.calls.flat().join('\n')
    expect(logs).toContain('https://tnttvn.vercel.app/verify')
    expect(logs).toContain('https://cdn.example/script.js')
    expect(logs).not.toContain('studentId=')
    expect(logs).not.toContain('token=')
    expect(logs).not.toContain(dummySig)
    expect(logs).not.toContain('student name')
  })
})
