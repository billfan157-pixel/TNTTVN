import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import app from '../routes/notifications.js'
import { client, db } from '../db/index.js'
import { auditLogs, notifications, systemSettings, users } from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'
import { getLiturgicalReminderPreferences, liturgicalDeliveryBlockReason, liturgicalReminderId, runLiturgicalReminderCheck, saveLiturgicalReminderPreferences, vietnamReminderClock } from '../services/liturgicalReminderService.js'
import { runNotificationDeliveryCycle } from '../services/notificationQueue.js'
import { sendAppPushToUsers } from '../services/appPushService.js'
import { MaintenanceJob } from '../cloudflare/maintenanceJob.js'

vi.mock('../services/appPushService.js', () => ({ sendAppPushToUsers: vi.fn() }))
vi.mock('cloudflare:workers', () => ({ DurableObject: class {
  ctx: unknown; env: unknown
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env }
} }))
const parishA = 'liturgical-a'
const parishB = 'liturgical-b'
const now = new Date('2026-12-25T01:00:00Z')
const userId = 'liturgical-member'
const auth = (id = userId, parish = parishA) => generateTokens({ userId: id, username: id, role: 'phuhuynh', parishId: parish }).accessToken
async function request(method: string, body?: unknown, bearer: string | null = auth()) {
  const response = await app.request('/liturgical-reminder', { method, headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const text = await response.text()
  let result: any
  try { result = JSON.parse(text) } catch { result = { error: text } }
  return { status: response.status, ...result }
}
const ownRows = () => db.select().from(notifications).where(inArray(notifications.parishId, [parishA, parishB]))

describe('personal daily liturgical reminder authority and delivery', () => {
  beforeAll(async () => {
    await db.insert(users).values([
      { id: userId, parishId: parishA, username: 'liturgical-a-user', role: 'phuhuynh', passwordHash: 'test', fullName: 'Synthetic A', status: 'ACTIVE' },
      { id: userId, parishId: parishB, username: 'liturgical-b-user', role: 'phuhuynh', passwordHash: 'test', fullName: 'Synthetic B', status: 'ACTIVE' },
      ...Array.from({ length: 7 }, (_, i) => ({ id: `liturgical-user-${i}`, parishId: parishA, username: `liturgical-user-${i}`, role: 'phuhuynh' as const, passwordHash: 'test', fullName: 'Synthetic', status: 'ACTIVE' as const })),
    ])
  })
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now)
    await db.delete(notifications).where(inArray(notifications.parishId, [parishA, parishB]))
    await db.delete(systemSettings).where(inArray(systemSettings.parishId, [parishA, parishB]))
    await db.delete(auditLogs).where(inArray(auditLogs.parishId, [parishA, parishB]))
    vi.mocked(sendAppPushToUsers).mockReset().mockResolvedValue({ configured: true, sent: 1, failed: 0, total: 1, removed: 0, skipped: 0, deliveredEndpoints: [], channels: {} } as any)
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete process.env.DEPLOYMENT_PARISH_ID; delete process.env.CATEVIA_RUNTIME })

  it('defaults to opt-out at 08:00 Vietnam and lets each authenticated account manage only its own preference', async () => {
    expect((await request('GET', undefined, null)).status).toBe(401)
    expect((await request('PUT', { enabled: true, time: '08:00' }, null)).status).toBe(401)
    expect((await request('GET')).data).toEqual({ enabled: false, time: '08:00', timeZone: 'Asia/Ho_Chi_Minh' })
    const saved = await request('PUT', { enabled: true, time: '08:00' })
    expect(saved.status).toBe(200)
    expect((await request('GET')).data.enabled).toBe(true)
    expect((await request('GET', undefined, auth(userId, parishB))).data.enabled).toBe(false)
    expect((await request('GET', undefined, auth('liturgical-user-0'))).data.enabled).toBe(false)
    for (const body of [{ enabled: true, time: '24:00' }, { enabled: true, time: '8:00' }, { enabled: true, time: '08:60' }, { enabled: true, time: '08:00', userId: 'liturgical-user-0' }]) expect((await request('PUT', body)).status).toBe(400)
    expect((await request('GET', undefined, auth('liturgical-user-0'))).data.enabled).toBe(false)
  })

  it('uses Vietnam time across UTC midnight and enqueues once per local day under concurrent/repeated ticks', async () => {
    expect(vietnamReminderClock(new Date('2026-12-24T17:30:00Z'))).toMatchObject({ date: '2026-12-25', time: '00:30' })
    await saveLiturgicalReminderPreferences(parishA, userId, { enabled: true, time: '08:00' })
    expect((await runLiturgicalReminderCheck(new Date('2026-12-25T00:59:59Z'))).enqueued).toBe(0)
    await Promise.all([runLiturgicalReminderCheck(now), runLiturgicalReminderCheck(now)])
    expect(await ownRows()).toHaveLength(1)
    expect((await runLiturgicalReminderCheck(now)).enqueued).toBe(0)
    const [row] = await ownRows()
    expect(row).toMatchObject({ id: liturgicalReminderId('2026-12-25', userId), parishId: parishA, status: 'retrying', deliveryKind: 'reminder', targetUserIds: JSON.stringify([userId]) })
    expect(row.message).toContain('25/12/2026')
    expect(row.message).toContain('Giáng Sinh')
    expect(row.message).toContain('Trắng')
    expect((await runLiturgicalReminderCheck(new Date('2026-12-26T01:00:00Z'))).enqueued).toBe(1)
    expect(await ownRows()).toHaveLength(2)
  })

  it('delivers the persisted reminder through the existing push worker with a calendar deep link', async () => {
    await saveLiturgicalReminderPreferences(parishA, userId, { enabled: true, time: '08:00' })
    await runLiturgicalReminderCheck(now)
    await runNotificationDeliveryCycle()
    expect(sendAppPushToUsers).toHaveBeenCalledWith(parishA, [userId], expect.objectContaining({ title: 'Lịch phụng vụ hôm nay', url: '/calendar', body: expect.stringContaining('Giáng Sinh') }))
    expect((await ownRows())[0].status).toBe('sent')
  })

  it('suppresses queued delivery after opting out and does not broadcast to another member', async () => {
    await saveLiturgicalReminderPreferences(parishA, userId, { enabled: true, time: '08:00' })
    await runLiturgicalReminderCheck(now)
    await saveLiturgicalReminderPreferences(parishA, userId, { enabled: false, time: '08:00' })
    await runNotificationDeliveryCycle()
    expect(sendAppPushToUsers).not.toHaveBeenCalled()
    expect((await ownRows())[0]).toMatchObject({ status: 'failed', error: 'LITURGICAL_REMINDER_DISABLED' })
  })

  it('rejects stale reminders, a changed future send time and invalid target ownership', async () => {
    await saveLiturgicalReminderPreferences(parishA, userId, { enabled: true, time: '08:00' })
    const id = liturgicalReminderId('2026-12-25', userId)
    expect(await liturgicalDeliveryBlockReason(parishA, id, [userId], now)).toBeNull()
    expect(await liturgicalDeliveryBlockReason(parishA, id, [userId], new Date('2026-12-25T03:00:00Z'))).toBe('LITURGICAL_REMINDER_OUTSIDE_WINDOW')
    expect(await liturgicalDeliveryBlockReason(parishA, id, [userId], new Date('2026-12-26T01:00:00Z'))).toBe('LITURGICAL_REMINDER_EXPIRED')
    expect(await liturgicalDeliveryBlockReason(parishA, id, [userId, 'liturgical-user-0'], now)).toBe('LITURGICAL_REMINDER_EXPIRED')
    await saveLiturgicalReminderPreferences(parishA, userId, { enabled: true, time: '09:00' })
    expect(await liturgicalDeliveryBlockReason(parishA, id, [userId], now)).toBe('LITURGICAL_REMINDER_OUTSIDE_WINDOW')
  })

  it('skips opted-out, malformed and locked accounts and respects the deployment parish boundary', async () => {
    await saveLiturgicalReminderPreferences(parishA, userId, { enabled: true, time: '08:00' })
    await saveLiturgicalReminderPreferences(parishB, userId, { enabled: true, time: '08:00' })
    await db.insert(systemSettings).values({ key: 'liturgical_reminder:liturgical-user-0', parishId: parishA, value: '{bad json' })
    await db.insert(systemSettings).values({ key: 'liturgical_reminder:liturgical-user-2', parishId: parishA, value: '{"enabled":1,"time":"08:00"}' })
    await saveLiturgicalReminderPreferences(parishA, 'liturgical-user-1', { enabled: true, time: '08:00' })
    await db.update(users).set({ status: 'LOCKED' }).where(and(eq(users.parishId, parishA), eq(users.id, 'liturgical-user-1')))
    try {
      process.env.DEPLOYMENT_PARISH_ID = parishA
      expect((await runLiturgicalReminderCheck(now)).enqueued).toBe(1)
      expect((await ownRows()).map(row => row.parishId)).toEqual([parishA])
    } finally { await db.update(users).set({ status: 'ACTIVE' }).where(and(eq(users.parishId, parishA), eq(users.id, 'liturgical-user-1'))) }
  })

  it('bounds Worker batches and makes forward progress instead of rescanning already enqueued members', async () => {
    process.env.CATEVIA_RUNTIME = 'cloudflare-worker'
    vi.stubGlobal('WebSocketPair', function WebSocketPair() {})
    for (let i = 0; i < 7; i++) await saveLiturgicalReminderPreferences(parishA, `liturgical-user-${i}`, { enabled: true, time: '08:00' })
    expect(await runLiturgicalReminderCheck(now)).toEqual({ enqueued: 5, failed: 0, moreDue: true })
    expect(await runLiturgicalReminderCheck(now)).toEqual({ enqueued: 2, failed: 0, moreDue: false })
    expect(await ownRows()).toHaveLength(7)
  })

  it('runs the real liturgical producer through the Cloudflare coordinator and promptly continues its backlog', async () => {
    process.env.CATEVIA_RUNTIME = 'cloudflare-worker'
    vi.stubGlobal('WebSocketPair', function WebSocketPair() {})
    for (let i = 0; i < 7; i++) await saveLiturgicalReminderPreferences(parishA, `liturgical-user-${i}`, { enabled: true, time: '08:00' })
    const values = new Map<string, unknown>([['kind', 'liturgical-reminders']])
    const storage = { get: async (key: string) => values.get(key), put: async (key: string, value: unknown) => { values.set(key, value) },
      getAlarm: async () => null, setAlarm: vi.fn(async (_at: number) => {}), deleteAlarm: async () => {} }
    const job = new MaintenanceJob({ storage, abort: () => { throw new Error('Unexpected abort') } }, { CATEVIA_MAINTENANCE_OWNER: 'cloudflare' })
    await job.alarm()
    expect(await ownRows()).toHaveLength(5)
    expect(storage.setAlarm.mock.calls[0][0] - now.getTime()).toBeLessThan(5000)
    await job.alarm()
    expect(await ownRows()).toHaveLength(7)
    expect(values.has('lastSuccessAt')).toBe(true)
  })

  it('does not mark a preference saved if its audit fails', async () => {
    await saveLiturgicalReminderPreferences(parishA, userId, { enabled: false, time: '08:00' })
    await client.execute("CREATE TRIGGER liturgical_preference_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.action = 'LITURGICAL_REMINDER_PREFERENCES' BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END")
    try {
      expect((await request('PUT', { enabled: true, time: '09:00' })).status).toBe(500)
      expect(await getLiturgicalReminderPreferences(parishA, userId)).toMatchObject({ enabled: false, time: '08:00' })
    } finally { await client.execute('DROP TRIGGER liturgical_preference_audit_failure') }
  })
})
