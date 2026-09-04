import type { Context, Next } from 'hono'

interface MetricBucket {
  count: number
  totalMs: number
  cumulativeBuckets: number[]
}

const DURATION_BUCKETS_SECONDS = [0.1, 0.25, 0.5, 1, 2.5, 5] as const
const MAX_REQUEST_SERIES = 500
const MAX_BUSINESS_SERIES = 100

function escapePrometheusLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')
}

export function normalizeMetricPath(path: string): string {
  const cleanPath = path.split('?')[0] || '/'
  const normalized = cleanPath.split('/').map(segment => {
    if (!segment) return segment
    if (/^\d+$/.test(segment)) return ':id'
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':id'
    if (/^(?:ST|CLS|USR|GR|EX|SES|NTC|AY|TXN|FUND|ASN|LR)[-_][A-Za-z0-9_-]{4,}$/i.test(segment)) return ':id'
    if (/^[A-Za-z0-9_-]{32,}$/.test(segment)) return ':id'
    return segment
  }).join('/')
  return normalized || '/'
}

class MetricsRegistry {
  private requestCounts: Map<string, number> = new Map()
  private requestDurations: Map<string, MetricBucket> = new Map()
  private businessCounters: Map<string, number> = new Map()

  recordRequest(method: string, path: string, status: number, durationMs: number) {
    const normalizedMethod = /^[A-Z]{3,10}$/.test(method) ? method : 'OTHER'
    const normalizedPath = normalizeMetricPath(path)
    let routeKey = `${normalizedMethod} ${normalizedPath}`
    if (!this.requestDurations.has(routeKey) && this.requestDurations.size >= MAX_REQUEST_SERIES) {
      routeKey = `${normalizedMethod} /__other__`
    }
    let statusKey = `${routeKey} ${status}`
    if (!this.requestCounts.has(statusKey) && this.requestCounts.size >= MAX_REQUEST_SERIES) {
      statusKey = `${normalizedMethod} /__other__ ${status}`
    }

    this.requestCounts.set(statusKey, (this.requestCounts.get(statusKey) || 0) + 1)

    const currentBucket = this.requestDurations.get(routeKey) || {
      count: 0,
      totalMs: 0,
      cumulativeBuckets: DURATION_BUCKETS_SECONDS.map(() => 0),
    }
    currentBucket.count++
    currentBucket.totalMs += durationMs
    const durationSeconds = durationMs / 1000
    DURATION_BUCKETS_SECONDS.forEach((boundary, index) => {
      if (durationSeconds <= boundary) currentBucket.cumulativeBuckets[index]++
    })
    this.requestDurations.set(routeKey, currentBucket)
  }

  incrementBusinessMetric(metricName: string, count = 1) {
    let normalizedName = /^[A-Za-z0-9_.-]{1,80}$/.test(metricName) ? metricName : 'other'
    if (!this.businessCounters.has(normalizedName) && this.businessCounters.size >= MAX_BUSINESS_SERIES) {
      normalizedName = 'other'
    }
    this.businessCounters.set(normalizedName, (this.businessCounters.get(normalizedName) || 0) + count)
  }

  toPrometheusFormat(): string {
    const lines: string[] = [
      '# HELP http_requests_total Total number of HTTP requests processed',
      '# TYPE http_requests_total counter',
    ]

    for (const [key, val] of this.requestCounts.entries()) {
      const parts = key.split(' ')
      const method = parts[0]
      const status = parts[parts.length - 1]
      const path = parts.slice(1, parts.length - 1).join(' ')
      lines.push(`http_requests_total{method="${escapePrometheusLabel(method)}",path="${escapePrometheusLabel(path)}",status="${escapePrometheusLabel(status)}"} ${val}`)
    }

    lines.push(
      '# HELP http_request_duration_seconds HTTP request processing duration in seconds',
      '# TYPE http_request_duration_seconds histogram'
    )
    for (const [routeKey, bucket] of this.requestDurations.entries()) {
      const [method, ...pathParts] = routeKey.split(' ')
      const path = pathParts.join(' ')
      const methodLabel = escapePrometheusLabel(method)
      const pathLabel = escapePrometheusLabel(path)
      DURATION_BUCKETS_SECONDS.forEach((boundary, index) => {
        lines.push(`http_request_duration_seconds_bucket{method="${methodLabel}",path="${pathLabel}",le="${boundary}"} ${bucket.cumulativeBuckets[index]}`)
      })
      lines.push(`http_request_duration_seconds_bucket{method="${methodLabel}",path="${pathLabel}",le="+Inf"} ${bucket.count}`)
      lines.push(`http_request_duration_seconds_sum{method="${methodLabel}",path="${pathLabel}"} ${(bucket.totalMs / 1000).toFixed(4)}`)
      lines.push(`http_request_duration_seconds_count{method="${methodLabel}",path="${pathLabel}"} ${bucket.count}`)
    }

    lines.push(
      '# HELP business_events_total Total number of domain business actions executed',
      '# TYPE business_events_total counter'
    )
    for (const [metric, count] of this.businessCounters.entries()) {
      lines.push(`business_events_total{event="${escapePrometheusLabel(metric)}"} ${count}`)
    }

    return lines.join('\n') + '\n'
  }
}

export const metricsRegistry = new MetricsRegistry()

export async function metricsMiddleware(c: Context, next: Next) {
  const start = performance.now()
  try {
    await next()
  } finally {
    const durationMs = performance.now() - start
    metricsRegistry.recordRequest(c.req.method, c.req.routePath || c.req.path, c.res.status, durationMs)
  }
}
