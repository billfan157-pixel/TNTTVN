import type { Context, Next } from 'hono'
import { generateId } from '../utils/id.js'
import { getClientIp } from '../utils/ip.js'

export interface StructuredLogContext {
  requestId: string
  timestamp: string
  method: string
  path: string
  status?: number
  durationMs?: number
  userId?: string
  parishId?: string
  ip?: string
  userAgent?: string
  error?: string
}

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string
    privacyMode?: 'anonymous-feedback'
  }
}

/**
 * Anonymous feedback must not leave an application-log identity trail that an
 * in-app administrator can correlate with the stored letter. Infrastructure
 * providers may still retain transport metadata outside this application.
 */
export function applyLogPrivacy(context: StructuredLogContext, privacyMode?: string): StructuredLogContext {
  if (privacyMode !== 'anonymous-feedback') return context
  const { userId: _userId, parishId: _parishId, ip: _ip, userAgent: _userAgent, ...redacted } = context
  return { ...redacted, path: '/api/feedback/anonymous' }
}

/**
 * Structured Logging & Correlation ID Tracing Middleware
 * Enforces Request ID propagation across HTTP headers and structured JSON logs.
 */
export async function loggerMiddleware(c: Context, next: Next) {
  const startTime = performance.now()
  const requestId = c.req.header('x-request-id') || c.req.header('x-correlation-id') || generateId('AUD')
  
  // Attach requestId to response headers
  c.header('x-request-id', requestId)
  c.set('requestId', requestId)

  const logContext: StructuredLogContext = {
    requestId,
    timestamp: new Date().toISOString(),
    method: c.req.method,
    path: c.req.path,
    ip: getClientIp(c),
    userAgent: c.req.header('user-agent') || '',
  }

  try {
    await next()
  } catch (err: any) {
    logContext.error = err?.message || 'Unhandled error'
    logContext.status = 500
    throw err
  } finally {
    const user = c.get('user')
    if (user) {
      logContext.userId = user.userId
      logContext.parishId = user.parishId
    }

    logContext.status = c.res.status
    logContext.durationMs = Math.round(performance.now() - startTime)

    // Emit structured JSON log to stdout
    if (process.env.NODE_ENV !== 'test') {
      const safeLogContext = applyLogPrivacy(logContext, c.get('privacyMode'))
      console.log(JSON.stringify({ level: logContext.error ? 'ERROR' : 'INFO', ...safeLogContext }))
    }
  }
}
