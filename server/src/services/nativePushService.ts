import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { nativePushTokens, users } from '../db/schema.js'
import { isFcmConfigured, sendFcmPush } from './fcmPushProvider.js'
import { isApnsConfigured, sendApnsPush } from './apnsPushProvider.js'
import type { AppPushPayload, NativeProviderResult } from './pushTypes.js'

export interface NativePushSendResult {
  configured: boolean
  sent: number
  failed: number
  total: number
  removed: number
  skipped: number
  platforms: { android: boolean; ios: boolean }
  successfulTokens?: string[]
  lastProviderError?: string
  /** Eligible devices left for a later Worker invocation. */
  deferred?: number
}

function safeNativeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  return /^\/(?!\/)[A-Za-z0-9/_?=&.%+-]*$/.test(url) ? url : undefined
}

async function providerResult(
  platform: 'android' | 'ios',
  tokens: string[],
  payload: AppPushPayload,
): Promise<NativeProviderResult> {
  try {
    return platform === 'android'
      ? await sendFcmPush(tokens, payload)
      : await sendApnsPush(tokens, payload)
  } catch (error) {
    console.error(`[nativePushService] ${platform} provider failed:`, error instanceof Error ? error.message : 'unknown error')
    return { sent: 0, failed: tokens.length, deadTokens: [], successfulTokens: [], lastProviderError: `${platform.toUpperCase()}:${error instanceof Error ? error.message : 'unknown'}` }
  }
}

export async function sendNativePush(
  parishId: string,
  payload: AppPushPayload,
  userIds?: string[],
  excludeTokens?: string[],
  maxDeliveries?: number,
): Promise<NativePushSendResult> {
  const platforms = { android: isFcmConfigured(), ios: isApnsConfigured() }
  if (userIds && userIds.length === 0) {
    return { configured: platforms.android || platforms.ios, sent: 0, failed: 0, total: 0, removed: 0, skipped: 0, platforms, successfulTokens: [] }
  }

  const conditions = [eq(nativePushTokens.parishId, parishId)]
  if (userIds) conditions.push(inArray(nativePushTokens.userId, userIds))
  const rows = await db.select({ token: nativePushTokens.token, platform: nativePushTokens.platform })
    .from(nativePushTokens)
    .innerJoin(users, and(
      eq(users.parishId, nativePushTokens.parishId),
      eq(users.id, nativePushTokens.userId),
    ))
    .where(and(...conditions, eq(users.status, 'ACTIVE'), isNull(users.deletedAt)))

  const excluded = new Set(excludeTokens || [])
  const activeRows = rows.filter(row => !excluded.has(row.token))
  const sendableRows = activeRows.filter(row => row.platform === 'android' ? platforms.android : row.platform === 'ios' && platforms.ios)
  const selectedRows = maxDeliveries === undefined ? sendableRows : sendableRows.slice(0, Math.max(0, maxDeliveries))
  const deferred = sendableRows.length - selectedRows.length
  const androidTokens = selectedRows.filter(row => row.platform === 'android').map(row => row.token)
  const iosTokens = selectedRows.filter(row => row.platform === 'ios').map(row => row.token)
  const skipped = activeRows.length - sendableRows.length
  const safePayload = { ...payload, url: safeNativeUrl(payload.url) }
  const [androidResult, iosResult] = await Promise.all([
    platforms.android && androidTokens.length > 0
      ? providerResult('android', androidTokens, safePayload)
      : Promise.resolve<NativeProviderResult>({ sent: 0, failed: 0, deadTokens: [], successfulTokens: [] }),
    platforms.ios && iosTokens.length > 0
      ? providerResult('ios', iosTokens, safePayload)
      : Promise.resolve<NativeProviderResult>({ sent: 0, failed: 0, deadTokens: [], successfulTokens: [] }),
  ])
  const deadTokens = [...androidResult.deadTokens, ...iosResult.deadTokens]
  if (deadTokens.length > 0) {
    await db.delete(nativePushTokens).where(and(
      eq(nativePushTokens.parishId, parishId),
      inArray(nativePushTokens.token, deadTokens),
    ))
  }

  const successfulTokens = [...(androidResult.successfulTokens || []), ...(iosResult.successfulTokens || [])]
  const lastProviderError = androidResult.lastProviderError || iosResult.lastProviderError

  return {
    configured: platforms.android || platforms.ios,
    sent: androidResult.sent + iosResult.sent,
    failed: androidResult.failed + iosResult.failed,
    total: rows.length,
    removed: deadTokens.length,
    skipped,
    platforms,
    successfulTokens,
    lastProviderError,
    ...(maxDeliveries === undefined ? {} : { deferred }),
  }
}

export function sendNativePushToParish(parishId: string, payload: AppPushPayload, excludeTokens?: string[]) {
  return sendNativePush(parishId, payload, undefined, excludeTokens)
}

export function sendNativePushToUsers(parishId: string, userIds: string[], payload: AppPushPayload, excludeTokens?: string[], maxDeliveries?: number) {
  return sendNativePush(parishId, payload, userIds, excludeTokens, maxDeliveries)
}
