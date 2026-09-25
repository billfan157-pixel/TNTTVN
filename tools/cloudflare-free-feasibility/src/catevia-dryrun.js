// Worker entry for dry-run and isolated Catevia staging. Staging receives only
// disposable database credentials; production traffic is still routed to Render.
import { createECDH, randomBytes, timingSafeEqual } from 'node:crypto'
import webPush from 'web-push'
import app from '../../../server/src/app.ts'
import { client } from '../../../server/src/db/connection.ts'
import { RECOVERY_QUARANTINE_KEY } from '../../../server/src/db/recoveryQuarantine.ts'
export { PasswordCpu } from '../../../server/src/cloudflare/passwordCpu.js'
export { BackupJob } from '../../../server/src/cloudflare/backupJob.js'
export { PdfJob } from './pdfJob.js'
export { BackendShard } from '../../../server/src/cloudflare/backendShard.js'
export { MaintenanceJob } from '../../../server/src/cloudflare/maintenanceJob.js'
import { MAINTENANCE_INTERVALS_MS } from '../../../server/src/cloudflare/maintenanceJob.js'

const DISPOSABLE_URL = 'libsql://catevia-cloudflare-probe-20260924-billfan157-pixel.aws-us-east-1.turso.io'

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname
    const authorization = request.headers.get('authorization') ?? ''
    const directLoginPrefix = 'CateviaDirect '
    const directBearerSuffix = '; CateviaDirect '
    const directBearerIndex = authorization.lastIndexOf(directBearerSuffix)
    const directLogin = authorization.startsWith(directLoginPrefix)
    if (directLogin || directBearerIndex >= 0) {
      const allowedDirectRoutes = new Set([
        'GET /health', 'POST /api/auth/login', 'POST /api/auth/refresh', 'POST /api/auth/logout',
        'GET /api/auth/me', 'GET /api/students', 'GET /api/classes', 'GET /api/notifications',
      ])
      const key = directLogin
        ? authorization.slice(directLoginPrefix.length)
        : authorization.slice(directBearerIndex + directBearerSuffix.length)
      const forwardedAuthorization = directLogin ? null : authorization.slice(0, directBearerIndex)
      const routeAllowed = allowedDirectRoutes.has(`${request.method} ${path}`)
      if (env.CATEVIA_CF_DISPOSABLE_PROBE !== 'yes' || env.TURSO_URL !== DISPOSABLE_URL || !routeAllowed) {
        return new Response(null, { status: 404 })
      }
      if (typeof env.OPS_TOKEN !== 'string' || env.OPS_TOKEN.length < 32 || key.length !== env.OPS_TOKEN.length
        || !timingSafeEqual(Buffer.from(key), Buffer.from(env.OPS_TOKEN))) {
        return new Response(null, { status: 403 })
      }
      try {
        const marker = await client.execute({
          sql: 'SELECT key FROM system_settings WHERE key = ? LIMIT 1',
          args: [RECOVERY_QUARANTINE_KEY],
        })
        if (marker.rows.length > 0) return new Response('Database recovery pending', { status: 503 })
        const headers = new Headers(request.headers)
        if (forwardedAuthorization === null) headers.delete('authorization')
        else headers.set('authorization', forwardedAuthorization)
        return await app.fetch(new Request(request, { headers }), env, ctx)
      } catch (error) {
        console.error(JSON.stringify({ type: 'DISPOSABLE_DIRECT_PROBE_ERROR', name: error?.name, code: error?.code }))
        return new Response(null, { status: 503 })
      }
    }
    if (path === '/__staging/encrypted-backup-probe' || path === '/__staging/webpush-crypto-probe'
      || path === '/__staging/maintenance-probe') {
      if (request.method !== 'POST') return new Response(null, { status: 405 })
      if (env.CATEVIA_CF_DISPOSABLE_PROBE !== 'yes' || env.TURSO_URL !== DISPOSABLE_URL) {
        return new Response(null, { status: 404 })
      }
      const expected = env.OPS_TOKEN
      const presented = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
      if (typeof expected !== 'string' || expected.length < 32 || presented.length !== expected.length
        || !timingSafeEqual(Buffer.from(presented), Buffer.from(expected))) {
        return new Response(null, { status: 403 })
      }
      if (path === '/__staging/webpush-crypto-probe') {
        try {
          const vapid = webPush.generateVAPIDKeys()
          const recipient = createECDH('prime256v1')
          recipient.generateKeys()
          const payload = 'Synthetic Catevia push only'
          const details = webPush.generateRequestDetails({
            endpoint: 'https://example.org/push/synthetic',
            keys: { p256dh: recipient.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
          }, payload, {
            vapidDetails: { subject: 'mailto:probe@example.org', publicKey: vapid.publicKey, privateKey: vapid.privateKey },
          })
          const body = Buffer.from(details.body || [])
          const valid = details.method === 'POST' && body.length > payload.length
            && !body.includes(Buffer.from(payload)) && Boolean(details.headers.Authorization)
          return Response.json({ valid, encryptedBytes: body.length, encoding: details.headers['Content-Encoding'] }, { status: valid ? 200 : 500 })
        } catch (error) {
          return Response.json({ ok: false, errorClass: error?.name || 'UnknownError' }, { status: 500 })
        }
      }
      if (path === '/__staging/maintenance-probe') {
        const kind = new URL(request.url).searchParams.get('job')
        if (!Object.hasOwn(MAINTENANCE_INTERVALS_MS, kind)) {
          return new Response(null, { status: 400 })
        }
        const mode = new URL(request.url).searchParams.get('mode')
        const id = env.MAINTENANCE_JOB.idFromName(`staging-disposable-${kind}`)
        const job = env.MAINTENANCE_JOB.get(id)
        return (mode === 'status' ? job.status() : mode === 'schedule' ? job.ensureScheduled(kind) : job.run(kind))
          .then(result => Response.json({ ok: true, job: kind, result }))
          .catch(error => {
            console.error(JSON.stringify({ type: 'DISPOSABLE_MAINTENANCE_PROBE_ERROR', job: kind,
              name: error?.name, code: error?.code }))
            return Response.json({ ok: false, job: kind }, { status: 500 })
          })
      }
      return (async () => {
        try {
          const id = env.BACKUP_JOB.idFromName('staging-disposable-database')
          const result = await env.BACKUP_JOB.get(id).createBackup()
          return Response.json({ ok: true, ...result })
        } catch (error) {
          let message = String(error?.message || 'Unknown error')
          for (const secret of [env.OPS_TOKEN, env.TURSO_AUTH_TOKEN, env.BACKUP_ENCRYPTION_KEY]) {
            if (typeof secret === 'string' && secret) message = message.replaceAll(secret, '[redacted]')
          }
          message = message.replace(/eyJ[A-Za-z0-9._-]+/g, '[redacted-jwt]').slice(0, 240)
          console.error(JSON.stringify({ type: 'DISPOSABLE_BACKUP_PROBE_ERROR', name: error?.name, code: error?.code, message }))
          return Response.json({ ok: false }, { status: 500 })
        }
      })()
    }
    const id = env.BACKEND_SHARD.idFromName('staging-disposable-deployment')
    return env.BACKEND_SHARD.get(id, { locationHint: 'enam' }).fetch(request)
  },
  scheduled(_event, env, ctx) {
    if (env.CATEVIA_CF_DISPOSABLE_PROBE !== 'yes' || env.TURSO_URL !== DISPOSABLE_URL
      || env.CATEVIA_MAINTENANCE_OWNER !== 'cloudflare') return
    ctx.waitUntil(Promise.all(Object.keys(MAINTENANCE_INTERVALS_MS).map(async kind => {
      const id = env.MAINTENANCE_JOB.idFromName(`staging-disposable-${kind}`)
      await env.MAINTENANCE_JOB.get(id).ensureScheduled(kind)
    })))
  },
}
