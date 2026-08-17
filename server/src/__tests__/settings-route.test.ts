import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import authApp from '../routes/auth.js'
import settingsRouter from '../routes/settings.js'
import { db } from '../db/index.js'
import { users, systemSettings, auditLogs } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'

const PREFIX = Date.now()
const adminId = `usr-settings-${PREFIX}`
const adminUsername = `settings_admin_${PREFIX}`
const STRONG = 'Parish@123456'
// A-NEW-36: PK 'parish_system_settings' giờ là composite (key, parish_id) —
// test dùng đúng parish mặc định 'gia-ton' để không vướng row của suite khác.
const parishId = 'gia-ton'

async function login(username: string) {
  const res = await authApp.request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: STRONG }),
  })
  expect(res.status).toBe(200)
  const body = (await res.json()) as any
  return body.data.accessToken
}

describe('Settings — sundayMassTime', () => {
  beforeAll(async () => {
    await db.delete(systemSettings).where(eq(systemSettings.key, 'parish_system_settings'))
    await db.insert(users).values({
      id: adminId,
      username: adminUsername,
      fullName: 'Settings Admin',
      passwordHash: await bcrypt.hash(STRONG, 4),
      role: 'admin',
      parishId,
      tokenVersion: 1,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    }).onConflictDoNothing()
  })

  afterAll(async () => {
    await db.delete(systemSettings).where(eq(systemSettings.key, 'parish_system_settings'))
    await db.delete(users).where(eq(users.id, adminId))
  })

  it('GET /settings trả default sundayMassTime = 08:00', async () => {
    const token = await login(adminUsername)
    const res = await settingsRouter.request('/', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data.sundayMassTime).toBe('08:00')
  })

  it('PUT /settings cập nhật sundayMassTime + GET lại thấy giá trị mới', async () => {
    const token = await login(adminUsername)
    const put = await settingsRouter.request('/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sundayMassTime: '09:30' }),
    })
    expect(put.status).toBe(200)
    const putBody = (await put.json()) as any
    expect(putBody.data.sundayMassTime).toBe('09:30')

    const get = await settingsRouter.request('/', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    const getBody = (await get.json()) as any
    expect(getBody.data.sundayMassTime).toBe('09:30')
  })

  it('PUT với sundayMassTime sai định dạng → 400', async () => {
    const token = await login(adminUsername)
    const res = await settingsRouter.request('/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sundayMassTime: '9:30' }),
    })
    expect(res.status).toBe(400)
  })

  it('PUT /settings ghi policy audit metadata khi gradeWeights thay đổi', async () => {
    const token = await login(adminUsername)
    const res = await settingsRouter.request('/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        gradeWeights: {
          gioiThreshold: 8.5,
          roundingDecimal: 1,
        },
      }),
    })

    expect(res.status).toBe(200)

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'settings'), eq(auditLogs.entityId, 'parish_system_settings'), eq(auditLogs.parishId, parishId)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1)

    expect(audit).toBeDefined()
    const payload = JSON.parse(audit!.newValue ?? '{}')
    expect(payload.gradePolicyAudit).toBeDefined()
    expect(payload.gradePolicyAudit.changedFields).toContain('gioiThreshold')
    expect(payload.gradePolicyAudit.summary.labelBefore).toBe('Giỏi')
    expect(payload.gradePolicyAudit.summary.labelAfter).toBe('Khá')
  })
})
