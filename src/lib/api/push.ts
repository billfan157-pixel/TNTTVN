import { request } from './core'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const pushApi = {
  getVapidPublicKey: () =>
    request<{ publicKey: string | null; configured?: boolean }>('GET', '/notifications/vapid-public-key'),

  subscribePush: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request<{ ok: boolean }>('POST', '/notifications/subscribe', sub),

  unsubscribePush: (endpoint: string) =>
    request<{ ok: boolean }>('POST', '/notifications/unsubscribe', { endpoint }),

  registerNativePush: (registration: { installationId: string; platform: 'android' | 'ios'; token: string }) =>
    request<{ ok: boolean }>('POST', '/notifications/native/register', registration),

  unregisterNativePush: (installationId: string) =>
    request<{ ok: boolean }>('POST', '/notifications/native/unregister', { installationId }),
}
