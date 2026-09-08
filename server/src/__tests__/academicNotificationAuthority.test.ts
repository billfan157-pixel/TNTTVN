import { describe, expect, it, vi, afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { notifications, students, users, branches, academicYears, classes } from '../db/schema.js'
import { ACADEMIC_NOTIFICATION_MESSAGE, initNotificationQueue, enqueueNotification, stopNotificationQueue } from '../services/notificationQueue.js'
import { sendAppPushToUsers } from '../services/appPushService.js'

vi.mock('../services/appPushService.js', () => ({
  sendAppPushToUsers: vi.fn().mockResolvedValue({ configured: true, sent: 1, failed: 0, total: 1, removed: 0, skipped: 0 }),
  sendAppPushToParish: vi.fn(),
}))
const P = `notification-authority-${Date.now()}`
beforeEach(() => {
  vi.stubEnv('DEPLOYMENT_PARISH_ID', P)
})
afterEach(() => {
  vi.unstubAllEnvs()
})
beforeAll(async () => {
  await db.insert(branches).values({ id: 'branch', parishId: P, name: 'Synthetic', scarfColor: 'Xanh', ageMin: 6, ageMax: 12 })
  await db.insert(academicYears).values({ id: '2025-2026', parishId: P, startDate: '2025-09-01', endDate: '2026-06-30' })
  await db.insert(classes).values({ id: 'class', parishId: P, code: 'LAB', name: 'Synthetic', branchId: 'branch', academicYearId: '2025-2026' })
})
afterAll(() => stopNotificationQueue())

describe('Recovered academic messages require current child ownership', () => {
  it.each(['valid', 'phone-changed', 'locked', 'inactive', 'forced', 'deleted', 'wrong-role', 'missing-subject', 'legacy-global'] as const)('%s', async scenario => {
    vi.clearAllMocks()
    const child = `child-${scenario}`
    const parent = `parent-${scenario}`
    const id = `message-${scenario}`
    await db.insert(students).values({ id: child, parishId: P, code: child, fullName: 'Sensitive synthetic child', holyName: 'Giuse', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Synthetic', parentPhone: '0900000201', address: 'Synthetic', branch: 'AuNhi', classId: 'class' })
    await db.insert(users).values({ id: parent, parishId: P, username: parent, fullName: 'Synthetic Parent', passwordHash: 'unused', role: scenario === 'wrong-role' ? 'chunhiem' : 'phuhuynh', phone: scenario === 'phone-changed' ? '0900000299' : '0900000201', status: scenario === 'locked' ? 'LOCKED' : scenario === 'inactive' ? 'INACTIVE' : scenario === 'forced' ? 'FORCE_PASSWORD_CHANGE' : 'ACTIVE', deletedAt: scenario === 'deleted' ? new Date().toISOString() : null })
    await db.insert(notifications).values({ id, parishId: P, type: 'web_push', channel: 'report_card', deliveryKind: 'report', status: 'retrying', recipient: 'Synthetic Parent', message: 'Sensitive synthetic child: grade 9', targetUserIds: scenario === 'legacy-global' ? null : JSON.stringify([parent]), studentId: scenario === 'missing-subject' || scenario === 'legacy-global' ? null : child, triggeredByType: 'system' })
    await initNotificationQueue()
    const shouldSend = scenario === 'valid'
    await vi.waitFor(async () => {
      const [row] = await db.select().from(notifications).where(and(eq(notifications.parishId, P), eq(notifications.id, id)))
      expect(row.status).toBe(shouldSend ? 'sent' : 'failed')
      if (!shouldSend) expect(row.error).toMatch(/^ACADEMIC_/)
    })
    if (scenario === 'valid') expect(sendAppPushToUsers).toHaveBeenCalledWith(P, [parent], { title: 'Catevia', body: ACADEMIC_NOTIFICATION_MESSAGE, url: '/' })
    else expect(sendAppPushToUsers).not.toHaveBeenCalled()
  })

  it('new child notifications persist subject and generic content, not rendered child PII', async () => {
    await db.insert(students).values({ id: 'subject', parishId: P, code: 'subject', fullName: 'Synthetic', holyName: 'Giuse', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Synthetic', parentPhone: '0900000201', address: 'Synthetic', branch: 'AuNhi', classId: 'class' })
    const id = await enqueueNotification('webpush', 'absence', '{studentName} {score}', { studentName: 'Sensitive Child', score: 9 }, P, 0, { studentId: 'subject', webpushUserIds: ['parent'] })
    const [row] = await db.select().from(notifications).where(and(eq(notifications.parishId, P), eq(notifications.id, id)))
    expect(row).toMatchObject({ studentId: 'subject', message: ACADEMIC_NOTIFICATION_MESSAGE, recipient: 'Parent' })
  })
})
