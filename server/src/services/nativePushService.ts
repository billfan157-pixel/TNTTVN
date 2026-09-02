import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { nativePushTokens } from '../db/schema.js'
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
    return { sent: 0, failed: tokens.length, deadTokens: [] }
  }
}

export async function sendNativePush(
  parishId: string,
  payload: AppPushPayload,
  userIds?: string[],
): Promise<NativePushSendResult> {
  const platforms = { android: isFcmConfigured(), ios: isApnsConfigured() }
  if (userIds && userIds.length === 0) {
    return { configured: platforms.android || platforms.ios, sent: 0, failed: 0, total: 0, removed: 0, skipped: 0, platforms }
  }

  const conditions = [eq(nativePushTokens.parishId, parishId)]
  if (userIds) conditions.push(inArray(nativePushTokens.userId, userIds))
  const rows = await db.select({ token: nativePushTokens.token, platform: nativePushTokens.platform })
    .from(nativePushTokens)
    .where(and(...conditions))

  const androidTokens = rows.filter(row => row.platform === 'android').map(row => row.token)
  const iosTokens = rows.filter(row => row.platform === 'ios').map(row => row.token)
  const skipped = (platforms.android ? 0 : androidTokens.length) + (platforms.ios ? 0 : iosTokens.length)
  const safePayload = { ...payload, url: safeNativeUrl(payload.url) }
  const [androidResult, iosResult] = await Promise.all([
    platforms.android ? providerResult('android', androidTokens, safePayload) : Promise.resolve({ sent: 0, failed: 0, deadTokens: [] }),
    platforms.ios ? providerResult('ios', iosTokens, safePayload) : Promise.resolve({ sent: 0, failed: 0, deadTokens: [] }),
  ])
  const deadTokens = [...androidResult.deadTokens, ...iosResult.deadTokens]
  if (deadTokens.length > 0) {
    await db.delete(nativePushTokens).where(and(
      eq(nativePushTokens.parishId, parishId),
      inArray(nativePushTokens.token, deadTokens),
    ))
  }

  return {
    configured: platforms.android || platforms.ios,
    sent: androidResult.sent + iosResult.sent,
    failed: androidResult.failed + iosResult.failed,
    total: rows.length,
    removed: deadTokens.length,
    skipped,
    platforms,
  }
}

export function sendNativePushToParish(parishId: string, payload: AppPushPayload) {
  return sendNativePush(parishId, payload)
}

export function sendNativePushToUsers(parishId: string, userIds: string[], payload: AppPushPayload) {
  return sendNativePush(parishId, payload, userIds)
}
