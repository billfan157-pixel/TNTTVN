import { describe, expect, it, vi, afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { notifications, students, users, telegramLinks, branches, academicYears, classes } from '../db/schema.js'
import { ACADEMIC_NOTIFICATION_MESSAGE, initNotificationQueue, enqueueNotification, stopNotificationQueue } from '../services/notificationQueue.js'
import { sendTelegramInfo, sendTelegramMessageToChat } from '../services/telegram.js'
import { sendAppPushToUsers } from '../services/appPushService.js'

vi.mock('../services/telegram.js', () => ({
  isTelegramEnabled: vi.fn().mockReturnValue(true),
  sendTelegramMessageToChat: vi.fn().mockResolvedValue(undefined),
  sendTelegramInfo: vi.fn().mockResolvedValue(undefined),
  sendTelegramAlert: vi.fn().mockResolvedValue(undefined),
}))
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
  it.each(['valid', 'phone-changed', 'locked', 'inactive', 'forced', 'deleted', 'wrong-role', 'missing-subject', 'legacy-global', 'missing-link', 'webpush-valid', 'webpush-stale'] as const)('%s', async scenario => {
    vi.clearAllMocks()
    const child = `child-${scenario}`
    const parent = `parent-${scenario}`
    const id = `message-${scenario}`
    const webpush = scenario.startsWith('webpush')
    await db.insert(students).values({ id: child, parishId: P, code: child, fullName: 'Sensitive synthetic child', holyName: 'Giuse', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Synthetic', parentPhone: '0900000201', address: 'Synthetic', branch: 'AuNhi', classId: 'class' })
    await db.insert(users).values({ id: parent, parishId: P, username: parent, fullName: 'Synthetic Parent', passwordHash: 'unused', role: scenario === 'wrong-role' ? 'chunhiem' : 'phuhuynh', phone: scenario === 'phone-changed' || scenario === 'webpush-stale' ? '0900000299' : '0900000201', status: scenario === 'locked' ? 'LOCKED' : scenario === 'inactive' ? 'INACTIVE' : scenario === 'forced' ? 'FORCE_PASSWORD_CHANGE' : 'ACTIVE', deletedAt: scenario === 'deleted' ? new Date().toISOString() : null })
    if (scenario !== 'missing-link') await db.insert(telegramLinks).values({ id: `link-${scenario}`, parishId: P, userId: parent, chatId: `chat-${scenario}`, telegramUserId: `sender-${scenario}`, status: 'ACTIVE', notificationsEnabled: 1 })
    await db.insert(notifications).values({ id, parishId: P, type: webpush ? 'web_push' : 'telegram', channel: 'report_card', deliveryKind: 'report', status: 'retrying', recipient: 'Synthetic Parent', message: 'Sensitive synthetic child: grade 9', targetUserIds: scenario === 'legacy-global' ? null : JSON.stringify([parent]), studentId: scenario === 'missing-subject' || scenario === 'legacy-global' ? null : child, triggeredByType: 'system' })
    await initNotificationQueue()
    const shouldSend = scenario === 'valid' || scenario === 'webpush-valid'
    await vi.waitFor(async () => {
      const [row] = await db.select().from(notifications).where(and(eq(notifications.parishId, P), eq(notifications.id, id)))
      expect(row.status).toBe(shouldSend ? 'sent' : 'failed')
      if (!shouldSend) expect(row.error).toMatch(/^ACADEMIC_/)
    })
    expect(sendTelegramInfo).not.toHaveBeenCalled()
    if (scenario === 'valid') expect(sendTelegramMessageToChat).toHaveBeenCalledWith(`chat-${scenario}`, ACADEMIC_NOTIFICATION_MESSAGE, true)
    else expect(sendTelegramMessageToChat).not.toHaveBeenCalled()
    if (scenario === 'webpush-valid') expect(sendAppPushToUsers).toHaveBeenCalledWith(P, [parent], { title: 'Catevia', body: ACADEMIC_NOTIFICATION_MESSAGE, url: '/' })
    else expect(sendAppPushToUsers).not.toHaveBeenCalled()
  })

  it('new child notifications persist subject and generic content, not rendered child PII', async () => {
    await db.insert(students).values({ id: 'subject', parishId: P, code: 'subject', fullName: 'Synthetic', holyName: 'Giuse', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Synthetic', parentPhone: '0900000201', address: 'Synthetic', branch: 'AuNhi', classId: 'class' })
    const id = await enqueueNotification('telegram', 'absence', '{studentName} {score}', { studentName: 'Sensitive Child', score: 9 }, P, 0, { studentId: 'subject', telegramUserIds: ['parent'] })
    const [row] = await db.select().from(notifications).where(and(eq(notifications.parishId, P), eq(notifications.id, id)))
    expect(row).toMatchObject({ studentId: 'subject', message: ACADEMIC_NOTIFICATION_MESSAGE, recipient: 'Parent' })
  })
})
