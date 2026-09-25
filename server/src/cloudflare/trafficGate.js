import { timingSafeEqual } from 'node:crypto'

function matchesOpsToken(presented, expected) {
  if (typeof expected !== 'string' || expected.length < 32 || typeof presented !== 'string') return false
  const actualBytes = Buffer.from(presented)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

export function gateWorkerRequest(request, env) {
  const pinnedRelease = /^[a-f0-9]{40}$/.test(env.APP_RELEASE_ID || '')
  if (env.CATEVIA_TRAFFIC_ENABLED === 'yes') {
    return pinnedRelease
      ? { request }
      : { response: new Response('Backend release not pinned', { status: 503 }) }
  }

  const isOpsHealth = request.method === 'GET' && new URL(request.url).pathname === '/health'
    && matchesOpsToken(request.headers.get('authorization')?.replace(/^Bearer /, ''), env.OPS_TOKEN)
  if (isOpsHealth) return { request }

  const canary = matchesOpsToken(request.headers.get('x-catevia-canary-token'), env.OPS_TOKEN)
  if (!canary) return { response: new Response('Backend cutover pending', { status: 503 }) }
  if (!pinnedRelease) return { response: new Response('Backend release not pinned', { status: 503 }) }

  const headers = new Headers(request.headers)
  headers.delete('x-catevia-canary-token')
  return { request: new Request(request, { headers }) }
}
