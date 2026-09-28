import jwt from 'jsonwebtoken'
import type { AppPushPayload, NativeProviderResult } from './pushTypes.js'
import { isCloudflareWorkerRuntime } from '../utils/cloudflareRuntime.js'

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
const FCM_CONCURRENCY = 50
let cachedAccessToken: { value: string; expiresAt: number; clientEmail: string } | null = null

interface FirebaseServiceAccount {
  client_email: string
  private_key: string
  project_id: string
  token_uri?: string
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

async function workerOAuthAssertion(account: FirebaseServiceAccount, tokenUri: string): Promise<string> {
  const pem = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '')
  const keyBytes = Uint8Array.from(atob(pem), char => char.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const now = Math.floor(Date.now() / 1000)
  const encoder = new TextEncoder()
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const claims = base64Url(encoder.encode(JSON.stringify({ iss: account.client_email,
    scope: FCM_SCOPE, aud: tokenUri, iat: now, exp: now + 3600 })))
  const input = `${header}.${claims}`
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(input)))
  return `${input}.${base64Url(signature)}`
}

export function isFcmConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
}

function serviceAccount(): FirebaseServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON chưa được cấu hình')
  let parsed: Partial<FirebaseServiceAccount>
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON không phải JSON hợp lệ')
  }
  if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
    throw new Error('Firebase service account thiếu client_email/private_key/project_id')
  }
  return parsed as FirebaseServiceAccount
}

async function accessToken(account: FirebaseServiceAccount): Promise<string> {
  const now = Date.now()
  if (cachedAccessToken
    && cachedAccessToken.clientEmail === account.client_email
    && cachedAccessToken.expiresAt - 5 * 60_000 > now) {
    return cachedAccessToken.value
  }

  const tokenUri = account.token_uri || DEFAULT_TOKEN_URI
  const assertion = isCloudflareWorkerRuntime()
    ? await workerOAuthAssertion(account, tokenUri)
    : jwt.sign({ scope: FCM_SCOPE }, account.private_key, {
      algorithm: 'RS256',
      issuer: account.client_email,
      audience: tokenUri,
      expiresIn: '1h',
    })
  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`FCM OAuth token request failed (${response.status})`)
  const body = await response.json() as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new Error('FCM OAuth response thiếu access_token')
  cachedAccessToken = {
    value: body.access_token,
    expiresAt: now + Math.max(60, body.expires_in || 3600) * 1000,
    clientEmail: account.client_email,
  }
  return body.access_token
}

function fcmErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('error' in body)) return undefined
  const details = (body as { error?: { details?: unknown[] } }).error?.details
  if (!Array.isArray(details)) return undefined
  for (const detail of details) {
    if (detail && typeof detail === 'object' && 'errorCode' in detail && typeof detail.errorCode === 'string') return detail.errorCode
  }
  return undefined
}

async function sendOne(
  account: FirebaseServiceAccount,
  authorization: string,
  token: string,
  payload: AppPushPayload,
): Promise<{ ok: boolean; dead: boolean; errorReason?: string }> {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${authorization}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          ...(payload.url ? { data: { url: payload.url } } : {}),
          android: {
            priority: 'HIGH',
            notification: { channel_id: 'catevia_general', visibility: 'PRIVATE' },
          },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  )
  if (response.ok) return { ok: true, dead: false }
  let errorBody: unknown = null
  try { errorBody = await response.json() } catch {}
  const code = fcmErrorCode(errorBody)
  console.warn(`[fcmPushProvider] delivery rejected (${response.status}):`, {
    errorCode: code || 'unknown',
    tokenPrefix: `${token.slice(0, 8)}...`,
  })
  // INVALID_ARGUMENT can describe the message payload itself; only the
  // provider-confirmed UNREGISTERED state is safe for destructive cleanup.
  return {
    ok: false,
    dead: code === 'UNREGISTERED',
    errorReason: `FCM:${response.status}:${code || 'REJECTED'}`,
  }
}

export async function sendFcmPush(tokens: string[], payload: AppPushPayload): Promise<NativeProviderResult> {
  if (tokens.length === 0) return { sent: 0, failed: 0, deadTokens: [], successfulTokens: [] }
  const account = serviceAccount()
  const authorization = await accessToken(account)
  const responses: Array<{ ok: boolean; dead: boolean; errorReason?: string }> = []
  const batchSize = isCloudflareWorkerRuntime() ? 4 : FCM_CONCURRENCY
  for (let offset = 0; offset < tokens.length; offset += batchSize) {
    responses.push(...await Promise.all(
      tokens.slice(offset, offset + batchSize).map(token => sendOne(account, authorization, token, payload)),
    ))
  }
  const deadTokens = responses.flatMap((response, index) => response.dead ? [tokens[index]] : [])
  const successfulTokens = responses.flatMap((response, index) => response.ok ? [tokens[index]] : [])
  const sent = successfulTokens.length
  const lastProviderError = responses.find(r => r.errorReason)?.errorReason
  return { sent, failed: responses.length - sent, deadTokens, successfulTokens, lastProviderError }
}
