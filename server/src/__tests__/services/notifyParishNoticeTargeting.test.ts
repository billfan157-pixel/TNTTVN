import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

vi.mock('../../services/notificationQueue.js', () => ({
  enqueueNotification: vi.fn(),
}))

import { enqueueNotification } from '../../services/notificationQueue.js'
import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

// Staff notices use explicit tenant-scoped Web/Native Push targets and never
// degrade to a parish-wide broadcast.
const PREFIX = Date.now()
const parishA = `parish-tg-a-${PREFIX}`
const parishB = `parish-tg-b-${PREFIX}`
const staffA = `usr-tg-a-${PREFIX}`
const staffB = `usr-tg-b-${PREFIX}`

function appPushCalls() {
  return vi.mocked(enqueueNotification).mock.calls.filter((call) => call[0] === 'webpush')
}

function appPushOptions() {
  return appPushCalls().map((call) => call[6] as { webpushUserIds?: string[] } | undefined)
}

describe('notifyParishNotice staff app-push targeting', () => {
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

  it('mọi staff enqueue mang webpushUserIds đúng tenant — không broadcast', async () => {
    const { notifyParishNotice } = await import('../../services/smartNotifications.js')
    const sent = await notifyParishNotice(parishA, 'Thông báo A', 'Nội dung A', 'Admin', 'All')

    const calls = appPushCalls()
    expect(calls).toHaveLength(1)
    for (const options of appPushOptions()) {
      expect(options?.webpushUserIds).toBeDefined()
      expect(options?.webpushUserIds?.length).toBeGreaterThan(0)
    }
    expect(appPushOptions()[0]?.webpushUserIds).toContain(staffA)
    expect(sent).toBe(1)
  })

  it('staff giáo xứ khác không lọt vào target IDs', async () => {
    const { notifyParishNotice } = await import('../../services/smartNotifications.js')
    await notifyParishNotice(parishA, 'Thông báo A', 'Nội dung A', 'Admin', 'All')

    const allTargeted = appPushOptions().flatMap((o) => o?.webpushUserIds ?? [])
    expect(allTargeted).toContain(staffA)
    expect(allTargeted).not.toContain(staffB)
  })
})
