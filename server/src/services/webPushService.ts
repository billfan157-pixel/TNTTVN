import webPush from 'web-push'
import { db } from '../db/index.js'
import { pushSubscriptions, users } from '../db/schema.js'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { isCloudflareWorkerRuntime } from '../utils/cloudflareRuntime.js'

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
  successfulEndpoints?: string[]
  lastProviderError?: string
  /** Eligible endpoints left for a later Worker invocation. */
  deferred?: number
}

/** Preserve web-push payload encryption/VAPID while using Workers' fetch transport. */
export async function sendWebPushRequest(subscription: webPush.PushSubscription, payload: string): Promise<void> {
  if (!isCloudflareWorkerRuntime()) {
    await webPush.sendNotification(subscription, payload)
    return
  }
  const details = webPush.generateRequestDetails(subscription, payload)
  const headers = new Headers(details.headers)
  headers.delete('content-length') // fetch supplies the encrypted body's actual length.
  const response = await fetch(details.endpoint, {
    method: 'POST', headers, body: details.body ? new Uint8Array(details.body) : undefined,
    redirect: 'manual', signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    throw Object.assign(new Error(`Web Push service rejected (${response.status})`), { statusCode: response.status })
  }
}

/**
 * Lõi gửi web push (SSOT — dùng chung cho sendWebPushToParish/sendWebPushToUsers).
 * - `userIds` được cung cấp → chỉ gửi tới subscriptions của những userId đó
 *   (push có chủ đích, ví dụ: phụ huynh của một chi đoàn). Ngược lại gửi
 *   toàn bộ subscriptions của giáo xứ.
 * - Subscription chết (HTTP 404/410 = trình duyệt đã hủy/endpoint không còn
 *   tồn tại) bị xóa khỏi DB để không gửi mãi.
 */
async function sendWebPush(
  parishId: string,
  payload: WebPushPayload,
  userIds?: string[],
  excludeEndpoints?: string[],
  maxDeliveries?: number,
): Promise<WebPushSendResult> {
  const notConfigured: WebPushSendResult = { configured: false, sent: 0, failed: 0, total: 0, removed: 0, successfulEndpoints: [] }
  if (!ensureVapidDetails()) return notConfigured
  if (userIds && userIds.length === 0) return { configured: true, sent: 0, failed: 0, total: 0, removed: 0, successfulEndpoints: [] }

  let conditions = [eq(pushSubscriptions.parishId, parishId)]
  if (userIds) {
    conditions.push(inArray(pushSubscriptions.userId, userIds))
  }
  const allSubs = await db.select({
    endpoint: pushSubscriptions.endpoint,
    p256dh: pushSubscriptions.p256dh,
    auth: pushSubscriptions.auth,
  }).from(pushSubscriptions).innerJoin(users, and(
    eq(users.parishId, pushSubscriptions.parishId),
    eq(users.id, pushSubscriptions.userId),
  )).where(and(
    ...conditions,
    eq(users.status, 'ACTIVE'),
    isNull(users.deletedAt),
  ))

  const excluded = new Set(excludeEndpoints || [])
  const eligibleSubs = allSubs.filter(sub => !excluded.has(sub.endpoint))
  const subs = maxDeliveries === undefined ? eligibleSubs : eligibleSubs.slice(0, Math.max(0, maxDeliveries))
  const deferred = eligibleSubs.length - subs.length
  if (subs.length === 0) return { configured: true, sent: 0, failed: 0, total: allSubs.length, removed: 0, successfulEndpoints: [],
    ...(maxDeliveries === undefined ? {} : { deferred }) }

  const results: PromiseSettledResult<void>[] = []
  const batchSize = isCloudflareWorkerRuntime() ? 4 : subs.length
  for (let offset = 0; offset < subs.length; offset += batchSize) {
    results.push(...await Promise.allSettled(subs.slice(offset, offset + batchSize).map((sub) =>
      sendWebPushRequest(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } as webPush.PushSubscription,
        JSON.stringify({ title: payload.title, body: payload.body, url: payload.url || '/' }),
      ),
    )))
  }

  let sent = 0
  let failed = 0
  const deadEndpoints: string[] = []
  const successfulEndpoints: string[] = []
  let lastProviderError: string | undefined

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      sent++
      successfulEndpoints.push(subs[i].endpoint)
      return
    }
    failed++
    const err = r.reason as { statusCode?: number; message?: string } | undefined
    const statusCode = err?.statusCode || 0
    if (statusCode === 404 || statusCode === 410) {
      deadEndpoints.push(subs[i].endpoint)
    }
    lastProviderError = `WEBPUSH:${statusCode || 'ERR'}:${err?.message || 'FAILED'}`
    console.warn(`[webPushService] delivery rejected (${statusCode}):`, {
      message: err?.message || 'unknown error',
      endpointPrefix: `${subs[i].endpoint.slice(0, 20)}...`,
    })
  })

  if (deadEndpoints.length > 0) {
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.parishId, parishId), inArray(pushSubscriptions.endpoint, deadEndpoints)))
  }

  const returnResult: WebPushSendResult = {
    configured: true,
    sent,
    failed,
    total: allSubs.length,
    removed: deadEndpoints.length,
    successfulEndpoints,
    ...(maxDeliveries === undefined ? {} : { deferred }),
  }
  if (lastProviderError) {
    returnResult.lastProviderError = lastProviderError
  }
  return returnResult
}

export async function sendWebPushToParish(parishId: string, payload: WebPushPayload, excludeEndpoints?: string[]): Promise<WebPushSendResult> {
  return sendWebPush(parishId, payload, undefined, excludeEndpoints)
}

/**
 * Gửi web push CHỈ tới subscriptions của các userId cụ thể (push có chủ đích,
 * ví dụ: phụ huynh trong một chi đoàn). Subscription không thuộc danh sách
 * userId (kể cả `userId = null` — sub cũ chưa gắn tài khoản) không bị đụng tới.
 */
export async function sendWebPushToUsers(parishId: string, userIds: string[], payload: WebPushPayload, excludeEndpoints?: string[], maxDeliveries?: number): Promise<WebPushSendResult> {
  return sendWebPush(parishId, payload, userIds, excludeEndpoints, maxDeliveries)
}
