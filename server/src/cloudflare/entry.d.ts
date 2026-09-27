import type { WorkerTrafficEnv } from './trafficGate.js'

interface WorkerEnvironment extends WorkerTrafficEnv {
  TURSO_URL?: string
  TURSO_AUTH_TOKEN?: string
  JWT_SECRET?: string
  JWT_REFRESH_SECRET?: string
  REPORT_HMAC_SECRET?: string
  SUPER_ADMIN_ID?: string
  BACKUP_ENCRYPTION_KEY?: string
  CATEVIA_MAINTENANCE_OWNER?: string
  [binding: string]: unknown
}

declare const worker: {
  fetch(request: Request, env: WorkerEnvironment): Promise<Response>
  scheduled(event: unknown, env: WorkerEnvironment, ctx: { waitUntil(task: Promise<unknown>): void }): void
}
export default worker
