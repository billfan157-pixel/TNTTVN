import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deployRenderRelease } from './deploy-render-release.mjs'

const options = { release: 'a'.repeat(40), enabled: false, token: 'synthetic-render-token',
  serviceId: 'srv-synthetic', opsToken: 'synthetic-ops-token' }

function fixture({ status = 'live', readyRelease = options.release, enabled = false } = {}) {
  const requests = []
  let polls = 0
  return { requests, fetcher: async (url, init) => {
    requests.push({ url, ...init })
    if (init.method === 'POST') return Response.json({ id: 'dep-synthetic' })
    if (url.endsWith('/ready')) return Response.json({ status: 'ready', releaseId: readyRelease,
      maintenance: { runtime: 'node', enabled } })
    return Response.json({ status: polls++ === 0 ? 'build_in_progress' : status })
  } }
}

test('waits for the exact release and running maintenance state before declaring rollback readiness', async () => {
  const { requests, fetcher } = fixture()
  const waits = []
  assert.deepEqual(await deployRenderRelease({ ...options, fetcher, wait: async ms => { waits.push(ms) } }),
    { ok: true, release: options.release, maintenanceEnabled: false })
  assert.equal(JSON.parse(requests[0].body).commitId, options.release)
  assert.equal(requests.at(-1).url, 'https://tnttvn.onrender.com/ready')
  assert.equal(requests.at(-1).headers.authorization, `Bearer ${options.opsToken}`)
  assert.deepEqual(waits, [10_000])
})

test('fails if dashboard deployment is live but the serving process has a stale release or active writers', async () => {
  for (const mismatch of [{ readyRelease: 'b'.repeat(40) }, { enabled: true }]) {
    await assert.rejects(deployRenderRelease({ ...options, ...fixture(mismatch), wait: async () => {} }), /ownership differs/)
  }
})

test('never treats a failed deployment as readiness and validates before any mutation', async () => {
  const failed = fixture({ status: 'build_failed' })
  await assert.rejects(deployRenderRelease({ ...options, ...failed, wait: async () => {} }), /build_failed/)
  assert.equal(failed.requests.some(item => item.url.endsWith('/ready')), false)
  let called = false
  await assert.rejects(deployRenderRelease({ ...options, release: 'main', fetcher: async () => { called = true } }))
  assert.equal(called, false)
})
