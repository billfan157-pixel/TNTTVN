import jwt from 'jsonwebtoken'
import type { AppPushPayload, NativeProviderResult } from './pushTypes.js'

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
  const assertion = jwt.sign({ scope: FCM_SCOPE }, account.private_key, {
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
): Promise<{ ok: boolean; dead: boolean }> {
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
  // INVALID_ARGUMENT can describe the message payload itself; only the
  // provider-confirmed UNREGISTERED state is safe for destructive cleanup.
  return { ok: false, dead: code === 'UNREGISTERED' }
}

export async function sendFcmPush(tokens: string[], payload: AppPushPayload): Promise<NativeProviderResult> {
  if (tokens.length === 0) return { sent: 0, failed: 0, deadTokens: [] }
  const account = serviceAccount()
  const authorization = await accessToken(account)
  const responses: Array<{ ok: boolean; dead: boolean }> = []
  for (let offset = 0; offset < tokens.length; offset += FCM_CONCURRENCY) {
    responses.push(...await Promise.all(
      tokens.slice(offset, offset + FCM_CONCURRENCY).map(token => sendOne(account, authorization, token, payload)),
    ))
  }
  const deadTokens = responses.flatMap((response, index) => response.dead ? [tokens[index]] : [])
  const sent = responses.filter(response => response.ok).length
  return { sent, failed: responses.length - sent, deadTokens }
}
