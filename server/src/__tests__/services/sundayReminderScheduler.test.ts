import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { db } from '../../db/index.js'
import { systemSettings } from '../../db/schema.js'
import { and, eq, inArray } from 'drizzle-orm'

vi.mock('../../services/smartNotifications.js', () => ({
  notifySundayMassReminder: vi.fn().mockResolvedValue(undefined),
  getSundayMassTime: vi.fn().mockResolvedValue('08:00'),
}))

import { runSundayReminderCheck, runSundayReminderForParish, stopSundayReminderScheduler } from '../../services/sundayReminderScheduler.js'
import { notifySundayMassReminder, getSundayMassTime } from '../../services/smartNotifications.js'

const MARKER_KEY = 'sunday_reminder_last_sent'
const SETTINGS_KEY = 'parish_system_settings'
const PARISH_A = 'parish-sunday-a'
const PARISH_B = 'parish-sunday-b'

async function putSettings(parishId: string, enabled: boolean, sundayMassTime = '08:00'): Promise<void> {
  await db.insert(systemSettings).values({
    key: SETTINGS_KEY,
    parishId,
    value: JSON.stringify({ sundayReminderEnabled: enabled, sundayMassTime }),
  }).onConflictDoUpdate({
    target: [systemSettings.key, systemSettings.parishId],
    set: { value: JSON.stringify({ sundayReminderEnabled: enabled, sundayMassTime }) },
  })
}

describe('sundayReminderScheduler — multi-parish opt-in', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(getSundayMassTime).mockResolvedValue('08:00')
    vi.mocked(notifySundayMassReminder).mockResolvedValue(undefined)
    await db.delete(systemSettings).where(and(
      inArray(systemSettings.key, [MARKER_KEY, SETTINGS_KEY]),
      inArray(systemSettings.parishId, [PARISH_A, PARISH_B]),
    ))
    await putSettings(PARISH_A, true)
  })

  afterAll(async () => {
    await stopSundayReminderScheduler()
    await db.delete(systemSettings).where(and(
      inArray(systemSettings.key, [MARKER_KEY, SETTINGS_KEY]),
      inArray(systemSettings.parishId, [PARISH_A, PARISH_B]),
    ))
  })

  const sunday = (hhmm: string) => new Date(`2026-08-09T${hhmm}:00`)

  it('does not enumerate or send outside Sunday', async () => {
    await expect(runSundayReminderCheck(new Date('2026-08-08T09:00:00'))).resolves.toEqual({ checked: 0, sent: 0, failed: 0, failures: [] })
    expect(notifySundayMassReminder).not.toHaveBeenCalled()
  })

  it('checks opted-in parish but skips before its configured time', async () => {
    await expect(runSundayReminderCheck(sunday('07:59'))).resolves.toMatchObject({ checked: 1, sent: 0, failed: 0 })
  })

  it('sends and writes a tenant-scoped marker only once', async () => {
    await expect(runSundayReminderCheck(sunday('08:00'))).resolves.toMatchObject({ checked: 1, sent: 1, failed: 0 })
    await expect(runSundayReminderCheck(sunday('08:30'))).resolves.toMatchObject({ checked: 1, sent: 0, failed: 0 })
    expect(notifySundayMassReminder).toHaveBeenCalledTimes(1)
    expect(notifySundayMassReminder).toHaveBeenCalledWith(PARISH_A)

    const [marker] = await db.select().from(systemSettings).where(and(eq(systemSettings.key, MARKER_KEY), eq(systemSettings.parishId, PARISH_A)))
    expect(marker?.value).toBe('2026-08-09')
  })

  it('skips after the two-hour window', async () => {
    await expect(runSundayReminderCheck(sunday('10:00'))).resolves.toMatchObject({ checked: 1, sent: 0, failed: 0 })
  })

  it('enumerates two opted-in parishes with distinct time and marker state', async () => {
    await putSettings(PARISH_B, true, '09:30')
    vi.mocked(getSundayMassTime).mockImplementation(async (parishId) => parishId === PARISH_B ? '09:30' : '08:00')

    await expect(runSundayReminderCheck(sunday('08:00'))).resolves.toMatchObject({ checked: 2, sent: 1, failed: 0 })
    expect(notifySundayMassReminder).toHaveBeenCalledWith(PARISH_A)
    expect(notifySundayMassReminder).not.toHaveBeenCalledWith(PARISH_B)

    await expect(runSundayReminderCheck(sunday('09:30'))).resolves.toMatchObject({ checked: 2, sent: 1, failed: 0 })
    expect(notifySundayMassReminder).toHaveBeenCalledWith(PARISH_B)

    const markers = await db.select().from(systemSettings).where(and(eq(systemSettings.key, MARKER_KEY), inArray(systemSettings.parishId, [PARISH_A, PARISH_B])))
    expect(new Set(markers.map((marker) => marker.parishId))).toEqual(new Set([PARISH_A, PARISH_B]))
  })

  it('isolates one parish failure and continues the next parish', async () => {
    await putSettings(PARISH_B, true)
    vi.mocked(notifySundayMassReminder).mockImplementation(async (parishId) => {
      if (parishId === PARISH_A) throw new Error('provider unavailable for parish A')
    })

    const result = await runSundayReminderCheck(sunday('08:00'))
    expect(result).toEqual({ checked: 2, sent: 1, failed: 1, failures: [{ parishId: PARISH_A, reason: 'provider unavailable for parish A' }] })

    const [markerA] = await db.select().from(systemSettings).where(and(eq(systemSettings.key, MARKER_KEY), eq(systemSettings.parishId, PARISH_A)))
    const [markerB] = await db.select().from(systemSettings).where(and(eq(systemSettings.key, MARKER_KEY), eq(systemSettings.parishId, PARISH_B)))
    expect(markerA).toBeUndefined()
    expect(markerB?.value).toBe('2026-08-09')
  })

  it('does not enumerate a settings row without explicit opt-in', async () => {
    await putSettings(PARISH_A, false)
    await expect(runSundayReminderCheck(sunday('08:00'))).resolves.toEqual({ checked: 0, sent: 0, failed: 0, failures: [] })
    expect(notifySundayMassReminder).not.toHaveBeenCalled()
  })

  it('per-parish runner remains available for deterministic composition tests', async () => {
    await expect(runSundayReminderForParish(PARISH_A, sunday('08:00'))).resolves.toBe(1)
  })
})
