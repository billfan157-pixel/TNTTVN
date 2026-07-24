import { useState, useEffect, useCallback } from 'react'

const PUBLIC_VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(b64)
  return Uint8Array.from([...rawData].map((ch) => ch.charCodeAt(0)))
}

interface PushSubscriptionJSON {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export function useWebPush() {
  const [isSupported, setIsSupported] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [permission, setPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    if (!('serviceWorker' in navigator && 'PushManager' in window)) {
      setIsSupported(false)
      return
    }
    setIsSupported(true)
    setPermission(Notification.permission)

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => setSubscription(sub))
    })
  }, [])

  const subscribe = useCallback(async () => {
    if (!isSupported || !PUBLIC_VAPID_KEY) return null

    const permission = await Notification.requestPermission()
    setPermission(permission)
    if (permission !== 'granted') return null

    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY) as unknown as BufferSource,
    })

    setSubscription(sub)

    const subData: PushSubscriptionJSON = sub.toJSON() as PushSubscriptionJSON
    await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subData),
    })

    return sub
  }, [isSupported])

  const unsubscribe = useCallback(async () => {
    if (!subscription) return
    await subscription.unsubscribe()
    setSubscription(null)

    await fetch('/api/notifications/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
  }, [subscription])

  return { isSupported, subscription, permission, subscribe, unsubscribe }
}
