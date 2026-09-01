import { Capacitor } from '@capacitor/core'
import { api } from './api'

const SW_PATH = '/sw.js'
const PUSH_FLAG_KEY = 'push_subscription_active'
const PWA_CACHE_NAMES = new Set([
  'api-cache',
  'pages-cache',
  'google-fonts-cache',
  'static-resources',
])

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

function hasServiceWorkerSupport(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

function isSupported(): boolean {
  return !Capacitor.isNativePlatform()
    && hasServiceWorkerSupport()
    && 'PushManager' in window
    && 'Notification' in window
}

function isPwaOwnedCache(cacheName: string): boolean {
  return PWA_CACHE_NAMES.has(cacheName) || cacheName.startsWith('workbox-precache')
}

/**
 * Capacitor ships the web bundle inside the app, so a PWA service worker is
 * redundant there. More importantly, the web worker's activate handler
 * intentionally navigates every authenticated web client to the new build.
 * In Android WebView that navigation looked like a random full-app reload.
 *
 * Remove registrations left by older APK/IPA builds and only delete caches
 * owned by the PWA shell. IndexedDB/Dexie auth snapshots and the offline sync
 * queue are separate storage and are deliberately preserved.
 */
async function removeNativePwaArtifacts(): Promise<void> {
  if (!hasServiceWorkerSupport()) return

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.allSettled(registrations.map(registration => registration.unregister()))
  } catch (err) {
    console.warn('[pushManager] failed to unregister native service workers:', err)
  }

  if (typeof caches === 'undefined') return
  try {
    const cacheNames = await caches.keys()
    await Promise.allSettled(
      cacheNames
        .filter(isPwaOwnedCache)
        .map(cacheName => caches.delete(cacheName)),
    )
  } catch (err) {
    console.warn('[pushManager] failed to clear native PWA caches:', err)
  }
}

async function clearDevServiceWorkers(): Promise<void> {
  if (!hasServiceWorkerSupport()) return
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.allSettled(registrations.map(r => r.unregister()))
  } catch (err) {
    console.warn('[pushManager] failed to clear dev service workers:', err)
  }
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (import.meta.env.DEV && import.meta.env.MODE === 'development') {
    await clearDevServiceWorkers()
    return null
  }
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
  if (Capacitor.isNativePlatform()) {
    await removeNativePwaArtifacts()
    return
  }
  if (import.meta.env.DEV && import.meta.env.MODE === 'development') {
    await clearDevServiceWorkers()
    return
  }
  if (!hasServiceWorkerSupport()) return
  try {
    await navigator.serviceWorker.register(SW_PATH, { updateViaCache: 'none' })
  } catch (err) {
    console.warn('[pushManager] failed to register service worker:', err)
  }
}

let pushInitPromise: Promise<void> | null = null

/**
 * Đăng ký web push sau khi đăng nhập (best-effort, không chặn login):
 * - Permission 'default' → hỏi người dùng 1 lần; từ chối thì bỏ qua.
 * - Lấy VAPID public key từ server → PushManager.subscribe → lưu endpoint lên server.
 * - Nếu đã có subscription cũ (cùng endpoint đã lưu) → không đăng ký lại.
 * - 501 VAPID_NOT_CONFIGURED là trạng thái ops chưa cấu hình — fail-closed đúng thiết kế, KHÔNG spam console (chỉ debug).
 * - Dedup concurrent calls (login + loadFromStorage race) bằng singleton promise.
 */
export async function initPushSubscription(): Promise<void> {
  if (pushInitPromise) return pushInitPromise
  pushInitPromise = (async () => {
    if (!isSupported() || Notification.permission === 'denied') return

    try {
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return
      }

      const registration = await registerServiceWorker()
      if (!registration) return

      let publicKey: string | null = null
      try {
        const res: any = await api.getVapidPublicKey()
        // Server mới trả { publicKey: null, configured:false } với 200 khi chưa cấu hình (tránh 501 spam).
        // Giữ tương thích 501 legacy cho deploy cũ chưa redeploy.
        if (res && res.configured === false) {
          console.debug('[pushManager] VAPID not configured — skipping push subscription')
          return
        }
        publicKey = res?.publicKey ?? null
        if (!publicKey) {
          console.debug('[pushManager] VAPID not configured — skipping push subscription')
          return
        }
      } catch (err: any) {
        // 501 legacy = VAPID chưa cấu hình — expected khi deploy chưa set env, không phải lỗi app
        if (err?.status === 501 || String(err?.message || '').includes('VAPID')) {
          console.debug('[pushManager] VAPID not configured — skipping push subscription')
          return
        }
        throw err
      }

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
    } catch (err: any) {
      if (err?.status === 501 || String(err?.message || '').includes('VAPID')) {
        console.debug('[pushManager] VAPID not configured — skipping', err)
        return
      }
      console.warn('[pushManager] push subscription failed (skipping):', err)
    }
  })()
  try { await pushInitPromise } finally { pushInitPromise = null }
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
