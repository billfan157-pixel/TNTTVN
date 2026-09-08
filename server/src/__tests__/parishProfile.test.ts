// @vitest-environment node

import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { auditLogs, parishEvents, parishPeople, parishRecords, parishServiceTerms, users } from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'
import parishProfileRouter from '../routes/parishProfile.js'
import {
  createParishPerson,
  createParishPeople,
  createParishRecord,
  createParishTerm,
  createParishUnit,
  getParishProfileSnapshot,
  updateParishTerm,
  updateParishUnit,
} from '../services/parishProfileService.js'
import type { MutationContext } from '../types/parishProfile.js'

const app = new Hono()
app.route('/api/parish-profile', parishProfileRouter)

const PARISH_A = `profile-a-${Date.now()}`
const PARISH_B = `profile-b-${Date.now()}`
const ctx = (parishId: string, userId = `admin-${parishId}`): MutationContext => ({
  parishId,
  userId,
  ip: '127.0.0.1',
  userAgent: 'vitest',
})

const adminId = `profile-admin-${Date.now()}`
const staffId = `profile-staff-${Date.now()}`
const parentId = `profile-parent-${Date.now()}`
let adminToken = ''
let staffToken = ''
let parentToken = ''

beforeAll(async () => {
  const now = new Date().toISOString()
  await db.insert(users).values([
    { id: adminId, username: adminId, passwordHash: 'hash', fullName: 'Profile Admin', role: 'admin', status: 'ACTIVE', mustChangePassword: 0, tokenVersion: 1, parishId: PARISH_A, createdAt: now },
    { id: staffId, username: staffId, passwordHash: 'hash', fullName: 'Profile Staff', role: 'chunhiem', status: 'ACTIVE', mustChangePassword: 0, tokenVersion: 1, parishId: PARISH_A, createdAt: now },
    { id: parentId, username: parentId, passwordHash: 'hash', fullName: 'Profile Parent', role: 'phuhuynh', status: 'ACTIVE', mustChangePassword: 0, tokenVersion: 1, parishId: PARISH_A, createdAt: now },
  ]).onConflictDoNothing()
  adminToken = generateTokens({ userId: adminId, username: adminId, role: 'admin', parishId: PARISH_A, tokenVersion: 1 }).accessToken
  staffToken = generateTokens({ userId: staffId, username: staffId, role: 'chunhiem', parishId: PARISH_A, tokenVersion: 1 }).accessToken
  parentToken = generateTokens({ userId: parentId, username: parentId, role: 'phuhuynh', parishId: PARISH_A, tokenVersion: 1 }).accessToken
})

