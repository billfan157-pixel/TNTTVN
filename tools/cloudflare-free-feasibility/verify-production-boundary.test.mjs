import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifyProductionBoundary } from './verify-production-boundary.mjs'

const release = 'a'.repeat(40)
const MARKER = 'x-catevia-backend'
function fetcher({ workerStatus = 503, workerBody = 'Backend cutover pending', webOrigin = 'Render', webRelease = release, backend = null } = {}) {
  return async url => {
    if (url.includes('workers.dev')) return new Response(workerBody, { status: workerStatus })
    if (url.endsWith('/api/auth/me')) return new Response('', {
      status: 401, headers: { 'x-render-origin-server': webOrigin, [MARKER]: backend },
    })
    return Response.json({ releaseId: url.includes('vercel.app') ? webRelease : release,
      database: 'connected' }, { headers: url.includes('vercel.app')
      ? { 'x-render-origin-server': webOrigin, [MARKER]: backend } : {} })
  }
}
const workerFetcher = (options = {}) => fetcher({
  workerStatus: 503, workerBody: 'Backend proxy authentication required',
  webOrigin: null, backend: 'cloudflare-worker', ...options,
})

test('passes only the exact Render web route and closed Worker boundary', async () => {
  const result = await verifyProductionBoundary(release, fetcher())
  assert.equal(result.ok, true)
  assert.equal(result.mode, 'render')
  assert.equal(Object.keys(result.checks).length, 4)
})

test('blocks public Worker traffic, a changed web proxy, and a stale release', async () => {
  for (const options of [{ workerStatus: 401 }, { webOrigin: null }, { webRelease: 'b'.repeat(40) }]) {
    assert.equal((await verifyProductionBoundary(release, fetcher(options))).ok, false)
  }
})

test('fails closed on network errors and invalid release identifiers', async () => {
  const result = await verifyProductionBoundary(release, async () => { throw new TypeError('offline') })
  assert.equal(result.ok, false)
  assert.equal(result.checks.renderHealth.errorClass, 'TypeError')
  await assert.rejects(verifyProductionBoundary('unreleased', fetcher()))
})

test('passes the Worker boundary only when Vercel ingress reaches the exact Worker release', async () => {
  const result = await verifyProductionBoundary(release, workerFetcher(), { mode: 'worker' })
  assert.equal(result.ok, true)
  assert.equal(result.mode, 'worker')
  assert.equal(result.checks.webHealth.backend, 'cloudflare-worker')
  assert.equal(result.checks.workerAuth.pass, true)
})

test('blocks a Worker boundary that still routes to Render, lacks the marker, serves a stale release, or exposes the Worker directly', async () => {
  for (const options of [{ webOrigin: 'Render' }, { backend: null }, { backend: 'render' },
    { webRelease: 'b'.repeat(40) }, { workerStatus: 200 }]) {
    const result = await verifyProductionBoundary(release, workerFetcher(options), { mode: 'worker' })
    assert.equal(result.ok, false, JSON.stringify(options))
  }
})

test('keeps Render evidence non-gating after cutover', async () => {
  const result = await verifyProductionBoundary(release,
    async url => (url.includes('onrender.com') ? new Response('', { status: 503 }) : workerFetcher()(url)),
    { mode: 'worker' })
  assert.equal(result.ok, true)
  assert.equal(result.checks.renderHealth.gating, false)
  assert.equal(result.checks.renderHealth.status, 503)
})

test('rejects an unknown boundary mode instead of defaulting', async () => {
  await assert.rejects(verifyProductionBoundary(release, workerFetcher(), { mode: 'both' }))
})
