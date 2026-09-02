import { sendWebPushToParish, sendWebPushToUsers } from './webPushService.js'
import { sendNativePushToParish, sendNativePushToUsers } from './nativePushService.js'
import type { AppPushPayload } from './pushTypes.js'

export async function sendAppPushToParish(parishId: string, payload: AppPushPayload) {
  const [web, native] = await Promise.all([
    sendWebPushToParish(parishId, payload),
    sendNativePushToParish(parishId, payload),
  ])
  return {
    configured: web.configured || native.configured,
    sent: web.sent + native.sent,
    failed: web.failed + native.failed,
    total: web.total + native.total,
    removed: web.removed + native.removed,
    skipped: native.skipped,
    channels: { web, native },
  }
}

export async function sendAppPushToUsers(parishId: string, userIds: string[], payload: AppPushPayload) {
  const [web, native] = await Promise.all([
    sendWebPushToUsers(parishId, userIds, payload),
    sendNativePushToUsers(parishId, userIds, payload),
  ])
  return {
    configured: web.configured || native.configured,
    sent: web.sent + native.sent,
    failed: web.failed + native.failed,
    total: web.total + native.total,
    removed: web.removed + native.removed,
    skipped: native.skipped,
    channels: { web, native },
  }
}
