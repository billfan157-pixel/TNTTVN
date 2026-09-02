import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fcm = vi.hoisted(() => ({ sign: vi.fn(() => 'signed-service-account-jwt'), fetch: vi.fn() }))
vi.mock('jsonwebtoken', () => ({ default: { sign: fcm.sign } }))

describe('fcmPushProvider HTTP v1', () => {
  beforeEach(() => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'push@catevia-test.iam.gserviceaccount.com',
      private_key: 'PRIVATE_KEY',
      project_id: 'catevia-test',
      token_uri: 'https://oauth.example/token',
    })
    fcm.fetch.mockReset()
    vi.stubGlobal('fetch', fcm.fetch)
  })

  afterEach(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    vi.unstubAllGlobals()
  })

  it('uses OAuth assertion and removes only provider-confirmed dead tokens', async () => {
    fcm.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'ACCESS_TOKEN', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'message/1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] },
      }), { status: 404 }))

    const { sendFcmPush } = await import('../../services/fcmPushProvider.js')
    const result = await sendFcmPush(['alive-token', 'dead-token'], { title: 'T', body: 'B', url: '/notices' })

    expect(fcm.fetch).toHaveBeenNthCalledWith(1, 'https://oauth.example/token', expect.objectContaining({ method: 'POST', body: expect.any(URLSearchParams) }))
    expect(fcm.fetch).toHaveBeenNthCalledWith(2, 'https://fcm.googleapis.com/v1/projects/catevia-test/messages:send', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer ACCESS_TOKEN' }),
    }))
    const message = JSON.parse(fcm.fetch.mock.calls[1][1].body)
    expect(message.message).toMatchObject({
      token: 'alive-token',
      data: { url: '/notices' },
      android: { priority: 'HIGH', notification: { channel_id: 'catevia_general', visibility: 'PRIVATE' } },
    })
    expect(result).toEqual({ sent: 1, failed: 1, deadTokens: ['dead-token'] })
  })

  it('fails clearly when service-account JSON is malformed', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{bad-json'
    const { sendFcmPush } = await import('../../services/fcmPushProvider.js')
    await expect(sendFcmPush(['token'], { title: 'T', body: 'B' })).rejects.toThrow(/không phải JSON hợp lệ/)
    expect(fcm.fetch).not.toHaveBeenCalled()
  })
})
