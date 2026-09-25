// Public, read-only routing gate. It must never send an operator token or a mutation.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const URLS = Object.freeze({
  renderHealth: 'https://tnttvn.onrender.com/health',
  webHealth: 'https://tnttvn.vercel.app/health',
  webAuth: 'https://tnttvn.vercel.app/api/auth/me',
  workerAuth: 'https://catevia-api.billfan157.workers.dev/api/auth/me',
})

export async function verifyProductionBoundary(expectedRelease, fetcher = fetch) {
  if (!/^[a-f0-9]{40}$/.test(expectedRelease || '')) {
    throw new Error('Expected release must be an exact 40-character Git SHA')
  }

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
      const body = await response.json()
      return { pass: response.status === 200 && body.releaseId === expectedRelease
        && body.database === 'connected', status: response.status,
      releaseId: body.releaseId || null, database: body.database || null }
    }),
    probe('webHealth', URLS.webHealth, async response => {
      const body = await response.json()
      return { pass: response.status === 200 && body.releaseId === expectedRelease
        && body.database === 'connected'
        && response.headers.get('x-render-origin-server') === 'Render',
      status: response.status, releaseId: body.releaseId || null,
      database: body.database || null,
      renderOrigin: response.headers.get('x-render-origin-server') }
    }),
    probe('webAuth', URLS.webAuth, async response => ({
      pass: response.status === 401 && response.headers.get('x-render-origin-server') === 'Render',
      status: response.status,
      renderOrigin: response.headers.get('x-render-origin-server'),
    })),
    probe('workerAuth', URLS.workerAuth, async response => ({
      pass: response.status === 503 && (await response.text()) === 'Backend cutover pending',
      status: response.status,
    })),
  ])

  return { ok: Object.values(checks).every(check => check.pass), expectedRelease,
    checkedAt: new Date().toISOString(), checks }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = await verifyProductionBoundary(process.argv[2])
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (!result.ok) process.exitCode = 1
}
