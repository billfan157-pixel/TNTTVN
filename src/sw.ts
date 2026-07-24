/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope
declare const __WB_MANIFEST: Array<{ url: string; revision: string | null }>

precacheAndRoute(self.__WB_MANIFEST)

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
