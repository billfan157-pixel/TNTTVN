import { createECDH, randomBytes } from 'node:crypto'
import webPush from 'web-push'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendWebPushRequest } from '../services/webPushService.js'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function syntheticSubscription(): webPush.PushSubscription {
  const vapid = webPush.generateVAPIDKeys()
  webPush.setVapidDetails('mailto:probe@example.org', vapid.publicKey, vapid.privateKey)
  const recipient = createECDH('prime256v1')
  recipient.generateKeys()
  return {
    endpoint: 'https://example.org/push/synthetic',
    keys: { p256dh: recipient.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  }
}

describe('Web Push Worker transport', () => {
  it('sends VAPID-authenticated ciphertext via fetch and classifies a dead subscription', async () => {
    vi.stubEnv('CATEVIA_RUNTIME', 'cloudflare-worker')
    vi.stubGlobal('WebSocketPair', class WebSocketPair {})
    const subscription = syntheticSubscription()
    const requests: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, init })
      return new Response(null, { status: requests.length === 1 ? 201 : 410 })
    }))

    await sendWebPushRequest(subscription, 'Synthetic only')
    await expect(sendWebPushRequest(subscription, 'Synthetic only')).rejects.toMatchObject({ statusCode: 410 })
    expect(requests).toHaveLength(2)
    expect(requests[0].url).toBe(subscription.endpoint)
    expect(requests[0].init.method).toBe('POST')
    expect(requests[0].init.redirect).toBe('manual')
    const headers = requests[0].init.headers as Headers
    expect(headers.get('authorization')).toMatch(/^vapid /i)
    expect(headers.get('content-encoding')).toBe('aes128gcm')
    expect(headers.has('content-length')).toBe(false)
    const body = requests[0].init.body as Uint8Array
    expect(body.byteLength).toBeGreaterThan('Synthetic only'.length)
    expect(Buffer.from(body).includes(Buffer.from('Synthetic only'))).toBe(false)
  })
})