describe('ADR-081 parish profile domain boundary', () => {
  it('filters drafts/admin-only records from staff while admin retains governance view', async () => {
    const person = await createParishPerson({
      fullName: 'Trưởng Anrê A', serviceStatus: 'ACTIVE', visibility: 'STAFF',
    }, ctx(PARISH_A))
    await createParishRecord({
      recordType: 'MILESTONE', title: 'Mốc đã công bố', occurredOn: '2020-01-01',
      status: 'PUBLISHED', visibility: 'STAFF', showOnTimeline: true, personIds: [person.id], assetIds: [],
    }, ctx(PARISH_A))
    await createParishRecord({
      recordType: 'ACTIVITY', title: 'Bản nháp nội bộ', occurredOn: '2021-01-01',
      status: 'DRAFT', visibility: 'STAFF', showOnTimeline: true, personIds: [], assetIds: [],
    }, ctx(PARISH_A))
    await createParishRecord({
      recordType: 'ACHIEVEMENT', title: 'Bản chỉ Admin', occurredOn: '2022-01-01',
      status: 'PUBLISHED', visibility: 'ADMIN', showOnTimeline: true, personIds: [], assetIds: [],
    }, ctx(PARISH_A))

    const admin = await getParishProfileSnapshot(PARISH_A, 'admin')
    const staff = await getParishProfileSnapshot(PARISH_A, 'chunhiem')
    expect(admin.records.map(record => record.title)).toEqual(expect.arrayContaining(['Mốc đã công bố', 'Bản nháp nội bộ', 'Bản chỉ Admin']))
    expect(staff.records.map(record => record.title)).toContain('Mốc đã công bố')
    expect(staff.records.map(record => record.title)).not.toEqual(expect.arrayContaining(['Bản nháp nội bộ', 'Bản chỉ Admin']))
    expect(staff.timeline.every(item => item.title !== 'Bản nháp nội bộ')).toBe(true)
    expect(staff.accounts).toEqual([])
    expect(admin.accounts.some(account => account.id === staffId)).toBe(true)
  })

  it('rejects cross-parish references atomically and leaves no partial record', async () => {
    const otherPerson = await createParishPerson({
      fullName: 'Nhân sự Parish B', serviceStatus: 'ACTIVE', visibility: 'STAFF',
    }, ctx(PARISH_B))
    const title = `Cross tenant ${Date.now()}`

    await expect(createParishRecord({
      recordType: 'ACTIVITY', title, occurredOn: '2026-08-31', status: 'PUBLISHED',
      visibility: 'STAFF', showOnTimeline: true, personIds: [otherPerson.id], assetIds: [],
    }, ctx(PARISH_A))).rejects.toMatchObject({ status: 404, code: 'PARISH_PERSON_REFERENCE_INVALID' })

    const rows = await db.select().from(parishRecords).where(and(eq(parishRecords.parishId, PARISH_A), eq(parishRecords.title, title)))
    expect(rows).toHaveLength(0)
  })

  it('rejects a source calendar event from another parish', async () => {
    const eventId = `EVT-CROSS-${Date.now()}`
    await db.insert(parishEvents).values({ id: eventId, parishId: PARISH_B, date: '2026-08-31', title: 'Sự kiện tenant B', category: 'OTHER' })
    await expect(createParishRecord({
      recordType: 'ACTIVITY', title: 'Liên kết sự kiện sai tenant', occurredOn: '2026-08-31', status: 'DRAFT',
      visibility: 'STAFF', showOnTimeline: false, sourceEventId: eventId, personIds: [], assetIds: [],
    }, ctx(PARISH_A))).rejects.toMatchObject({ status: 404, code: 'PARISH_SOURCE_EVENT_INVALID' })
  })

  it('rejects a linked account from another parish', async () => {
    await expect(createParishPerson({
      linkedUserId: adminId,
      fullName: 'Liên kết sai tenant',
      serviceStatus: 'ACTIVE',
      visibility: 'STAFF',
    }, ctx(PARISH_B))).rejects.toMatchObject({ status: 404, code: 'PARISH_LINKED_USER_INVALID' })
  })

  it('keeps one organization identity per linked account', async () => {
    await createParishPerson({ linkedUserId: staffId, fullName: 'Hồ sơ duy nhất', serviceStatus: 'ACTIVE', visibility: 'STAFF' }, ctx(PARISH_A))
    await expect(createParishPerson({
      linkedUserId: staffId, fullName: 'Hồ sơ bị trùng', serviceStatus: 'ACTIVE', visibility: 'STAFF',
    }, ctx(PARISH_A))).rejects.toMatchObject({ status: 409, code: 'PARISH_LINKED_USER_DUPLICATE' })
  })

  it('rolls back an entire personnel batch when one linked account is invalid', async () => {
    const marker = `Atomic batch ${Date.now()}`
    await expect(createParishPeople([
      { fullName: `${marker} valid`, serviceStatus: 'ACTIVE', visibility: 'STAFF' },
      { linkedUserId: adminId, fullName: `${marker} invalid`, serviceStatus: 'ACTIVE', visibility: 'STAFF' },
    ], ctx(PARISH_B))).rejects.toMatchObject({ status: 404, code: 'PARISH_LINKED_USER_INVALID' })

    const rows = await db.select().from(parishPeople).where(and(
      eq(parishPeople.parishId, PARISH_B),
      eq(parishPeople.fullName, `${marker} valid`),
    ))
    expect(rows).toHaveLength(0)
  })

  it('rejects organization cycles and keeps audit payloads free of biography values', async () => {
    const root = await createParishUnit({ name: 'Ban Trị Sự', unitType: 'BOARD', sortOrder: 0, isActive: true }, ctx(PARISH_A))
    const child = await createParishUnit({ parentId: root.id, name: 'Ban Nghiên Huấn', unitType: 'COMMITTEE', sortOrder: 1, isActive: true }, ctx(PARISH_A))
    await expect(updateParishUnit(root.id, {
      parentId: child.id, name: root.name, unitType: root.unitType, sortOrder: 0, isActive: true,
    }, ctx(PARISH_A))).rejects.toMatchObject({ status: 409, code: 'PARISH_UNIT_CYCLE' })

    const person = await createParishPerson({
      fullName: 'Tên riêng không được log', biography: 'Tiểu sử không được log', serviceStatus: 'FORMER', visibility: 'ADMIN',
    }, ctx(PARISH_A))
    const [audit] = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, PARISH_A), eq(auditLogs.entityType, 'parish_person'), eq(auditLogs.entityId, person.id),
    )).limit(1)
    expect(audit?.newValue).not.toContain('Tên riêng không được log')
    expect(audit?.newValue).not.toContain('Tiểu sử không được log')
  })

  it('stores an explicit Operations position code and rejects a code/unit mismatch', async () => {
    const branch = await createParishUnit({ name: `Ngành quyền ${Date.now()}`, unitType: 'BRANCH', sortOrder: 2, isActive: true }, ctx(PARISH_A))
    const person = await createParishPerson({ fullName: `Trưởng ngành ${Date.now()}`, serviceStatus: 'ACTIVE', visibility: 'STAFF' }, ctx(PARISH_A))

    await expect(createParishTerm({
      personId: person.id,
      unitId: branch.id,
      positionTitle: 'Trưởng ban ghi nhầm phạm vi',
      positionCode: 'COMMITTEE_LEADER',
      startDate: '2026-01-01',
    }, ctx(PARISH_A))).rejects.toMatchObject({ status: 400, code: 'PARISH_POSITION_SCOPE_MISMATCH' })

    let databaseError: unknown
    try {
      await db.insert(parishServiceTerms).values({
        id: `TERM-MISMATCH-${Date.now()}`,
        parishId: PARISH_A,
        personId: person.id,
        unitId: branch.id,
        positionTitle: 'Bypass service validation',
        positionCode: 'COMMITTEE_LEADER',
        startDate: '2026-01-01',
        createdBy: adminId,
        updatedBy: adminId,
      })
    } catch (error) {
      databaseError = error
    }
    const databaseErrorChain: string[] = []
    let currentError = databaseError
    while (currentError instanceof Error) {
      databaseErrorChain.push(currentError.message)
      currentError = currentError.cause
    }
    expect(databaseErrorChain.join(' ')).toContain('PARISH_POSITION_SCOPE_MISMATCH')

    const term = await createParishTerm({
      personId: person.id,
      unitId: branch.id,
      positionTitle: 'Phụ trách Ngành Thiếu',
      positionCode: 'BRANCH_LEADER',
      startDate: '2026-01-01',
    }, ctx(PARISH_A))
    expect(term.positionCode).toBe('BRANCH_LEADER')

    const updated = await updateParishTerm(term.id, {
      personId: person.id,
      unitId: branch.id,
      positionTitle: 'Phụ trách Ngành Thiếu — cập nhật tên hiển thị',
      startDate: '2026-01-01',
    }, ctx(PARISH_A))
    expect(updated.positionCode).toBe('BRANCH_LEADER')
  })
})

