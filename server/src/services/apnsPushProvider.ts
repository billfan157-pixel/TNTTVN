import * as http2 from 'node:http2'
import jwt from 'jsonwebtoken'
import type { AppPushPayload, NativeProviderResult } from './pushTypes.js'

const APNS_PAYLOAD_LIMIT = 4096
const APNS_JWT_TTL_MS = 50 * 60 * 1000
const APNS_BATCH_LIMIT = 100
let cachedJwt: { value: string; createdAt: number } | null = null

interface ApnsConfig {
  keyId: string
  teamId: string
  privateKey: string
  bundleId: string
  host: string
}

function getApnsConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const bundleId = process.env.APNS_BUNDLE_ID
  if (!keyId || !teamId || !privateKey || !bundleId) return null
  return {
    keyId,
    teamId,
    privateKey,
    bundleId,
    host: process.env.APNS_ENVIRONMENT === 'development'
      ? 'https://api.sandbox.push.apple.com'
      : 'https://api.push.apple.com',
  }
}

export function isApnsConfigured(): boolean {
  return getApnsConfig() !== null
}

function providerToken(config: ApnsConfig): string {
  const now = Date.now()
  if (cachedJwt && now - cachedJwt.createdAt < APNS_JWT_TTL_MS) return cachedJwt.value
  const value = jwt.sign({}, config.privateKey, {
    algorithm: 'ES256',
    issuer: config.teamId,
    keyid: config.keyId,
  })
  cachedJwt = { value, createdAt: now }
  return value
}

function buildPayload(payload: AppPushPayload): string {
  const make = (body: string) => JSON.stringify({
    aps: { alert: { title: payload.title, body }, sound: 'default' },
    ...(payload.url ? { url: payload.url } : {}),
  })
  let body = payload.body
  let encoded = make(body)
  while (Buffer.byteLength(encoded, 'utf8') > APNS_PAYLOAD_LIMIT && body.length > 0) {
    body = `${body.slice(0, Math.max(0, body.length - 128)).trimEnd()}…`
    encoded = make(body)
  }
  if (Buffer.byteLength(encoded, 'utf8') > APNS_PAYLOAD_LIMIT) {
    throw new Error('APNs payload vượt giới hạn 4 KB')
  }
  return encoded
}

function sendOne(
  client: http2.ClientHttp2Session,
  token: string,
  authorization: string,
  config: ApnsConfig,
  body: string,
): Promise<{ ok: boolean; dead: boolean; errorReason?: string }> {
  return new Promise((resolve, reject) => {
    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${encodeURIComponent(token)}`,
      authorization: `bearer ${authorization}`,
      'apns-topic': config.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
    })
    let responseBody = ''
    let status = 0
    request.setEncoding('utf8')
    request.on('response', headers => { status = Number(headers[':status'] || 0) })
    request.on('data', chunk => { responseBody += chunk })
    request.on('error', reject)
    request.on('end', () => {
      let reason = ''
      try { reason = JSON.parse(responseBody || '{}').reason || '' } catch {}
      const ok = status === 200
      const dead = status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'DeviceTokenNotForTopic'
      if (!ok) {
        console.warn(`[apnsPushProvider] delivery rejected (${status}):`, {
          reason: reason || 'unknown',
          tokenPrefix: `${token.slice(0, 8)}...`,
        })
      }
      resolve({
        ok,
        dead,
        errorReason: !ok ? `APNS:${status}:${reason || 'REJECTED'}` : undefined,
      })
    })
    request.end(body)
  })
}

export async function sendApnsPush(
  tokens: string[],
  payload: AppPushPayload,
): Promise<NativeProviderResult> {
  if (tokens.length === 0) return { sent: 0, failed: 0, deadTokens: [], successfulTokens: [] }
  const config = getApnsConfig()
  if (!config) return { sent: 0, failed: tokens.length, deadTokens: [], successfulTokens: [], lastProviderError: 'APNS:NOT_CONFIGURED' }

  const client = http2.connect(config.host)
  client.on('error', () => { /* individual streams reject; prevent process-level crash */ })
  try {
    const authorization = providerToken(config)
    const body = buildPayload(payload)
    const responses: Array<{ ok: boolean; dead: boolean; errorReason?: string }> = []
    for (let offset = 0; offset < tokens.length; offset += APNS_BATCH_LIMIT) {
      responses.push(...await Promise.all(
        tokens.slice(offset, offset + APNS_BATCH_LIMIT)
          .map(token => sendOne(client, token, authorization, config, body)),
      ))
    }
    const deadTokens = responses.flatMap((response, index) => response.dead ? [tokens[index]] : [])
    const successfulTokens = responses.flatMap((response, index) => response.ok ? [tokens[index]] : [])
    const sent = successfulTokens.length
    const lastProviderError = responses.find(r => r.errorReason)?.errorReason
    return { sent, failed: responses.length - sent, deadTokens, successfulTokens, lastProviderError }
  } finally {
    client.close()
  }
}
