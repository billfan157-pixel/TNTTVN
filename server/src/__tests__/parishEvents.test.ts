// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { auditLogs, parishEvents, users } from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'
import parishEventsRouter from '../routes/parishEvents.js'

const suffix = Date.now()
const parishA = `events-a-${suffix}`
const parishB = `events-b-${suffix}`
const adminId = `events-admin-${suffix}`
const parentId = `events-parent-${suffix}`

const token = (userId: string, role: 'admin' | 'phuhuynh', parishId: string) =>
  generateTokens({ userId, username: userId, role, parishId, tokenVersion: 1 }).accessToken
const adminToken = token(adminId, 'admin', parishA)
const parentToken = token(parentId, 'phuhuynh', parishA)

async function request(path: string, options: { method?: string; auth?: string; body?: unknown } = {}) {
  return parishEventsRouter.request(path, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.auth ? { Authorization: `Bearer ${options.auth}` } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

describe('parish event tenant, calendar and audit boundary', () => {
  beforeAll(async () => {
    await db.insert(users).values([
      { id: adminId, username: adminId, passwordHash: 'hash', fullName: 'Event Admin', role: 'admin', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: parentId, username: parentId, passwordHash: 'hash', fullName: 'Event Parent', role: 'phuhuynh', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
    ])
    await db.insert(parishEvents).values({ id: `foreign-${suffix}`, parishId: parishB, date: '2026-09-02', title: 'Tenant B', category: 'OTHER' })
  })

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.parishId, parishA))
    await db.delete(parishEvents).where(eq(parishEvents.parishId, parishA))
    await db.delete(parishEvents).where(eq(parishEvents.parishId, parishB))
    await db.delete(users).where(eq(users.parishId, parishA))
  })

  it('rejects impossible calendar dates and parent writes', async () => {
    const invalid = await request('/', { method: 'POST', auth: adminToken, body: {
      date: '2026-02-31', title: 'Ngày không tồn tại', category: 'OTHER',
    } })
    expect(invalid.status).toBe(400)
    expect((await db.select().from(parishEvents).where(and(
      eq(parishEvents.parishId, parishA), eq(parishEvents.title, 'Ngày không tồn tại'),
    )))).toHaveLength(0)

    expect((await request('/', { method: 'POST', auth: parentToken, body: {
      date: '2026-09-02', title: 'Không được tạo', category: 'OTHER',
    } })).status).toBe(403)
  })

  it('keeps each acknowledged mutation paired with a tenant-scoped audit row', async () => {
    const createdResponse = await request('/', { method: 'POST', auth: adminToken, body: {
      date: '2026-09-02', title: 'Sinh hoạt Xứ đoàn', category: 'MEETING',
    } })
    expect(createdResponse.status).toBe(201)
    const created = (await createdResponse.json() as any).data

    expect((await request(`/${created.id}`, { method: 'PUT', auth: adminToken, body: { title: 'Sinh hoạt cập nhật' } })).status).toBe(200)
    expect((await request(`/${created.id}`, { method: 'DELETE', auth: adminToken })).status).toBe(200)

    const audits = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishA), eq(auditLogs.entityId, created.id),
    ))
    expect(audits.map(row => row.action)).toEqual(expect.arrayContaining(['CREATE', 'UPDATE', 'DELETE']))
    expect(audits.every(row => row.entityType === 'parish_event')).toBe(true)

    const visible = await request('/', { auth: adminToken })
    const body = await visible.json() as any
    expect(body.data.some((event: { parishId: string }) => event.parishId !== parishA)).toBe(false)
    expect(body.data.every((event: Record<string, unknown>) => !('tasks' in event) && !('assignees' in event) && !('comments' in event) && !('readiness' in event))).toBe(true)
  })
})
