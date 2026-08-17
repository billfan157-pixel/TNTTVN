import { db } from '../db/index.js'
import { systemSettings } from '../db/schema.js'
import { and, eq } from 'drizzle-orm'
import { notifySundayMassReminder, getSundayMassTime } from './smartNotifications.js'

const CHECK_INTERVAL_MS = 60 * 1000
/** Gửi reminder trong cửa sổ [giờ lễ, giờ lễ + 2h]; quá muộn → bỏ qua hôm đó. */
const SEND_WINDOW_MINUTES = 120
const MARKER_KEY = 'sunday_reminder_last_sent'
const PARISH_ID = process.env.PARISH_ID || 'gia-ton'

let timer: ReturnType<typeof setInterval> | null = null
let running = false

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((v) => parseInt(v || '0', 10))
  return (h || 0) * 60 + (m || 0)
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Kiểm tra + gửi reminder Thánh Lễ Thiếu Nhi tự động (Chúa Nhật):
 * - Chỉ chạy Chúa Nhật (getDay() === 0).
 * - Gửi đúng giờ cấu hình sundayMassTime (parish settings, mặc định 08:00),
 *   trong cửa sổ 2h; quá giờ → bỏ qua ngày đó.
 * - Mỗi Chúa Nhật chỉ gửi 1 lần (marker `sunday_reminder_last_sent` trong system_settings).
 */
export async function runSundayReminderCheck(now: Date = new Date()): Promise<number> {
  if (now.getDay() !== 0) return 0
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  try {
    const sundayMassTime = await getSundayMassTime(PARISH_ID)
    const targetMinutes = parseHHMM(sundayMassTime)
    if (nowMinutes < targetMinutes || nowMinutes >= targetMinutes + SEND_WINDOW_MINUTES) return 0

    const today = dateKey(now)
    // A-NEW-36 (2026-08-11): marker giờ đây PK composite (key, parish_id) — lọc cả
    // parish (trước đây lọc key toàn cục → scheduler parish A thấy marker của parish B).
    const [marker] = await db.select().from(systemSettings)
      .where(and(eq(systemSettings.key, MARKER_KEY), eq(systemSettings.parishId, PARISH_ID)))
      .limit(1)
    if (marker && marker.value === today) return 0

    await notifySundayMassReminder(PARISH_ID)

    const nowIso = new Date().toISOString()
    if (marker) {
      await db.update(systemSettings)
        .set({ value: today, updatedAt: nowIso })
        .where(and(eq(systemSettings.key, MARKER_KEY), eq(systemSettings.parishId, PARISH_ID)))
    } else {
      await db.insert(systemSettings).values({
        key: MARKER_KEY,
        value: today,
        description: 'Ngày Chúa Nhật cuối cùng đã gửi reminder Thánh Lễ (single-parish, giống purge_version)',
        updatedAt: nowIso,
        parishId: PARISH_ID,
      })
    }
    return 1
  } catch (err) {
    console.error('[sundayReminderScheduler] check failed:', err)
    return 0
  }
}

/** Khởi động scheduler (gọi 1 lần sau khi DB migrations xong). */
export function initSundayReminderScheduler(): void {
  if (timer) return
  timer = setInterval(() => {
    if (running) return
    running = true
    runSundayReminderCheck()
      .catch((err) => console.error('[sundayReminderScheduler] tick failed:', err))
      .finally(() => { running = false })
  }, CHECK_INTERVAL_MS)
  timer.unref?.()
  console.log('[sundayReminderScheduler] started — daily Sunday mass reminder every 60s')
}

/** Dừng scheduler (dùng trong test để không treo process). */
export function stopSundayReminderScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
