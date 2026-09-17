import { Hono } from 'hono'

/**
 * OBS-1 (2026-08-24): CSP violation report collector.
 *
 * securityHeaders khai báo `report-uri /api/csp-report` nhưng trước đây không có
 * route nào xử lý → mọi vi phạm CSP rơi vào 404 và mất dấu. Endpoint này thu log
 * để phát hiện XSS/injection attempt đang bị CSP chặn.
 *
 * - Public by design: browser gửi report tự động, không có credential.
 * - Đã được bọc bởi rateLimiter toàn cục (1000/min/IP) + bodyLimit 10MB ở index.ts.
 * - KHÔNG lưu PII: chỉ trích field kỹ thuật của báo cáo CSP.
 */
const cspReportRouter = new Hono()

interface CspReportBody {
  'csp-report'?: Record<string, unknown>
}

function pickString(value: unknown, maxLen = 300): string | undefined {
  if (typeof value !== 'string' || !value) return undefined
  return value.slice(0, maxLen)
}

/** CSP URI fields may contain signed verification parameters or other PII. */
function sanitizeUri(value: unknown): string | undefined {
  const picked = pickString(value, 2048)
  if (!picked) return undefined
  try {
    const parsed = new URL(picked)
    if (!['http:', 'https:'].includes(parsed.protocol)) return `${parsed.protocol}//redacted`
    return `${parsed.origin}${parsed.pathname}`.slice(0, 300)
  } catch {
    // CSP keywords such as inline/eval remain useful; arbitrary values do not.
    return ['inline', 'eval', 'self', 'none'].includes(picked) ? picked : 'redacted'
  }
}

cspReportRouter.post('/', async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as CspReportBody | null
    const report = body?.['csp-report']
    if (report && typeof report === 'object') {
      console.warn(JSON.stringify({
        level: 'WARN',
        type: 'CSP_VIOLATION',
        timestamp: new Date().toISOString(),
        documentUri: sanitizeUri(report['document-uri']),
        violatedDirective: pickString(report['violated-directive']),
        effectiveDirective: pickString(report['effective-directive']),
        blockedUri: sanitizeUri(report['blocked-uri']),
        sourceFile: sanitizeUri(report['source-file']),
        lineNumber: typeof report['line-number'] === 'number' ? report['line-number'] : undefined,
        disposition: pickString(report.disposition),
      }))
    } else {
      // Report-to style hoặc payload lạ: record shape only. Values may contain
      // signed URLs, student identifiers, request bodies or injected secrets.
      console.warn(JSON.stringify({
        level: 'WARN',
        type: 'CSP_VIOLATION_RAW',
        timestamp: new Date().toISOString(),
        payloadType: Array.isArray(body) ? 'array' : body === null ? 'null' : typeof body,
        topLevelKeyCount: body && typeof body === 'object' && !Array.isArray(body)
          ? Object.keys(body).length
          : undefined,
      }))
    }
  } catch {
    // Không bao giờ để lỗi parse report làm fail request — luôn 204.
  }
  return c.body(null, 204)
})

export default cspReportRouter
