import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apns = vi.hoisted(() => ({
  status: 200,
  responseBody: '{}',
  sentBody: '',
  requestHeaders: {} as Record<string, unknown>,
  sign: vi.fn(() => 'signed-provider-jwt'),
}))

vi.mock('jsonwebtoken', () => ({ default: { sign: apns.sign } }))

vi.mock('node:http2', () => ({
  connect: vi.fn(() => ({
    on: vi.fn(),
    close: vi.fn(),
    request: vi.fn((headers: Record<string, unknown>) => {
      apns.requestHeaders = headers
      const listeners = new Map<string, (...args: any[]) => void>()
      return {
        setEncoding: vi.fn(),
        on: vi.fn((event: string, listener: (...args: any[]) => void) => {
          listeners.set(event, listener)
        }),
        end: vi.fn((body: string) => {
          apns.sentBody = body
          listeners.get('response')?.({ ':status': apns.status })
          if (apns.responseBody) listeners.get('data')?.(apns.responseBody)
          listeners.get('end')?.()
        }),
      }
    }),
  })),
}))

describe('apnsPushProvider', () => {
  beforeEach(() => {
    process.env.APNS_KEY_ID = 'KEY123'
    process.env.APNS_TEAM_ID = 'TEAM123'
    process.env.APNS_PRIVATE_KEY = 'PRIVATE_KEY'
    process.env.APNS_BUNDLE_ID = 'com.tnttvn.app'
    process.env.APNS_ENVIRONMENT = 'development'
    apns.status = 200
    apns.responseBody = '{}'
    apns.sentBody = ''
    apns.sign.mockClear()
  })

  afterEach(() => {
    for (const key of ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_PRIVATE_KEY', 'APNS_BUNDLE_ID', 'APNS_ENVIRONMENT']) delete process.env[key]
  })

  it('sends an alert payload with APNs topic/push-type headers', async () => {
    const { sendApnsPush } = await import('../../services/apnsPushProvider.js')
    const result = await sendApnsPush(['ios-token'], { title: 'Catevia', body: 'Có thông báo', url: '/notices' })

    expect(apns.requestHeaders).toMatchObject({
      ':method': 'POST',
      ':path': '/3/device/ios-token',
      'apns-topic': 'com.tnttvn.app',
      'apns-push-type': 'alert',
      authorization: 'bearer signed-provider-jwt',
    })
    expect(JSON.parse(apns.sentBody)).toMatchObject({ aps: { alert: { title: 'Catevia', body: 'Có thông báo' } }, url: '/notices' })
    expect(result).toEqual({ sent: 1, failed: 0, deadTokens: [], successfulTokens: ['ios-token'], lastProviderError: undefined })
  })

  it('marks APNs Unregistered responses as dead tokens', async () => {
    apns.status = 410
    apns.responseBody = JSON.stringify({ reason: 'Unregistered' })
    const { sendApnsPush } = await import('../../services/apnsPushProvider.js')
    await expect(sendApnsPush(['dead-ios-token'], { title: 'T', body: 'B' })).resolves.toEqual({
      sent: 0,
      failed: 1,
      deadTokens: ['dead-ios-token'],
      successfulTokens: [],
      lastProviderError: 'APNS:410:Unregistered',
    })
  })
})
