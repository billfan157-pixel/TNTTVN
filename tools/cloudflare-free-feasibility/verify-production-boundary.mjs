// Public, read-only routing gate. It must never send an operator token or a mutation.
//
// Two modes, one per recorded backend target:
//   render → Vercel ingress reaches Render, Worker closed (pre-cutover truth)
//   worker → Vercel ingress reaches the Worker at the exact release (post-cutover truth)
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const URLS = Object.freeze({
  renderHealth: 'https://tnttvn.onrender.com/health',
  webHealth: 'https://tnttvn.vercel.app/health',
  webAuth: 'https://tnttvn.vercel.app/api/auth/me',
  workerAuth: 'https://catevia-api.billfan157.workers.dev/api/auth/me',
})

const WORKER_BACKEND_MARKER = 'cloudflare-worker'
const RENDER_ORIGIN_HEADER = 'x-render-origin-server'
const BACKEND_HEADER = 'x-catevia-backend'
const RELEASE_PATTERN = /^[a-f0-9]{40}$/
export const BOUNDARY_MODES = Object.freeze(['render', 'worker'])

function normalizeMode(mode) {
  const candidate = (mode ?? 'render').trim().toLowerCase()
  if (!BOUNDARY_MODES.includes(candidate)) {
    throw new Error(`Boundary mode must be one of ${BOUNDARY_MODES.join(', ')}`)
  }
  return candidate
}

export async function verifyProductionBoundary(expectedRelease, fetcher = fetch, { mode = 'render' } = {}) {
  if (!RELEASE_PATTERN.test(expectedRelease || '')) {
    throw new Error('Expected release must be an exact 40-character Git SHA')
  }
  const target = normalizeMode(mode)
  const workerActive = target === 'worker'

  const checks = {}
  async function probe(name, url, assess) {
    try {
      const response = await fetcher(url, {
        method: 'GET',
        headers: { 'cache-control': 'no-store' },
        signal: AbortSignal.timeout(20_000),
      })
      checks[name] = await assess(response)
    } catch (error) {
      checks[name] = { pass: false, errorClass: error?.name || 'UnknownError' }
    }
  }

  await Promise.all([
    probe('renderHealth', URLS.renderHealth, async response => {
      const body = await response.json().catch(() => ({}))
      const observed = { status: response.status, releaseId: body?.releaseId ?? null,
        database: body?.database ?? null }
      if (workerActive) {
        // After cutover Render is a rollback target, not the ingress. Whether it is
        // suspended or frozen at another release is an owner decision, so this stays
        // observed evidence and never gates the Worker boundary.
        return { ...observed, pass: true, gating: false }
      }
      return { ...observed, pass: response.status === 200 && body?.releaseId === expectedRelease
        && body?.database === 'connected' }
    }),
    probe('webHealth', URLS.webHealth, async response => {
      const body = await response.json().catch(() => ({}))
      const renderOrigin = response.headers.get(RENDER_ORIGIN_HEADER)
      const backend = response.headers.get(BACKEND_HEADER)
      const observed = { status: response.status, releaseId: body?.releaseId ?? null,
        database: body?.database ?? null, renderOrigin, backend }
      if (workerActive) {
        return { ...observed, pass: response.status === 200 && body?.releaseId === expectedRelease
          && body?.database === 'connected' && backend === WORKER_BACKEND_MARKER
          && renderOrigin !== 'Render' }
      }
      return { ...observed, pass: response.status === 200 && body?.releaseId === expectedRelease
        && body?.database === 'connected' && renderOrigin === 'Render' }
    }),
    probe('webAuth', URLS.webAuth, async response => {
      const renderOrigin = response.headers.get(RENDER_ORIGIN_HEADER)
      const backend = response.headers.get(BACKEND_HEADER)
      const observed = { status: response.status, renderOrigin, backend }
      return workerActive
        ? { ...observed, pass: response.status === 401 && backend === WORKER_BACKEND_MARKER
          && renderOrigin !== 'Render' }
        : { ...observed, pass: response.status === 401 && renderOrigin === 'Render' }
    }),
    probe('workerAuth', URLS.workerAuth, async response => {
      const body = await response.text()
      const observed = { status: response.status }
      // After cutover the Worker must refuse direct public API traffic: only the
      // Vercel proxy holds the shared secret, so an unauthenticated direct call has
      // to be rejected. Worker liveness is proven through the Vercel route instead.
      return workerActive
        ? { ...observed, pass: response.status === 503 && body === 'Backend proxy authentication required' }
        : { ...observed, pass: response.status === 503 && body === 'Backend cutover pending' }
    }),
  ])

  return {
    ok: Object.values(checks).every(check => check.gating === false || check.pass),
    mode: target,
    expectedRelease,
    checkedAt: new Date().toISOString(),
    checks,
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [release, mode] = process.argv.slice(2)
  const result = await verifyProductionBoundary(release, fetch, { mode })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (!result.ok) process.exitCode = 1
}