describe('ADR-081 parish profile HTTP RBAC and upload guards', () => {
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

  it('allows staff read, denies staff writes, and denies parent access entirely', async () => {
    expect((await app.request('/api/parish-profile', { headers: auth(staffToken) })).status).toBe(200)
    expect((await app.request('/api/parish-profile/people', {
      method: 'POST', headers: { ...auth(staffToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Không được tạo', serviceStatus: 'ACTIVE', visibility: 'STAFF' }),
    })).status).toBe(403)
    expect((await app.request('/api/parish-profile', { headers: auth(parentToken) })).status).toBe(403)
  })

  it('rejects an image whose bytes do not match the declared MIME before storage', async () => {
    const boundary = `----parish-profile-${Date.now()}`
    const fields = [
      ['assetType', 'IMAGE'], ['title', 'Ảnh giả'], ['visibility', 'STAFF'], ['recordIds', '[]'],
    ].map(([name, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`).join('')
    const multipart = Buffer.concat([
      Buffer.from(fields),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fake.png"\r\nContent-Type: image/png\r\n\r\n`),
      Buffer.from('not-a-real-png'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    const response = await app.request('/api/parish-profile/assets/upload', {
      method: 'POST', headers: { ...auth(adminToken), 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: new Uint8Array(multipart),
    })
    const json = await response.json() as { error: { code: string } }
    expect(response.status, JSON.stringify(json)).toBe(400)
    expect(json.error.code).toBe('ARCHIVE_SIGNATURE_MISMATCH')
  })

  it('rejects non-http external schemes', async () => {
    const response = await app.request('/api/parish-profile/assets/external', {
      method: 'POST', headers: { ...auth(adminToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetType: 'VIDEO', title: 'Liên kết nguy hiểm', visibility: 'STAFF', recordIds: [], externalUrl: 'javascript:alert(1)',
      }),
    })
    expect(response.status).toBe(400)
  })

  it('creates an admin-managed person through the mounted route', async () => {
    const response = await app.request('/api/parish-profile/people', {
      method: 'POST', headers: { ...auth(adminToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Trưởng Giuse Route', serviceStatus: 'ACTIVE', visibility: 'STAFF' }),
    })
    expect(response.status).toBe(201)
    const json = await response.json() as { data: { id: string } }
    const rows = await db.select().from(parishPeople).where(and(eq(parishPeople.parishId, PARISH_A), eq(parishPeople.id, json.data.id)))
    expect(rows).toHaveLength(1)
  })

  it('creates a validated personnel batch atomically and enforces the 100-row boundary', async () => {
    const marker = `Route batch ${Date.now()}`
    const response = await app.request('/api/parish-profile/people/import', {
      method: 'POST', headers: { ...auth(adminToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ people: [
        { fullName: `${marker} A`, serviceStatus: 'ACTIVE', visibility: 'STAFF' },
        { fullName: `${marker} B`, serviceStatus: 'FORMER', visibility: 'STAFF' },
      ] }),
    })
    expect(response.status).toBe(201)
    const rows = await db.select().from(parishPeople).where(eq(parishPeople.parishId, PARISH_A))
    expect(rows.filter(row => row.fullName.startsWith(marker))).toHaveLength(2)

    const tooLarge = await app.request('/api/parish-profile/people/import', {
      method: 'POST', headers: { ...auth(adminToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ people: Array.from({ length: 101 }, (_, index) => ({
        fullName: `${marker} overflow ${index}`, serviceStatus: 'ACTIVE', visibility: 'STAFF',
      })) }),
    })
    expect(tooLarge.status).toBe(400)
  })
})
