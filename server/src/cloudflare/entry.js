import { MAINTENANCE_INTERVALS_MS } from './maintenanceJob.js'
import { gateWorkerRequest } from './trafficGate.js'

const PRODUCTION_DATABASE_URL = 'libsql://tnttvn-billfan157-pixel.aws-us-east-1.turso.io'

export { PasswordCpu } from './passwordCpu.js'
export { BackupJob } from './backupJob.js'
export { BackendShard } from './backendShard.js'
export { MaintenanceJob } from './maintenanceJob.js'
export { PdfJob } from '../../../tools/cloudflare-free-feasibility/src/pdfJob.js'

function appShard(env) {
  return env.BACKEND_SHARD.get(env.BACKEND_SHARD.idFromName('catevia-production'),
    { locationHint: 'enam' })
}

function backupJob(env) {
  return env.BACKUP_JOB.get(env.BACKUP_JOB.idFromName('catevia-production-backup'))
}

export default {
  async fetch(request, env) {
    if (env.TURSO_URL !== PRODUCTION_DATABASE_URL || !env.TURSO_AUTH_TOKEN
      || !env.JWT_SECRET || !env.JWT_REFRESH_SECRET || !env.REPORT_HMAC_SECRET
      || !env.SUPER_ADMIN_ID || !env.OPS_TOKEN || !env.BACKUP_ENCRYPTION_KEY
      || !env.PASSWORD_CIPHER_KEY) {
      return new Response('Backend configuration incomplete', { status: 503 })
    }
    if (env.CATEVIA_TRAFFIC_ENABLED === 'yes' && !env.CATEVIA_PROXY_SHARED_SECRET) {
      return new Response('Backend proxy configuration incomplete', { status: 503 })
    }
    const gate = gateWorkerRequest(request, env)
    if (gate.response) return gate.response
    const path = new URL(request.url).pathname
    if (env.CATEVIA_TRAFFIC_ENABLED !== 'yes' && path === '/__ops/precutover-backup') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
      try {
        return Response.json(await backupJob(env).createBackup())
      } catch (error) {
        console.error(JSON.stringify({ type: 'PRECUTOVER_BACKUP_FAILED', errorClass: error?.name || 'UnknownError' }))
        return new Response('Backup probe failed', { status: 503 })
      }
    }
    if (env.CATEVIA_TRAFFIC_ENABLED !== 'yes' && path === '/__ops/precutover-backup/verify') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
      try {
        const objectKey = request.headers.get('x-catevia-backup-key')
        return Response.json(await backupJob(env).verifyBackup(objectKey))
      } catch (error) {
        console.error(JSON.stringify({ type: 'PRECUTOVER_BACKUP_VERIFY_FAILED', errorClass: error?.name || 'UnknownError' }))
        return new Response('Backup verification failed', { status: 503 })
      }
    }
    return appShard(env).fetch(gate.request)
  },
  scheduled(_event, env, ctx) {
    if (env.CATEVIA_MAINTENANCE_OWNER !== 'cloudflare') return
    ctx.waitUntil(Promise.all(Object.keys(MAINTENANCE_INTERVALS_MS).map(async kind => {
      const id = env.MAINTENANCE_JOB.idFromName(`catevia-production-${kind}`)
      await env.MAINTENANCE_JOB.get(id).ensureScheduled(kind)
    })))
  },
}
