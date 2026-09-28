import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifyPreviewIngress } from './verify-preview-ingress.mjs'

const INGRESS = 'x-catevia-ingress'
const base = 'https://tnttvn-abc123.vercel.app'

function fetcher({ apiIngress = 'routing-middleware', healthIngress = 'routing-middleware',
  apiType = 'application/json', healthType = 'application/json' } = {}) {
  return async url => {
    const isApi = url.includes('/api/')
    const headers = new Headers({ 'content-type': `${isApi ? apiType : healthType}; charset=utf-8` })
    if (isApi ? apiIngress : healthIngress) headers.set(INGRESS, isApi ? apiIngress : healthIngress)
    return new Response(isApi ? '{"error":"Not found"}' : '{"status":"ok"}', { status: isApi ? 404 : 200, headers })
  }
}

test('passes when the proxy answers both the API path and /health', async () => {
  const result = await verifyPreviewIngress(base, { fetcher: fetcher() })
  assert.equal(result.ok, true)
  assert.equal(result.findings.apiPathServedBySpa, false)
  assert.match(result.checks.api.url, /\/api\/catevia-ingress-probe-/)
})

test('fails when the SPA fallback answers an API path', async () => {
  const result = await verifyPreviewIngress(base, { fetcher: fetcher({ apiType: 'text/html' }) })
  assert.equal(result.ok, false)
  assert.equal(result.findings.apiPathServedBySpa, true)
})

test('fails when a rewrite answers instead of the proxy', async () => {
  for (const options of [{ apiIngress: null }, { healthIngress: null }]) {
    const result = await verifyPreviewIngress(base, { fetcher: fetcher(options) })
    assert.equal(result.ok, false)
  }
})

test('rejects a non-Vercel base URL instead of probing an arbitrary host', async () => {
  await assert.rejects(verifyPreviewIngress('https://example.com'))
  await assert.rejects(verifyPreviewIngress('http://insecure.vercel.app'))
})

test('reports a network failure as a failed check, not a crash', async () => {
  const result = await verifyPreviewIngress(base, {
    fetcher: async () => { throw new TypeError('offline') },
  })
  assert.equal(result.ok, false)
  assert.equal(result.checks.api.errorClass, 'TypeError')
})
