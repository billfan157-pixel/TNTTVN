import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

vi.mock('../../services/notificationQueue.js', () => ({
  enqueueNotification: vi.fn(),
}))

import { enqueueNotification } from '../../services/notificationQueue.js'
import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

// P0-02 (Phase 0 containment): staff telegram của notifyParishNotice KHÔNG được
// fallback về global ADMIN_CHAT_ID broadcast. Mỗi enqueue telegram phải mang
// telegramUserIds scope đúng tenant; user giáo xứ khác không bao giờ lọt vào.
const PREFIX = Date.now()
const parishA = `parish-tg-a-${PREFIX}`
const parishB = `parish-tg-b-${PREFIX}`
const staffA = `usr-tg-a-${PREFIX}`
const staffB = `usr-tg-b-${PREFIX}`

function telegramCalls() {
  return vi.mocked(enqueueNotification).mock.calls.filter((call) => call[0] === 'telegram')
}

function telegramOptions() {
  return telegramCalls().map((call) => call[6] as { telegramUserIds?: string[] } | undefined)
}

describe('P0-02: notifyParishNotice staff telegram targeting', () => {
  beforeAll(async () => {
    await db.insert(users).values([
      { id: staffA, username: `tg_a_${PREFIX}`, passwordHash: 'hash', fullName: 'GLV Parish A', phone: '0901000001', role: 'phuta', parishId: parishA, status: 'ACTIVE', tokenVersion: 1 },
      { id: staffB, username: `tg_b_${PREFIX}`, passwordHash: 'hash', fullName: 'GLV Parish B', phone: '0901000002', role: 'chunhiem', parishId: parishB, status: 'ACTIVE', tokenVersion: 1 },
    ])
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, staffA))
    await db.delete(users).where(eq(users.id, staffB))
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mọi telegram enqueue mang telegramUserIds đúng tenant — không broadcast', async () => {
    const { notifyParishNotice } = await import('../../services/smartNotifications.js')
    const sent = await notifyParishNotice(parishA, 'Thông báo A', 'Nội dung A', 'Admin', 'All')

    const calls = telegramCalls()
    expect(calls).toHaveLength(1)
    // Fail-closed: không tồn tại telegram call nào thiếu target IDs.
    for (const options of telegramOptions()) {
      expect(options?.telegramUserIds).toBeDefined()
      expect(options?.telegramUserIds?.length).toBeGreaterThan(0)
    }
    expect(telegramOptions()[0]?.telegramUserIds).toContain(staffA)
    expect(sent).toBe(1)
  })

  it('staff giáo xứ khác không lọt vào target IDs', async () => {
    const { notifyParishNotice } = await import('../../services/smartNotifications.js')
    await notifyParishNotice(parishA, 'Thông báo A', 'Nội dung A', 'Admin', 'All')

    const allTargeted = telegramOptions().flatMap((o) => o?.telegramUserIds ?? [])
    expect(allTargeted).toContain(staffA)
    expect(allTargeted).not.toContain(staffB)
  })
})
