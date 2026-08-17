import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { db } from '../../db/index.js'
import { systemSettings } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

vi.mock('../../services/smartNotifications.js', () => ({
  notifySundayMassReminder: vi.fn().mockResolvedValue(undefined),
  getSundayMassTime: vi.fn().mockResolvedValue('08:00'),
}))

import { runSundayReminderCheck, stopSundayReminderScheduler } from '../../services/sundayReminderScheduler.js'
import { notifySundayMassReminder, getSundayMassTime } from '../../services/smartNotifications.js'

const MARKER_KEY = 'sunday_reminder_last_sent'

describe('sundayReminderScheduler', () => {
  beforeAll(() => {
    process.env.PARISH_ID = 'gia-ton'
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete(systemSettings).where(eq(systemSettings.key, MARKER_KEY))
  })

  afterAll(() => {
    stopSundayReminderScheduler()
    delete process.env.PARISH_ID
  })

  // 2026-08-09 là Chủ Nhật; 2026-08-08 là thứ Bảy.
  const sunday = (hhmm: string) => new Date(`2026-08-09T${hhmm}:00`)

  it('không gửi nếu không phải Chúa Nhật', async () => {
    const result = await runSundayReminderCheck(new Date('2026-08-08T09:00:00'))
    expect(result).toBe(0)
    expect(notifySundayMassReminder).not.toHaveBeenCalled()
  })

  it('không gửi nếu trước giờ lễ cấu hình', async () => {
    const result = await runSundayReminderCheck(sunday('07:59'))
    expect(result).toBe(0)
    expect(notifySundayMassReminder).not.toHaveBeenCalled()
  })

  it('gửi đúng giờ lễ cấu hình (08:00) + ghi marker ngày hôm nay', async () => {
    const result = await runSundayReminderCheck(sunday('08:00'))
    expect(result).toBe(1)
    expect(notifySundayMassReminder).toHaveBeenCalledTimes(1)

    const [marker] = await db.select().from(systemSettings).where(eq(systemSettings.key, MARKER_KEY))
    expect(marker?.value).toBe('2026-08-09')
  })

  it('chỉ gửi 1 lần/Chúa Nhật (marker chặn lần 2)', async () => {
    await runSundayReminderCheck(sunday('08:00'))
    expect(notifySundayMassReminder).toHaveBeenCalledTimes(1)

    const result2 = await runSundayReminderCheck(sunday('08:30'))
    expect(result2).toBe(0)
    expect(notifySundayMassReminder).toHaveBeenCalledTimes(1)
  })

  it('quá cửa sổ 2h (>= 10:00) → bỏ qua hôm đó', async () => {
    const result = await runSundayReminderCheck(sunday('10:00'))
    expect(result).toBe(0)
    expect(notifySundayMassReminder).not.toHaveBeenCalled()
  })

  it('dùng giờ lễ từ parish settings (getSundayMassTime)', async () => {
    vi.mocked(getSundayMassTime).mockResolvedValue('09:30')
    const result = await runSundayReminderCheck(new Date('2026-08-09T09:30:00'))
    expect(result).toBe(1)
    expect(notifySundayMassReminder).toHaveBeenCalledTimes(1)
  })
})
