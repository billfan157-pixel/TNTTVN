import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import usersApp from '../routes/users.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'

// ADR-027 (2026-08-12): POST /users tự sinh username `chức vụ_Tên thánh + Họ và tên`
// khi không truyền username; thiếu Tên Thánh/SĐT → 400; phụ huynh username = SĐT.

const PARISH = 'gia-ton'
const RECORD = `au${Date.now()}`
const adminId = `admin-${RECORD}`
const adminPassword = 'UsernameAudit@123'
const createdUsernames: string[] = []

function adminHeaders() {
  const { accessToken } = generateTokens({ userId: adminId, username: adminId, role: 'admin', parishId: PARISH, tokenVersion: 1 })
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

async function postUsers(body: Record<string, unknown>) {
  const res = await usersApp.request('/', { method: 'POST', headers: adminHeaders(), body: JSON.stringify(body) })
  const json = (await res.json()) as any
  if (res.status === 201 && json.data?.username) createdUsernames.push(json.data.username)
  return { status: res.status, body: json }
}

describe('POST /users auto-username (ADR-027)', () => {
  beforeAll(async () => {
    await db.insert(users).values({ id: adminId, username: adminId, fullName: 'Synthetic Admin', role: 'admin', parishId: PARISH, passwordHash: await bcrypt.hash(adminPassword, 4) })
  })
  afterAll(async () => {
    await db.delete(users).where(and(eq(users.parishId, PARISH), eq(users.id, adminId)))
    for (const username of createdUsernames) {
      await db.delete(users).where(and(eq(users.parishId, PARISH), eq(users.username, username)))
    }
  })

  it('không gửi username + holyName → 201, username tự sinh glv_<tênthánh+họtên>, holyName được lưu + audit ghi holyName', async () => {
    const { status, body } = await postUsers({ holyName: 'Phê-rô', fullName: `Phan Văn Bảo ${RECORD}`, role: 'phuta' })
    expect(status).toBe(201)
    expect(body.data.username).toMatch(new RegExp(`^glv_pherophanvanbaoau\\d+$`))
    const row = await db.select({ username: users.username, holyName: users.holyName, role: users.role })
      .from(users).where(eq(users.username, body.data.username)).limit(1)
    expect(row).toHaveLength(1)
    expect(row[0].holyName).toBe('Phê-rô')
    expect(row[0].role).toBe('phuta')
  })

  it('role chunhiem/admin → prefix cn_/ad_', async () => {
    const cn = await postUsers({ holyName: 'Giuse', fullName: `Trần Hoa ${RECORD}`, role: 'chunhiem' })
    expect(cn.status).toBe(201)
    expect(cn.body.data.username).toMatch(/^cn_giusetranhoa/)
    const ad = await postUsers({ holyName: 'Anna', fullName: `Nguyễn Kim ${RECORD}`, role: 'admin', adminPassword })
    expect(ad.status).toBe(201)
    expect(ad.body.data.username).toMatch(/^ad_annanguyenkim/)
  })

  it('không holyName + không username → 400 HOLY_NAME_REQUIRED (không phải 500)', async () => {
    const { status, body } = await postUsers({ fullName: `Không Tên Thánh ${RECORD}`, role: 'phuta' })
    expect(status).toBe(400)
    expect(body.error.code).toBe('HOLY_NAME_REQUIRED')
  })

  it('phuhuynh không SĐT + không username → 400 PHONE_REQUIRED', async () => {
    const { status, body } = await postUsers({ fullName: `Phụ Huynh Không SĐT ${RECORD}`, role: 'phuhuynh' })
    expect(status).toBe(400)
    expect(body.error.code).toBe('PHONE_REQUIRED')
  })

  it('phuhuynh + SĐT → username = SĐT chuẩn hóa (quy ước ADR-026)', async () => {
    const { status, body } = await postUsers({ fullName: `Phụ Huynh Có SĐT ${RECORD}`, phone: '+84 955 111 333', role: 'phuhuynh' })
    expect(status).toBe(201)
    expect(body.data.username).toBe('0955111333')
  })

  it('username override (tay) vẫn được tôn trọng dù có holyName', async () => {
    const override = `${RECORD}_custom_override`
    const { status, body } = await postUsers({ username: override, holyName: 'Giuse', fullName: `Override ${RECORD}`, role: 'phuta' })
    expect(status).toBe(201)
    expect(body.data.username).toBe(override)
  })

  it('username tự sinh trùng → 409 USERNAME_EXISTS', async () => {
    const body = { holyName: 'Phê-rô', fullName: `Trùng Username ${RECORD}`, role: 'phuta' }
    const first = await postUsers(body)
    const second = await postUsers({ ...body, phone: '0988111222' })
    expect(first.status).toBe(201)
    expect(second.status).toBe(409)
    expect(second.body.error.code).toBe('USERNAME_EXISTS')
  })
})
