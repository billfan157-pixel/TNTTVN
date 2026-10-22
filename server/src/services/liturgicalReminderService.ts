import { and, eq, isNull, like, sql } from 'drizzle-orm'
import { db, runDbTransaction, type DbExecutor } from '../db/index.js'
import { auditLogs, notifications, systemSettings, users } from '../db/schema.js'
import { getLiturgicalDay } from '../domain/liturgicalEngine.js'
import { assertDeploymentParishScope, getEnforcedDeploymentParishId } from '../utils/deploymentParish.js'
import { isCloudflareWorkerRuntime } from '../utils/cloudflareRuntime.js'
import { generateId } from '../utils/id.js'

export const LITURGICAL_REMINDER_TIMEZONE = 'Asia/Ho_Chi_Minh'
export const LITURGICAL_REMINDER_KEY_PREFIX = 'liturgical_reminder:'
const ID_PREFIX = 'NOT-LITURGICAL-'
const SEND_WINDOW_MINUTES = 120
const localClock = new Intl.DateTimeFormat('en-CA', { timeZone: LITURGICAL_REMINDER_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export interface LiturgicalReminderPreferences { enabled: boolean; time: string; timeZone: typeof LITURGICAL_REMINDER_TIMEZONE }
export class LiturgicalReminderError extends Error {
  status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

export function vietnamReminderClock(now = new Date()) {
  const parts = Object.fromEntries(localClock.formatToParts(now).map(part => [part.type, part.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), time: `${parts.hour}:${parts.minute}` }
}

const validTime = (time: unknown): time is string => typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
function parsePreferences(raw: string): LiturgicalReminderPreferences | null {
  try {
    const value = JSON.parse(raw)
    return value && typeof value.enabled === 'boolean' && validTime(value.time)
      ? { enabled: value.enabled, time: value.time, timeZone: LITURGICAL_REMINDER_TIMEZONE } : null
  } catch { return null }
}
function isDue(preferences: LiturgicalReminderPreferences, minutes: number): boolean {
  const [hour, minute] = preferences.time.split(':').map(Number)
  const elapsed = minutes - hour * 60 - minute
  return preferences.enabled && elapsed >= 0 && elapsed < SEND_WINDOW_MINUTES
}
export const liturgicalReminderId = (date: string, userId: string) => `${ID_PREFIX}${date}-${userId}`
export const isLiturgicalReminderId = (id: string) => id.startsWith(ID_PREFIX)

async function currentPreference(executor: DbExecutor, parishId: string, userId: string) {
  const [row] = await executor.select({ value: systemSettings.value }).from(systemSettings).innerJoin(users, and(
    eq(users.parishId, systemSettings.parishId), eq(systemSettings.key, sql`${LITURGICAL_REMINDER_KEY_PREFIX} || ${users.id}`),
  )).where(and(eq(users.parishId, parishId), eq(users.id, userId), eq(users.status, 'ACTIVE'), isNull(users.deletedAt))).limit(1)
  return row ? parsePreferences(row.value) : null
}

export async function getLiturgicalReminderPreferences(parishId: string, userId: string): Promise<LiturgicalReminderPreferences> {
  return await currentPreference(db, parishId, userId) ?? { enabled: false, time: '08:00', timeZone: LITURGICAL_REMINDER_TIMEZONE }
}

export async function saveLiturgicalReminderPreferences(parishId: string, userId: string, input: { enabled: boolean; time: string }) {
  assertDeploymentParishScope(parishId)
  if (typeof input.enabled !== 'boolean' || !validTime(input.time)) throw new LiturgicalReminderError('Giờ nhắc phải có dạng HH:mm từ 00:00 đến 23:59.')
  const preferences: LiturgicalReminderPreferences = { ...input, timeZone: LITURGICAL_REMINDER_TIMEZONE }
  await runDbTransaction(async tx => {
    const [user] = await tx.select({ id: users.id }).from(users).where(and(eq(users.parishId, parishId), eq(users.id, userId), eq(users.status, 'ACTIVE'), isNull(users.deletedAt))).limit(1)
    if (!user) throw new LiturgicalReminderError('Tài khoản không còn quyền thay đổi thông báo.', 403)
    const key = `${LITURGICAL_REMINDER_KEY_PREFIX}${userId}`
    const now = new Date().toISOString()
    await tx.insert(systemSettings).values({ key, parishId, value: JSON.stringify(preferences), updatedBy: userId, updatedAt: now })
      .onConflictDoUpdate({ target: [systemSettings.key, systemSettings.parishId], set: { value: JSON.stringify(preferences), updatedBy: userId, updatedAt: now } })
    await tx.insert(auditLogs).values({ id: generateId('AUD'), parishId, userId, action: 'LITURGICAL_REMINDER_PREFERENCES', entityType: 'user_notification_preference', entityId: userId, newValue: JSON.stringify(preferences), createdAt: now })
  })
  return preferences
}

/** Rechecked after a queue lease is acquired, including after worker restart. */
export async function liturgicalDeliveryBlockReason(parishId: string, id: string, targets: string[], now = new Date()): Promise<string | null> {
  const clock = vietnamReminderClock(now)
  if (targets.length !== 1 || id !== liturgicalReminderId(clock.date, targets[0])) return 'LITURGICAL_REMINDER_EXPIRED'
  const preferences = await currentPreference(db, parishId, targets[0])
  if (!preferences?.enabled) return 'LITURGICAL_REMINDER_DISABLED'
  return isDue(preferences, clock.minutes) ? null : 'LITURGICAL_REMINDER_OUTSIDE_WINDOW'
}

function reminderMessage(date: string): string {
  const day = getLiturgicalDay(date)
  const dateLabel = date.split('-').reverse().join('/')
  return [`Lịch phụng vụ ${dateLabel}: ${day.title}.`, `${day.seasonName} · Áo lễ ${day.colorName}.`,
    day.readings?.gospel ? `Tin Mừng: ${day.readings.gospel}.` : '', day.readings?.gospelVerse ?? ''].filter(Boolean).join('\n').slice(0, 1500)
}

export async function runLiturgicalReminderCheck(now = new Date()) {
  const clock = vietnamReminderClock(now)
  const deploymentParishId = getEnforcedDeploymentParishId()
  const batchSize = isCloudflareWorkerRuntime() ? 5 : 100
  const prefTime = sql<string>`CASE WHEN json_valid(${systemSettings.value}) THEN json_extract(${systemSettings.value}, '$.time') END`
  const prefEnabled = sql<string>`CASE WHEN json_valid(${systemSettings.value}) THEN json_type(${systemSettings.value}, '$.enabled') END`
  const minimumMinutes = Math.max(0, clock.minutes - SEND_WINDOW_MINUTES + 1)
  const minimumTime = `${String(Math.floor(minimumMinutes / 60)).padStart(2, '0')}:${String(minimumMinutes % 60).padStart(2, '0')}`
  const candidates = await db.select({ parishId: users.parishId, userId: users.id }).from(systemSettings)
    .innerJoin(users, and(eq(users.parishId, systemSettings.parishId), eq(systemSettings.key, sql`${LITURGICAL_REMINDER_KEY_PREFIX} || ${users.id}`)))
    .leftJoin(notifications, and(eq(notifications.parishId, users.parishId), eq(notifications.id, sql`${ID_PREFIX + clock.date + '-'} || ${users.id}`)))
    .where(and(like(systemSettings.key, `${LITURGICAL_REMINDER_KEY_PREFIX}%`), eq(users.status, 'ACTIVE'), isNull(users.deletedAt), isNull(notifications.id),
      sql`${prefEnabled} = 'true'`, sql`${prefTime} GLOB '[0-2][0-9]:[0-5][0-9]' AND ${prefTime} <= '23:59' AND ${prefTime} <= ${clock.time} AND ${prefTime} >= ${minimumTime}`,
      deploymentParishId ? eq(users.parishId, deploymentParishId) : undefined)).orderBy(users.parishId, users.id).limit(batchSize + 1)
  const summary = { enqueued: 0, failed: 0, moreDue: candidates.length > batchSize }
  const message = candidates.length ? reminderMessage(clock.date) : ''
  for (const candidate of candidates.slice(0, batchSize)) {
    try {
      assertDeploymentParishScope(candidate.parishId)
      const added = await runDbTransaction(async tx => {
        const preferences = await currentPreference(tx, candidate.parishId, candidate.userId)
        if (!preferences || !isDue(preferences, clock.minutes)) return false
        const rows = await tx.insert(notifications).values({
          id: liturgicalReminderId(clock.date, candidate.userId), parishId: candidate.parishId, type: 'web_push', channel: 'reminder', deliveryKind: 'reminder',
          status: 'retrying', recipient: 'Liturgical Reminder', message, triggeredByType: 'system', targetUserIds: JSON.stringify([candidate.userId]),
          createdAt: now.toISOString(), nextAttemptAt: now.toISOString(), attemptCount: 0, maxAttempts: 3, deliveredEndpoints: '[]',
        }).onConflictDoNothing({ target: [notifications.parishId, notifications.id] }).returning({ id: notifications.id })
        return rows.length > 0
      })
      if (added) summary.enqueued++
    } catch (error) {
      summary.failed++
      console.error('[liturgicalReminder] enqueue failed', { errorClass: error instanceof Error ? error.name : 'UnknownError' })
    }
  }
  return summary
}

let timer: ReturnType<typeof setInterval> | undefined
let activeRun: Promise<unknown> | undefined
export function initLiturgicalReminderScheduler() {
  if (timer) return
  timer = setInterval(() => {
    if (activeRun) return
    activeRun = runLiturgicalReminderCheck().catch(error => console.error('[liturgicalReminder] tick failed', { errorClass: error instanceof Error ? error.name : 'UnknownError' }))
      .finally(() => { activeRun = undefined })
  }, 60_000)
  timer.unref?.()
}
export async function stopLiturgicalReminderScheduler() {
  if (timer) clearInterval(timer)
  timer = undefined
  await activeRun
}
