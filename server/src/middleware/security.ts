import { createMiddleware } from 'hono/factory'

const SELF = "'self'"

const CSP = [
  `default-src ${SELF}`,
  `script-src ${SELF} 'unsafe-inline'`,
  `style-src ${SELF} 'unsafe-inline'`,
  `img-src ${SELF} data:`,
  `connect-src ${SELF} https://o0.ingest.sentry.io`,
  `font-src ${SELF} https://fonts.gstatic.com`,
  `base-uri ${SELF}`,
  `form-action ${SELF}`,
].join('; ')

export const securityHeaders = createMiddleware(async (c, next) => {
  c.header('Content-Security-Policy', CSP)
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '0')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  await next()
})

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()
const WINDOW_MS = 60_000
const MAX_REQUESTS = 200

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key)
  }
}, 60_000)

export const rateLimiter = createMiddleware(async (c, next) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
  const now = Date.now()
  let entry = store.get(ip)
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS }
    store.set(ip, entry)
  }
  entry.count++
  c.header('X-RateLimit-Limit', String(MAX_REQUESTS))
  c.header('X-RateLimit-Remaining', String(Math.max(0, MAX_REQUESTS - entry.count)))
  c.header('X-RateLimit-Reset', String(entry.resetAt))
  if (entry.count > MAX_REQUESTS) {
    return c.json({ error: 'Too many requests, try again later' }, 429)
  }
  await next()
})

export const loginRateLimiter = createMiddleware(async (c, next) => {
  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
  const now = Date.now()
  let entry = store.get(`login:${ip}`)
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS }
    store.set(`login:${ip}`, entry)
  }
  entry.count++
  if (entry.count > 10) {
    return c.json({ error: 'Too many login attempts, try again later' }, 429)
  }
  await next()
})
