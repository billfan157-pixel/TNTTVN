const DEFAULT_TARGET = 'https://tnttvn.onrender.com'
const WORKER_HOST = 'catevia-api.billfan157.workers.dev'
const PROXY_SECRET_HEADER = 'x-catevia-proxy-secret'
const CLIENT_IP_HEADER = 'x-catevia-client-ip'
const CLIENT_IP_PATTERN = /^[0-9a-f:.]{2,45}$/i
const DROPPED_HEADERS = [
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'te',
  'trailer',
  PROXY_SECRET_HEADER,
  CLIENT_IP_HEADER,
  'x-forwarded-for',
  'x-real-ip',
  'x-vercel-forwarded-for',
]

function readClientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const candidate = forwarded || request.headers.get('x-real-ip')?.trim()
  return candidate && CLIENT_IP_PATTERN.test(candidate) ? candidate : null
}

function readTargetOrigin(): URL | null {
  try {
    const target = new URL(process.env.CATEVIA_PROXY_TARGET || DEFAULT_TARGET)
    if (target.protocol !== 'https:' || target.username || target.password) return null
    return target
  } catch {
    return null
  }
}

export default async function proxy(request: Request): Promise<Response> {
  const target = readTargetOrigin()
  const clientIp = readClientIp(request)
  if (!target || !clientIp) return new Response('Backend proxy not configured', { status: 503 })

  const targetUrl = new URL(request.url)
  targetUrl.protocol = target.protocol
  targetUrl.host = target.host

  const headers = new Headers(request.headers)
  for (const name of DROPPED_HEADERS) headers.delete(name)

  if (target.hostname === WORKER_HOST) {
    const secret = process.env.CATEVIA_PROXY_SHARED_SECRET
    if (typeof secret !== 'string' || secret.length < 32) {
      return new Response('Backend proxy not configured', { status: 503 })
    }
    headers.set(PROXY_SECRET_HEADER, secret)
    headers.set(CLIENT_IP_HEADER, clientIp)
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  try {
    return await fetch(targetUrl, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
      signal: request.signal,
    })
  } catch {
    return new Response('Backend unavailable', { status: 502 })
  }
}
