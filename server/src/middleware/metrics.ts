import type { Context, Next } from 'hono'

interface MetricBucket {
  count: number
  totalMs: number
}

class MetricsRegistry {
  private requestCounts: Map<string, number> = new Map()
  private requestDurations: Map<string, MetricBucket> = new Map()
  private businessCounters: Map<string, number> = new Map()

  recordRequest(method: string, path: string, status: number, durationMs: number) {
    const routeKey = `${method} ${path}`
    const statusKey = `${routeKey} ${status}`

    this.requestCounts.set(statusKey, (this.requestCounts.get(statusKey) || 0) + 1)

    const currentBucket = this.requestDurations.get(routeKey) || { count: 0, totalMs: 0 }
    currentBucket.count++
    currentBucket.totalMs += durationMs
    this.requestDurations.set(routeKey, currentBucket)
  }

  incrementBusinessMetric(metricName: string, count = 1) {
    this.businessCounters.set(metricName, (this.businessCounters.get(metricName) || 0) + count)
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
      lines.push(`http_requests_total{method="${method}",path="${path}",status="${status}"} ${val}`)
    }

    lines.push(
      '# HELP http_request_duration_seconds Total HTTP request processing duration in seconds',
      '# TYPE http_request_duration_seconds counter'
    )
    for (const [routeKey, bucket] of this.requestDurations.entries()) {
      const [method, ...pathParts] = routeKey.split(' ')
      const path = pathParts.join(' ')
      const durationSec = (bucket.totalMs / 1000).toFixed(4)
      lines.push(`http_request_duration_seconds{method="${method}",path="${path}"} ${durationSec}`)
    }

    lines.push(
      '# HELP business_events_total Total number of domain business actions executed',
      '# TYPE business_events_total counter'
    )
    for (const [metric, count] of this.businessCounters.entries()) {
      lines.push(`business_events_total{event="${metric}"} ${count}`)
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
    metricsRegistry.recordRequest(c.req.method, c.req.path, c.res.status, durationMs)
  }
}
