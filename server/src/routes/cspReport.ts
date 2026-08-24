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

cspReportRouter.post('/', async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as CspReportBody | null
    const report = body?.['csp-report']
    if (report && typeof report === 'object') {
      console.warn(JSON.stringify({
        level: 'WARN',
        type: 'CSP_VIOLATION',
        timestamp: new Date().toISOString(),
        documentUri: pickString(report['document-uri']),
        violatedDirective: pickString(report['violated-directive']),
        effectiveDirective: pickString(report['effective-directive']),
        blockedUri: pickString(report['blocked-uri']),
        sourceFile: pickString(report['source-file']),
        lineNumber: typeof report['line-number'] === 'number' ? report['line-number'] : undefined,
        disposition: pickString(report.disposition),
      }))
    } else {
      // Report-to style hoặc payload lạ — vẫn ghi nhận dạng thô đã cắt ngắn.
      const raw = JSON.stringify(body).slice(0, 1000)
      console.warn(JSON.stringify({
        level: 'WARN',
        type: 'CSP_VIOLATION_RAW',
        timestamp: new Date().toISOString(),
        raw,
      }))
    }
  } catch {
    // Không bao giờ để lỗi parse report làm fail request — luôn 204.
  }
  return c.body(null, 204)
})

export default cspReportRouter
