import { performance } from 'node:perf_hooks'

const PROFILE = {
  events: Number(process.env.OPS_BENCH_EVENTS || 250),
  tasks: Number(process.env.OPS_BENCH_TASKS || 1000),
  readinessTasks: Number(process.env.OPS_BENCH_READINESS_TASKS || 250),
  warmups: 5,
  samples: 20,
  pageSize: 50,
}

for (const [name, value] of Object.entries(PROFILE)) {
  if (!Number.isInteger(value) || value < 1 || value > 5000) throw new Error(`Invalid Operations benchmark ${name}: ${value}`)
}
if (PROFILE.readinessTasks > PROFILE.tasks) throw new Error('Operations benchmark readinessTasks cannot exceed tasks.')

if (!process.env.DB_PATH || process.env.TURSO_URL) throw new Error('Operations benchmark requires an isolated local DB_PATH supplied by its wrapper.')
process.env.NODE_ENV = 'test'

const percentile = (values: number[], ratio: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) * ratio)]
}

const sample = async (run: () => Promise<void>) => {
  for (let index = 0; index < PROFILE.warmups; index++) await run()
  const values: number[] = []
  for (let index = 0; index < PROFILE.samples; index++) {
    const started = performance.now()
    await run()
    values.push(performance.now() - started)
  }
  return {
    minMs: Math.min(...values),
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: Math.max(...values),
  }
}

let closeDatabase: (() => void | Promise<void>) | undefined
try {
  const [{ db, client }, schema, { generateTokens }, { default: operationsRouter }] = await Promise.all([
    import('../server/src/db/index.js'),
    import('../server/src/db/schema.js'),
    import('../server/src/middleware/auth.js'),
    import('../server/src/routes/operations.js'),
  ])
  closeDatabase = () => client.close()
  const parishId = 'operations-benchmark-parish'
  const userId = 'operations-benchmark-admin'
  await db.insert(schema.users).values({
    id: userId, parishId, username: userId, passwordHash: 'synthetic-not-a-login-secret',
    fullName: 'Synthetic Operations Benchmark', role: 'admin', status: 'ACTIVE', tokenVersion: 1,
  })

  const now = new Date('2026-09-08T00:00:00.000Z')
  const eventRows = Array.from({ length: PROFILE.events }, (_, index) => ({
    id: `OPS-BENCH-E-${index}`, parishId, title: `Synthetic event ${index}`, eventType: 'OTHER',
    startsAt: new Date(now.getTime() + index * 60_000).toISOString(),
    endsAt: new Date(now.getTime() + index * 60_000 + 3_600_000).toISOString(),
    timezone: 'UTC', status: 'DRAFT' as const, visibility: 'INTERNAL' as const, version: 1,
    createdBy: userId, updatedBy: userId,
  }))
  const taskRows = Array.from({ length: PROFILE.tasks }, (_, index) => ({
    id: `OPS-BENCH-T-${index}`, parishId, title: `Synthetic task ${index}`, status: 'TODO' as const,
    operationEventId: index < PROFILE.readinessTasks ? eventRows[0].id : null,
    priority: 'NORMAL' as const, isRequired: index < PROFILE.readinessTasks, approvalStatus: 'NOT_REQUIRED' as const, version: 1,
    createdBy: userId, updatedBy: userId,
  }))
  for (let offset = 0; offset < eventRows.length; offset += 50) await db.insert(schema.operationEvents).values(eventRows.slice(offset, offset + 50))
  for (let offset = 0; offset < taskRows.length; offset += 50) await db.insert(schema.operationTasks).values(taskRows.slice(offset, offset + 50))

  const token = generateTokens({ userId, username: userId, role: 'admin', parishId, tokenVersion: 1 }).accessToken
  const runList = async (path: string, expectedTotal: number) => {
    const response = await operationsRouter.request(path, { headers: { Authorization: `Bearer ${token}` } })
    const body = await response.json() as any
    if (response.status !== 200 || body.data?.length !== PROFILE.pageSize || body.meta?.total !== expectedTotal) {
      throw new Error(`Unexpected benchmark response for ${path}`)
    }
  }
  const events = await sample(() => runList(`/events?page=1&limit=${PROFILE.pageSize}`, PROFILE.events))
  const tasks = await sample(() => runList(`/tasks?page=1&limit=${PROFILE.pageSize}`, PROFILE.tasks))
  const runReadiness = async () => {
    const response = await operationsRouter.request(`/events/${eventRows[0].id}/readiness`, { headers: { Authorization: `Bearer ${token}` } })
    const body = await response.json() as any
    if (response.status !== 200 || body.data?.blockers?.length !== PROFILE.readinessTasks * 2) throw new Error('Unexpected readiness benchmark response')
  }
  const readiness = await sample(runReadiness)
  console.log(JSON.stringify({
    kind: 'synthetic-local-baseline-not-slo',
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    profile: PROFILE,
    results: { events, tasks, readiness },
  }, null, 2))
} finally {
  await closeDatabase?.()
}
