import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { securityHeaders, rateLimiter, loginRateLimiter } from '../middleware/security.js'

describe('Security Middleware Tests', () => {
  it('securityHeaders sets all required security headers', async () => {
    const app = new Hono()
    app.use('*', securityHeaders)
    app.get('/test', (c) => c.text('ok'))

    const res = await app.request('/test')
    const csp = res.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("default-src 'self'")
    // A-NEW-23: <style> element phải 'self' (chặn inline trong main document),
    // style-attribute vẫn 'unsafe-inline' (React style={} 100+ chỗ) qua style-src-attr riêng.
    expect(csp).toContain("style-src 'self'; style-src-attr 'unsafe-inline'")
    expect(csp).not.toContain("style-src 'self' 'unsafe-inline'")
    // CSP-FONTS (2026-09-08): SW fetch Google Fonts chịu CSP của chính response
    // sw.js — connect-src thiếu host này thì Inter fail trên production.
    expect(csp).toMatch(/connect-src[^;]*https:\/\/fonts\.googleapis\.com/)
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=31536000')
    expect(res.headers.get('Permissions-Policy')).toContain('camera=()')
    // A-NEW-28: A-NEW-20 — API response sensitive (export snapshot...) không được cache
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('rateLimiter allows requests under the limit', async () => {
    const app = new Hono()
    app.use('*', rateLimiter)
    app.get('/test', (c) => c.text('ok'))

    const res = await app.request('/test')
    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Limit')).toBe('1000')
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
