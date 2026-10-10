import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifyProductionIngress } from './verify-production-ingress.mjs'

const identity = { deploymentId: 'dpl_test123', projectId: 'prj_test', teamId: 'team_test', token: 'private-api-token' }
function fixture({ before = {}, after = {}, apiStatus = 200, spa = false } = {}) {
  let aliasRequests = 0
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    if (new URL(url).hostname === 'api.vercel.com') {
      aliasRequests++
      return Response.json({ alias: 'tnttvn.vercel.app', deploymentId: identity.deploymentId,
        projectId: identity.projectId, ...(aliasRequests === 1 ? before : after) }, { status: apiStatus })
    }
    assert.equal(new URL(url).hostname, 'tnttvn.vercel.app')
    assert.equal(new Headers(options.headers).has('authorization'), false)
    return new Response(spa ? '<html>SPA</html>' : '{}', { headers: {
      'content-type': spa ? 'text/html' : 'application/json',
      'x-catevia-ingress': 'routing-middleware',
    } })
  }
  return { fetcher, calls }
}

test('probes the public alias mapped to the exact deployment without exposing API credentials', async () => {
  const f = fixture()
  const result = await verifyProductionIngress({ ...identity, fetcher: f.fetcher })
  assert.equal(result.ok, true)
  assert.equal(result.aliasMappingVerified, true)
  assert.equal(f.calls.filter(c => new URL(c.url).hostname === 'api.vercel.com').length, 2)
  assert.ok(f.calls.some(c => /\/api\/catevia-ingress-probe-/.test(c.url)))
})

test('never probes an alias mapped to another deployment, project, host or redirect', async () => {
  for (const before of [{ deploymentId: 'dpl_old' }, { projectId: 'prj_other' },
    { alias: 'other.vercel.app' }, { redirect: 'https://other.vercel.app' }]) {
    const f = fixture({ before })
    await assert.rejects(verifyProductionIngress({ ...identity, fetcher: f.fetcher }), /expected deployment/)
    assert.equal(f.calls.length, 1)
  }
})

test('rejects an alias changed while public ingress probes run', async () => {
  const f = fixture({ after: { deploymentId: 'dpl_new' } })
  await assert.rejects(verifyProductionIngress({ ...identity, fetcher: f.fetcher }), /expected deployment/)
})

test('fails a SPA response even when the production alias mapping is correct', async () => {
  const f = fixture({ spa: true })
  assert.equal((await verifyProductionIngress({ ...identity, fetcher: f.fetcher })).ok, false)
})

test('fails closed on API authorization failure and does not follow API redirects', async () => {
  const f = fixture({ apiStatus: 403 })
  await assert.rejects(verifyProductionIngress({ ...identity, fetcher: f.fetcher }), /HTTP 403/)
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].options.redirect, 'error')
})
