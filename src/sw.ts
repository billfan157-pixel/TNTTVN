import React from 'react'
/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope
declare const __WB_MANIFEST: Array<{ url: string; revision: string | null }>

precacheAndRoute(self.__WB_MANIFEST)

// FE-02 (2026-08-14): Dữ liệu nghiệp vụ offline được lưu trữ an toàn qua IndexedDB/Dexie
// mã hóa AES-256 (useSyncEngine). Service Worker KHÔNG cache runtime API endpoints
// để đảm bảo tính cô lập người dùng/giáo xứ (User & Tenant Isolation).
// FE-03 (2026-08-16): Stale-build killer — skipWaiting + clientsClaim + reload tất cả
// tab đang mở khi có build mới. Trước đây build mới deploy nhưng tab cũ (mở nhiều
// ngày) vẫn chạy JS cũ → dashboard "0 thiếu nhi" (A-NEW-47 fix chưa hiệu lực) và
// sync queue kẹt (op cũ không bao giờ bị xóa sau save → audit log spam mỗi 60s).
self.skipWaiting()
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await caches.delete('api-cache')
    await self.clients.claim()
    // Ép mọi tab/window đang mở reload sang build mới ngay lập tức (trừ trang login).
    // Reload này là cần thiết để giết build cũ trong tab treo lâu ngày; SW chỉ activate
    // khi có SW mới (byte-diff) nên không xảy ra reload vô nghĩa.
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      if (client.url && !client.url.includes('/login')) {
        client.navigate(client.url).catch(() => {})
      }
    }
  })())
})

// Navigation: online → luôn lấy index.html MỚI nhất từ server (NetworkFirst); offline
// → fallback bản precache gần nhất. Đảm bảo sau reload user luôn chạy shell mới nhất.
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'pages-cache',
      plugins: [
        { cacheableResponse: { statuses: [0, 200] } },
        { expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 } },
      ],
    }),
    { denylist: [/^\/api\//, /\/sw\.js$/] }
  )
)

registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      { cacheableResponse: { statuses: [0, 200] } },
      { expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
    ],
  })
)

// Cache static assets and images with StaleWhileRevalidate
registerRoute(
  ({ request }) => request.destination === 'image' || request.destination === 'style' || request.destination === 'script',
  new StaleWhileRevalidate({
    cacheName: 'static-resources',
    plugins: [
      { cacheableResponse: { statuses: [0, 200] } },
      { expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 } },
    ],
  })
)

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? { title: 'Giáo Lý TNTT', body: 'Có thông báo mới' }

  const options: NotificationOptions = {
    body: data.body,
    icon: '/pwa-icon.svg',
    badge: '/favicon.svg',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
  }

  event.waitUntil(self.registration.showNotification(data.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && 'focus' in client) {
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
