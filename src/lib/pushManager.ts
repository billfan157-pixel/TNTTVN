import { api } from './api'

const SW_PATH = '/sw.js'
const PUSH_FLAG_KEY = 'push_subscription_active'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function isSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isSupported()) return null
  try {
    // FE-03 (2026-08-16): updateViaCache 'none' — KHÔNG cho browser HTTP-cache file
    // /sw.js; mọi lần check update phải revalidate từ server, tránh SW script cũ
    // bị cache lại khiến build mới không bao giờ được nhận.
    return await navigator.serviceWorker.register(SW_PATH, { updateViaCache: 'none' })
  } catch (err) {
    console.warn('[pushManager] failed to register service worker:', err)
    return null
  }
}

/** Đăng ký service worker sớm (main.tsx) — không hỏi permission, không subscribe. */
export async function registerServiceWorkerOnly(): Promise<void> {
  if (!isSupported()) return
  try {
    await navigator.serviceWorker.register(SW_PATH, { updateViaCache: 'none' })
  } catch (err) {
    console.warn('[pushManager] failed to register service worker:', err)
  }
}

/**
 * Đăng ký web push sau khi đăng nhập (best-effort, không chặn login):
 * - Permission 'default' → hỏi người dùng 1 lần; từ chối thì bỏ qua.
 * - Lấy VAPID public key từ server → PushManager.subscribe → lưu endpoint lên server.
 * - Nếu đã có subscription cũ (cùng endpoint đã lưu) → không đăng ký lại.
 */
export async function initPushSubscription(): Promise<void> {
  if (!isSupported() || Notification.permission === 'denied') return

  try {
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
    }

    const registration = await registerServiceWorker()
    if (!registration) return

    const { publicKey } = await api.getVapidPublicKey()

    const existing = await registration.pushManager.getSubscription()
    if (existing) {
      // Đã subscribe trong trình duyệt này — đồng bộ lên server (idempotent).
      try {
        await api.subscribePush({
          endpoint: existing.endpoint,
          keys: { p256dh: btoa(String.fromCharCode(...new Uint8Array(existing.getKey('p256dh')!))), auth: btoa(String.fromCharCode(...new Uint8Array(existing.getKey('auth')!))) },
        })
        localStorage.setItem(PUSH_FLAG_KEY, '1')
      } catch (err) {
        console.warn('[pushManager] failed to re-sync existing push subscription:', err)
      }
      return
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })

    await api.subscribePush({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
        auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))),
      },
    })
    localStorage.setItem(PUSH_FLAG_KEY, '1')
  } catch (err) {
    console.warn('[pushManager] push subscription failed (skipping):', err)
  }
}

/** Hủy đăng ký khi đăng xuất (best-effort). */
export async function disablePushSubscription(): Promise<void> {
  if (!isSupported()) return
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_PATH)
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      api.unsubscribePush(subscription.endpoint).catch(() => {})
      await subscription.unsubscribe().catch(() => {})
    }
  } catch (err) {
    console.warn('[pushManager] push unsubscribe failed (ignoring):', err)
  }
  try {
    localStorage.removeItem(PUSH_FLAG_KEY)
  } catch {}
}
