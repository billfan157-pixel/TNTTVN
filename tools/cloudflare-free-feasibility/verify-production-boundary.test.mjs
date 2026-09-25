import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifyProductionBoundary } from './verify-production-boundary.mjs'

const release = 'a'.repeat(40)
function fetcher({ workerStatus = 503, webOrigin = 'Render', webRelease = release } = {}) {
  return async url => {
    if (url.includes('workers.dev')) return new Response('Backend cutover pending', { status: workerStatus })
    if (url.endsWith('/api/auth/me')) return new Response('', {
      status: 401, headers: { 'x-render-origin-server': webOrigin },
    })
    return Response.json({ releaseId: url.includes('vercel.app') ? webRelease : release,
      database: 'connected' }, { headers: url.includes('vercel.app')
      ? { 'x-render-origin-server': webOrigin } : {} })
  }
}

test('passes only the exact Render web route and closed Worker boundary', async () => {
  const result = await verifyProductionBoundary(release, fetcher())
  assert.equal(result.ok, true)
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
