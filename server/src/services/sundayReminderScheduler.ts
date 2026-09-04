import { db } from '../db/index.js'
import { systemSettings } from '../db/schema.js'
import { and, eq } from 'drizzle-orm'
import { notifySundayMassReminder, getSundayMassTime } from './smartNotifications.js'

const CHECK_INTERVAL_MS = 60 * 1000
const SEND_WINDOW_MINUTES = 120
const MARKER_KEY = 'sunday_reminder_last_sent'
const PARISH_SETTINGS_KEY = 'parish_system_settings'

export interface SundayReminderCheckSummary {
  checked: number
  sent: number
  failed: number
  failures: { parishId: string; reason: string }[]
}

let timer: ReturnType<typeof setInterval> | null = null
let running = false
let activeRun: Promise<SundayReminderCheckSummary> | null = null

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((value) => parseInt(value || '0', 10))
  return (h || 0) * 60 + (m || 0)
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function listEnabledParishIds(): Promise<string[]> {
  const rows = await db.select({ parishId: systemSettings.parishId, value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, PARISH_SETTINGS_KEY))

  const parishIds: string[] = []
  for (const row of rows) {
    try {
      const settings = JSON.parse(row.value) as Record<string, unknown>
      if (settings.sundayReminderEnabled === true) parishIds.push(row.parishId)
    } catch (error) {
      console.error(`[sundayReminderScheduler] invalid settings for ${row.parishId}:`, error)
    }
  }
  return [...new Set(parishIds)].sort()
}

/** Run exactly one tenant. Errors propagate so the coordinator can isolate/report them. */
export async function runSundayReminderForParish(parishId: string, now: Date = new Date()): Promise<number> {
  if (now.getDay() !== 0) return 0
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const targetMinutes = parseHHMM(await getSundayMassTime(parishId))
  if (nowMinutes < targetMinutes || nowMinutes >= targetMinutes + SEND_WINDOW_MINUTES) return 0

  const today = dateKey(now)
  const [marker] = await db.select().from(systemSettings)
    .where(and(eq(systemSettings.key, MARKER_KEY), eq(systemSettings.parishId, parishId)))
    .limit(1)
  if (marker?.value === today) return 0

  await notifySundayMassReminder(parishId)

  const nowIso = new Date().toISOString()
  await db.insert(systemSettings).values({
    key: MARKER_KEY,
    value: today,
    description: 'Ngày Chúa Nhật cuối cùng đã gửi reminder Thánh Lễ cho parish',
    updatedAt: nowIso,
    parishId,
  }).onConflictDoUpdate({
    target: [systemSettings.key, systemSettings.parishId],
    set: { value: today, updatedAt: nowIso },
  })
  return 1
}

/** Enumerate only explicitly opted-in tenants and isolate failure per parish. */
export async function runSundayReminderCheck(now: Date = new Date()): Promise<SundayReminderCheckSummary> {
  if (now.getDay() !== 0) return { checked: 0, sent: 0, failed: 0, failures: [] }
  const parishIds = await listEnabledParishIds()
  const summary: SundayReminderCheckSummary = { checked: parishIds.length, sent: 0, failed: 0, failures: [] }

  for (const parishId of parishIds) {
    try {
      summary.sent += await runSundayReminderForParish(parishId, now)
    } catch (error) {
      summary.failed++
      summary.failures.push({ parishId, reason: error instanceof Error ? error.message : 'Unknown scheduler error' })
      console.error(`[sundayReminderScheduler] parish ${parishId} failed:`, error)
    }
  }
  return summary
}

export function initSundayReminderScheduler(): void {
  if (timer) return
  timer = setInterval(() => {
    if (running) return
    running = true
    activeRun = runSundayReminderCheck()
      .catch((error) => {
        console.error('[sundayReminderScheduler] tick failed:', error)
        return {
          checked: 0,
          sent: 0,
          failed: 1,
          failures: [{ parishId: 'scheduler', reason: error instanceof Error ? error.message : 'Unknown scheduler error' }],
        }
      })
      .finally(() => {
        running = false
        activeRun = null
      })
  }, CHECK_INTERVAL_MS)
  timer.unref?.()
  console.log('[sundayReminderScheduler] started — opted-in parish reminder check every 60s')
}

export async function stopSundayReminderScheduler(): Promise<void> {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (activeRun) await activeRun
}
