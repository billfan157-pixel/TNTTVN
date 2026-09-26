import { timingSafeEqual } from 'node:crypto'

const PROXY_SECRET_HEADER = 'x-catevia-proxy-secret'
const CLIENT_IP_HEADER = 'x-catevia-client-ip'
const CLIENT_IP_PATTERN = /^[0-9a-f:.]{2,45}$/i
const PROXY_IDENTITY_HEADERS = [
  'x-catevia-canary-token',
  PROXY_SECRET_HEADER,
  CLIENT_IP_HEADER,
  'x-forwarded-for',
  'x-real-ip',
  'x-vercel-forwarded-for',
]

function matchesSecret(presented, expected) {
  if (typeof expected !== 'string' || expected.length < 32 || typeof presented !== 'string') return false
  const actualBytes = Buffer.from(presented)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

function normalizeClientIp(value) {
  const candidate = value?.trim()
  return candidate && CLIENT_IP_PATTERN.test(candidate) ? candidate : null
}

function sanitizedRequest(request, clientIp) {
  const headers = new Headers(request.headers)
  const hasIdentityHeaders = PROXY_IDENTITY_HEADERS.some((name) => headers.has(name))
  for (const name of PROXY_IDENTITY_HEADERS) headers.delete(name)
  if (clientIp) headers.set(CLIENT_IP_HEADER, clientIp)
  return !hasIdentityHeaders && !clientIp ? request : new Request(request, { headers })
}

function isOpsHealth(request, env) {
  return request.method === 'GET' && new URL(request.url).pathname === '/health'
    && matchesSecret(request.headers.get('authorization')?.replace(/^Bearer /, ''), env.OPS_TOKEN)
}

export function gateWorkerRequest(request, env) {
  const pinnedRelease = /^[a-f0-9]{40}$/.test(env.APP_RELEASE_ID || '')
  if (env.CATEVIA_TRAFFIC_ENABLED === 'yes') {
    if (!pinnedRelease) return { response: new Response('Backend release not pinned', { status: 503 }) }
    if (isOpsHealth(request, env)
      || matchesSecret(request.headers.get('x-catevia-canary-token'), env.OPS_TOKEN)) {
      return { request: sanitizedRequest(request) }
    }
    if (!matchesSecret(request.headers.get(PROXY_SECRET_HEADER), env.CATEVIA_PROXY_SHARED_SECRET)) {
      return { response: new Response('Backend proxy authentication required', { status: 503 }) }
    }
    const clientIp = normalizeClientIp(request.headers.get(CLIENT_IP_HEADER))
    if (!clientIp) {
      return { response: new Response('Backend proxy client identity missing', { status: 503 }) }
    }
    return { request: sanitizedRequest(request, clientIp) }
  }

  if (isOpsHealth(request, env)) return { request: sanitizedRequest(request) }

  const canary = matchesSecret(request.headers.get('x-catevia-canary-token'), env.OPS_TOKEN)
  if (!canary) return { response: new Response('Backend cutover pending', { status: 503 }) }
  if (!pinnedRelease) return { response: new Response('Backend release not pinned', { status: 503 }) }

  return { request: sanitizedRequest(request) }
}
