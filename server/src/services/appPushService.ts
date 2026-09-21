import { sendWebPushToParish, sendWebPushToUsers } from './webPushService.js'
import { sendNativePushToParish, sendNativePushToUsers } from './nativePushService.js'
import type { AppPushPayload } from './pushTypes.js'

export async function sendAppPushToParish(parishId: string, payload: AppPushPayload, excludeEndpoints?: string[]) {
  const [web, native] = await Promise.all([
    sendWebPushToParish(parishId, payload, excludeEndpoints),
    sendNativePushToParish(parishId, payload, excludeEndpoints),
  ])
  const deliveredEndpoints = [
    ...(web.successfulEndpoints || []),
    ...(native.successfulTokens || []),
  ]
  const lastProviderError = native.lastProviderError || web.lastProviderError

  return {
    configured: web.configured || native.configured,
    sent: web.sent + native.sent,
    failed: web.failed + native.failed,
    total: web.total + native.total,
    removed: web.removed + native.removed,
    skipped: native.skipped,
    channels: { web, native },
    deliveredEndpoints,
    lastProviderError,
  }
}

export async function sendAppPushToUsers(parishId: string, userIds: string[], payload: AppPushPayload, excludeEndpoints?: string[]) {
  const [web, native] = await Promise.all([
    sendWebPushToUsers(parishId, userIds, payload, excludeEndpoints),
    sendNativePushToUsers(parishId, userIds, payload, excludeEndpoints),
  ])
  const deliveredEndpoints = [
    ...(web.successfulEndpoints || []),
    ...(native.successfulTokens || []),
  ]
  const lastProviderError = native.lastProviderError || web.lastProviderError

  return {
    configured: web.configured || native.configured,
    sent: web.sent + native.sent,
    failed: web.failed + native.failed,
    total: web.total + native.total,
    removed: web.removed + native.removed,
    skipped: native.skipped,
    channels: { web, native },
    deliveredEndpoints,
    lastProviderError,
  }
}
