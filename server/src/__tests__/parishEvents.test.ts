// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { parishEvents, users } from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'
import parishEventsRouter from '../routes/parishEvents.js'

const suffix = Date.now()
const parishA = `events-a-${suffix}`
const parishB = `events-b-${suffix}`
const adminId = `events-admin-${suffix}`
const parentId = `events-parent-${suffix}`
const eventId = `events-public-${suffix}`

const token = (userId: string, role: 'admin' | 'phuhuynh', parishId: string) => generateTokens({ userId, username: userId, role, parishId, tokenVersion: 1 }).accessToken
const adminToken = token(adminId, 'admin', parishA)
const parentToken = token(parentId, 'phuhuynh', parishA)

async function request(path: string, options: { method?: string; auth?: string; body?: unknown } = {}) {
  return parishEventsRouter.request(path, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.auth ? { Authorization: `Bearer ${options.auth}` } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

describe('read-only parish calendar projection boundary', () => {
  beforeAll(async () => {
    await db.insert(users).values([
      { id: adminId, username: adminId, passwordHash: 'hash', fullName: 'Event Admin', role: 'admin', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: parentId, username: parentId, passwordHash: 'hash', fullName: 'Event Parent', role: 'phuhuynh', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
    ])
    await db.insert(parishEvents).values([
      { id: eventId, parishId: parishA, date: '2026-09-02', title: 'Sinh hoạt Xứ đoàn', category: 'MEETING', time: '08:30', location: 'Hội trường' },
      { id: `foreign-${suffix}`, parishId: parishB, date: '2026-09-02', title: 'Tenant B', category: 'OTHER' },
    ])
  })

  afterAll(async () => {
    await db.delete(parishEvents).where(eq(parishEvents.parishId, parishA))
    await db.delete(parishEvents).where(eq(parishEvents.parishId, parishB))
    await db.delete(users).where(eq(users.parishId, parishA))
  })

  it('lets parents read only the public projection in their parish', async () => {
    const response = await request('/', { auth: parentToken })
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.data).toEqual([expect.objectContaining({ id: eventId, parishId: parishA, date: '2026-09-02', title: 'Sinh hoạt Xứ đoàn', time: '08:30', location: 'Hội trường' })])
    expect(body.data.every((event: Record<string, unknown>) => !('tasks' in event) && !('assignees' in event) && !('comments' in event) && !('readiness' in event))).toBe(true)
  })

  it('rejects invalid read filters instead of silently widening the calendar query', async () => {
    const invalidDate = await request('/?from=2026-02-30', { auth: parentToken })
    expect(invalidDate.status).toBe(400)
    expect((await invalidDate.json() as any).error.code).toBe('VALIDATION_ERROR')

    const invalidCategory = await request('/?category=PRIVATE', { auth: parentToken })
    expect(invalidCategory.status).toBe(400)
    expect((await invalidCategory.json() as any).error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects direct create, update and delete even for administrators', async () => {
    for (const [method, path] of [['POST', '/'], ['PUT', `/${eventId}`], ['DELETE', `/${eventId}`]] as const) {
      const response = await request(path, { method, auth: adminToken, body: { date: '2026-09-03', title: 'Direct write', category: 'OTHER' } })
      expect(response.status).toBe(405)
      expect((await response.json() as any).error.code).toBe('CALENDAR_READ_ONLY')
    }
    expect((await db.select().from(parishEvents).where(eq(parishEvents.id, eventId)))[0].title).toBe('Sinh hoạt Xứ đoàn')
  })
})
