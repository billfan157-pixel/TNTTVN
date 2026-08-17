import webPush from 'web-push'
import { db } from '../db/index.js'
import { pushSubscriptions } from '../db/schema.js'
import { and, eq, inArray } from 'drizzle-orm'

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@giaoly.com'

let vapidInitialized = false

/** Đọc env lazily (test được phép set env sau khi import module). */
function ensureVapidDetails(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY || ''
  const privateKey = process.env.VAPID_PRIVATE_KEY || ''
  if (!publicKey || !privateKey) return false
  if (!vapidInitialized) {
    webPush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey)
    vapidInitialized = true
  }
  return true
}

export function isVapidConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || ''
}

export interface WebPushPayload {
  title: string
  body: string
  url?: string
}

export interface WebPushSendResult {
  configured: boolean
  sent: number
  failed: number
  total: number
  /** Số subscription đã xóa vĩnh viễn (endpoint 404/410 — trình duyệt đã hủy). */
  removed: number
}

/**
 * Lõi gửi web push (SSOT — dùng chung cho sendWebPushToParish/sendWebPushToUsers).
 * - `userIds` được cung cấp → chỉ gửi tới subscriptions của những userId đó
 *   (push có chủ đích, ví dụ: phụ huynh của một chi đoàn). Ngược lại gửi
 *   toàn bộ subscriptions của giáo xứ.
 * - Subscription chết (HTTP 404/410 = trình duyệt đã hủy/endpoint không còn
 *   tồn tại) bị xóa khỏi DB để không gửi mãi.
 */
async function sendWebPush(parishId: string, payload: WebPushPayload, userIds?: string[]): Promise<WebPushSendResult> {
  const notConfigured: WebPushSendResult = { configured: false, sent: 0, failed: 0, total: 0, removed: 0 }
  if (!ensureVapidDetails()) return notConfigured
  if (userIds && userIds.length === 0) return { configured: true, sent: 0, failed: 0, total: 0, removed: 0 }

  let conditions = [eq(pushSubscriptions.parishId, parishId)]
  if (userIds) {
    conditions.push(inArray(pushSubscriptions.userId, userIds))
  }
  const subs = await db.select().from(pushSubscriptions).where(and(...conditions))
  if (subs.length === 0) return { configured: true, sent: 0, failed: 0, total: 0, removed: 0 }

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } as webPush.PushSubscription,
        JSON.stringify({ title: payload.title, body: payload.body, url: payload.url || '/' }),
      ),
    ),
  )

  let sent = 0
  let failed = 0
  const deadEndpoints: string[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      sent++
      return
    }
    failed++
    const err = r.reason as { statusCode?: number } | undefined
    if (err && (err.statusCode === 404 || err.statusCode === 410)) {
      deadEndpoints.push(subs[i].endpoint)
    }
  })

  if (deadEndpoints.length > 0) {
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.parishId, parishId), inArray(pushSubscriptions.endpoint, deadEndpoints)))
  }

  return { configured: true, sent, failed, total: subs.length, removed: deadEndpoints.length }
}

/** Gửi web push tới TOÀN BỘ subscription của một giáo xứ. */
export async function sendWebPushToParish(parishId: string, payload: WebPushPayload): Promise<WebPushSendResult> {
  return sendWebPush(parishId, payload)
}

/**
 * Gửi web push CHỈ tới subscriptions của các userId cụ thể (push có chủ đích,
 * ví dụ: phụ huynh trong một chi đoàn). Subscription không thuộc danh sách
 * userId (kể cả `userId = null` — sub cũ chưa gắn tài khoản) không bị đụng tới.
 */
export async function sendWebPushToUsers(parishId: string, userIds: string[], payload: WebPushPayload): Promise<WebPushSendResult> {
  return sendWebPush(parishId, payload, userIds)
}
