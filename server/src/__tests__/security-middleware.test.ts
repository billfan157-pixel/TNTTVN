import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { securityHeaders, rateLimiter, loginRateLimiter } from '../middleware/security.js'

describe('Security Middleware Tests', () => {
  it('securityHeaders sets all required security headers', async () => {
    const app = new Hono()
    app.use('*', securityHeaders)
    app.get('/test', (c) => c.text('ok'))

    const res = await app.request('/test')
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'")
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=31536000')
    expect(res.headers.get('Permissions-Policy')).toContain('camera=()')
  })

  it('rateLimiter allows requests under the limit', async () => {
    const app = new Hono()
    app.use('*', rateLimiter)
    app.get('/test', (c) => c.text('ok'))

    const res = await app.request('/test')
    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Limit')).toBe('200')
  })

  it('rateLimiter sets remaining header', async () => {
    const app = new Hono()
    app.use('*', rateLimiter)
    app.get('/test', (c) => c.text('ok'))

    const res = await app.request('/test')
    const remaining = Number(res.headers.get('X-RateLimit-Remaining'))
    expect(remaining).toBeGreaterThanOrEqual(28)
  })

  it('loginRateLimiter allows requests under login limit', async () => {
    const app = new Hono()
    app.use('*', loginRateLimiter)
    app.get('/test', (c) => c.text('ok'))

    const res = await app.request('/test')
    expect(res.status).toBe(200)
  })
})
