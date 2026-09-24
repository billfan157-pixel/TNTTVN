import { timingSafeEqual } from 'node:crypto'
import { MAINTENANCE_INTERVALS_MS } from './maintenanceJob.js'

const PRODUCTION_DATABASE_URL = 'libsql://tnttvn-billfan157-pixel.aws-us-east-1.turso.io'

export { PasswordCpu } from './passwordCpu.js'
export { BackupJob } from './backupJob.js'
export { BackendShard } from './backendShard.js'
export { MaintenanceJob } from './maintenanceJob.js'
export { PdfJob } from '../../../tools/cloudflare-free-feasibility/src/pdfJob.js'

function hasOpsToken(request, env) {
  const expected = env.OPS_TOKEN
  const presented = request.headers.get('authorization')?.replace(/^Bearer /, '') || ''
  return typeof expected === 'string' && expected.length >= 32
    && presented.length === expected.length
    && timingSafeEqual(Buffer.from(presented), Buffer.from(expected))
}

function appShard(env) {
  return env.BACKEND_SHARD.get(env.BACKEND_SHARD.idFromName('catevia-production'),
    { locationHint: 'enam' })
}

export default {
  fetch(request, env) {
    if (env.TURSO_URL !== PRODUCTION_DATABASE_URL || !env.TURSO_AUTH_TOKEN
      || !env.JWT_SECRET || !env.JWT_REFRESH_SECRET || !env.REPORT_HMAC_SECRET
      || !env.SUPER_ADMIN_ID || !env.OPS_TOKEN || !env.BACKUP_ENCRYPTION_KEY
      || !env.PASSWORD_CIPHER_KEY) {
      return new Response('Backend configuration incomplete', { status: 503 })
    }
    if (env.CATEVIA_TRAFFIC_ENABLED === 'yes' && !/^[a-f0-9]{40}$/.test(env.APP_RELEASE_ID || '')) {
      return new Response('Backend release not pinned', { status: 503 })
    }
    if (env.CATEVIA_TRAFFIC_ENABLED !== 'yes') {
      if (request.method !== 'GET' || new URL(request.url).pathname !== '/health'
        || !hasOpsToken(request, env)) {
        return new Response('Backend cutover pending', { status: 503 })
      }
    }
    return appShard(env).fetch(request)
  },
  scheduled(_event, env, ctx) {
    if (env.CATEVIA_MAINTENANCE_OWNER !== 'cloudflare') return
    ctx.waitUntil(Promise.all(Object.keys(MAINTENANCE_INTERVALS_MS).map(async kind => {
      const id = env.MAINTENANCE_JOB.idFromName(`catevia-production-${kind}`)
      await env.MAINTENANCE_JOB.get(id).ensureScheduled(kind)
    })))
  },
}
