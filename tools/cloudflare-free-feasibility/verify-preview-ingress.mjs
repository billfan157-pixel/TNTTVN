// Public, read-only ingress check for a Vercel deployment.
//
// vercel.json can express two competing owners for the same path: Routing Middleware
// (proxy.ts) and an external rewrite. When both claim /api or /health, one Vercel
// preview served the SPA index.html for API requests while production still answered
// through the legacy rewrite. This check fails that class of regression by requiring
// the ingress marker that only proxy.ts emits, and by refusing a text/html answer on
// an API path. It sends no operator token and mutates nothing.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const INGRESS_HEADER = 'x-catevia-ingress'
export const INGRESS_MARKER = 'routing-middleware'

function randomProbePath() {
  // A unique path cannot be served from a warm CDN entry, so the answer describes
  // the deployed routing rules rather than a cached earlier deployment.
  return `/api/catevia-ingress-probe-${Math.random().toString(36).slice(2, 10)}`
}

async function probe(base, path, { fetcher = fetch, timeoutMs = 45_000 } = {}) {
  const url = `${base.replace(/\/+$/, '')}${path}`
  try {
    const response = await fetcher(url, {
      headers: { 'cache-control': 'no-store' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await response.text()
    return {
      url,
      status: response.status,
      contentType: (response.headers.get('content-type') || '').split(';')[0],
      ingress: response.headers.get(INGRESS_HEADER),
      backend: response.headers.get('x-catevia-backend'),
      servedBy: response.headers.get('x-vercel-cache'),
      age: response.headers.get('age'),
      body: text.slice(0, 80),
      pass: response.headers.get(INGRESS_HEADER) === INGRESS_MARKER,
    }
  } catch (error) {
    return { url, pass: false, errorClass: error?.name || 'UnknownError' }
  }
}

export async function verifyPreviewIngress(base, options = {}) {
  if (typeof base !== 'string' || !/^https:\/\/[a-z0-9.-]+\.vercel\.app$/i.test(base.trim())) {
    throw new Error('A https://<deployment>.vercel.app base URL is required')
  }
  const target = base.trim()
  const { fetcher = fetch } = options
  const apiPath = randomProbePath()
  const [api, health] = await Promise.all([
    probe(target, apiPath, { ...options, fetcher }),
    probe(target, '/health', { ...options, fetcher }),
  ])
  // The SPA fallback answering an API path is the exact failure this gate exists for.
  const apiServedBySpa = api.contentType === 'text/html'
  const healthServedBySpa = health.contentType === 'text/html'
  return {
    ok: api.pass && health.pass && !apiServedBySpa && !healthServedBySpa,
    base: target,
    checkedAt: new Date().toISOString(),
    findings: {
      apiPathServedBySpa: apiServedBySpa,
      healthServedBySpa: healthServedBySpa,
      apiPathMissingIngressMarker: !api.pass,
      healthMissingIngressMarker: !health.pass,
    },
    checks: { api, health },
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = await verifyPreviewIngress(process.argv[2])
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) {
    process.stderr.write('Vercel ingress is not owned by proxy.ts for /api and /health.\n')
    process.exitCode = 1
  }
}
