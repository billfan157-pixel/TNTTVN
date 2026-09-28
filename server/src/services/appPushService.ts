import { sendWebPushToParish, sendWebPushToUsers } from './webPushService.js'
import { sendNativePushToParish, sendNativePushToUsers } from './nativePushService.js'
import type { AppPushPayload } from './pushTypes.js'
import { isCloudflareWorkerRuntime } from '../utils/cloudflareRuntime.js'

// One scheduled invocation also spends subrequests on Turso and FCM OAuth.
// Keep provider fetches well below the Workers Free 50-subrequest ceiling.
export const WORKER_PUSH_DELIVERIES_PER_CYCLE = 12

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
  if (isCloudflareWorkerRuntime()) {
    const web = await sendWebPushToUsers(parishId, userIds, payload, excludeEndpoints, WORKER_PUSH_DELIVERIES_PER_CYCLE)
    const remaining = Math.max(0, WORKER_PUSH_DELIVERIES_PER_CYCLE - web.sent - web.failed)
    const native = await sendNativePushToUsers(parishId, userIds, payload, excludeEndpoints, remaining)
    return {
      configured: web.configured || native.configured,
      sent: web.sent + native.sent,
      failed: web.failed + native.failed,
      total: web.total + native.total,
      removed: web.removed + native.removed,
      skipped: native.skipped,
      channels: { web, native },
      deliveredEndpoints: [...(web.successfulEndpoints || []), ...(native.successfulTokens || [])],
      lastProviderError: native.lastProviderError || web.lastProviderError,
      deferred: (web.deferred || 0) + (native.deferred || 0),
    }
  }
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
