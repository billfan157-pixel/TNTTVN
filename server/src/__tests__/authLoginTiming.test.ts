import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { eq } from 'drizzle-orm'
import auth from '../routes/auth.js'
import { db } from '../db/index.js'
import { users, refreshTokens, auditLogs } from '../db/schema.js'
import { BCRYPT_COST, consumeRejectedLogin, verifyLoginPassword } from '../utils/passwordPolicy.js'

const parishId = `auth-timing-${Date.now()}`
const password = 'Synthetic-Timing@123'
const wrong = 'Wrong-Timing@123'
let legacyHash: string
let currentHash: string
let sequence = 0
const populations = ['unknown', 'legacy', 'current'] as const

async function login(username: string, candidate = wrong, ip?: string) {
  return auth.request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': ip || `198.18.1.${++sequence}` },
    body: JSON.stringify({ username, password: candidate, parishId }),
  })
}
function summary(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b)
  return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], samplesMs: samples }
}

beforeAll(async () => {
  vi.stubEnv('TRUST_PROXY', 'true')
  legacyHash = await bcrypt.hash(password, 10)
  currentHash = await bcrypt.hash(password, BCRYPT_COST)
  await db.insert(users).values([
    { id: `${parishId}-legacy`, username: 'legacy', parishId, fullName: 'Synthetic Legacy', role: 'admin', passwordHash: legacyHash },
    { id: `${parishId}-current`, username: 'current', parishId, fullName: 'Synthetic Current', role: 'admin', passwordHash: currentHash },
  ])
})
afterAll(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await db.delete(refreshTokens).where(eq(refreshTokens.parishId, parishId))
  await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
  await db.delete(users).where(eq(users.parishId, parishId))
})

describe('AUTH-P2-003 work-factor parity and measured login behavior', () => {
  it('unknown, legacy and current failures perform the same cost-10 + cost-12 work', async () => {
    const compare = vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as never)
    try {
      for (const hash of [undefined, legacyHash, currentHash]) {
        compare.mockClear()
        if (hash) expect(await verifyLoginPassword(wrong, hash)).toBe(false)
        else await consumeRejectedLogin(wrong)
        const costs = compare.mock.calls.map(call => bcrypt.getRounds(call[1] as string)).sort()
        expect(costs).toEqual([10, 12])
      }
    } finally { compare.mockRestore() }
  })

  it('measures interleaved wrong-password populations with real bcrypt, routing, limiter and DB', async () => {
    // LAB/SYNTHETIC; current machine, warmed Node, no network. Baseline is the
    // old bcrypt-only work (cost 10 vs 12), measured in this same run. Post-fix
    // measurements include the real route and its database/audit overhead.
    // The 1.4 ratio is a regression diagnostic for the old ~4x work-factor
    // oracle, not a production timing SLO or proof of absolute constant time.
    const baseline: Record<string, number[]> = { legacy: [], current: [] }
    await bcrypt.compare(wrong, legacyHash)
    await bcrypt.compare(wrong, currentHash)
    for (let n = 0; n < 8; n++) {
      for (const key of n % 2 ? ['current', 'legacy'] : ['legacy', 'current']) {
        const start = performance.now()
        await bcrypt.compare(wrong, key === 'legacy' ? legacyHash : currentHash)
        baseline[key].push(performance.now() - start)
      }
    }
    for (const name of populations) expect((await login(name)).status).toBe(401)
    const measured: Record<string, number[]> = { unknown: [], legacy: [], current: [] }
    for (let n = 0; n < 12; n++) {
      // Rotate order so population is not confounded with monotonic warmup.
      for (let j = 0; j < populations.length; j++) {
        const name = populations[(n + j) % populations.length]
        const start = performance.now()
        const response = await login(name)
        measured[name].push(performance.now() - start)
        expect(response.status).toBe(401)
        expect(await response.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } })
      }
    }
    const post = Object.fromEntries(populations.map(name => [name, summary(measured[name])]))
    const medians = Object.values(post).map(result => result.medianMs)
    const medianRatio = Math.max(...medians) / Math.min(...medians)
    process.stdout.write('AUTH_TIMING_LAB ' + JSON.stringify({
      node: process.version, platform: process.platform, cpu: cpus()[0]?.model,
      baseline: { legacy: summary(baseline.legacy), current: summary(baseline.current) }, post, medianRatio,
    }) + '\n')
    expect(medianRatio).toBeLessThan(1.4)
  }, 90000)

  it('still upgrades a successful legacy login to the current cost', async () => {
    expect((await login('legacy', password)).status).toBe(200)
    const [user] = await db.select().from(users).where(eq(users.id, `${parishId}-legacy`))
    expect(bcrypt.getRounds(user.passwordHash)).toBe(BCRYPT_COST)
    expect(await bcrypt.compare(password, user.passwordHash)).toBe(true)
  })

  it('still limits a public caller to ten login attempts per window', async () => {
    for (let n = 0; n < 10; n++) expect((await login('unknown', wrong, '198.18.2.1')).status).toBe(401)
    expect((await login('unknown', wrong, '198.18.2.1')).status).toBe(429)
  }, 20000)
})
