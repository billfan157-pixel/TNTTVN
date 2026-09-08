import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import parentsApp from '../routes/parents.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users, students, classes, branches, academicYears } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'

const PREFIX = Date.now()
// Parish riêng để không đụng dữ liệu suite khác đang seed trong 'gia-ton'
// (trước đây dùng 'gia-ton' → CI thấy đủ 2 học sinh cùng số điện thoại cha mẹ).
const parishId = `parish-parent-routes-${PREFIX}`
const parentId = `usr-parent-${PREFIX}`
const otherParentId = `usr-other-parent-${PREFIX}`
const adminUserId = `usr-admin-parent-${PREFIX}`
const branchId = `br-parent-${PREFIX}`
const yearId = `yr-parent-${PREFIX}`
const classId = `cl-parent-${PREFIX}`
const studentMineId = `st-parent-mine-${PREFIX}`
const studentOtherId = `st-parent-other-${PREFIX}`
const studentDeletedId = `st-parent-deleted-${PREFIX}`

function parentHeaders(userId: string) {
  const { accessToken } = generateTokens({ userId, username: `parent_${userId}`, role: 'phuhuynh', parishId, tokenVersion: 1 })
  return { Authorization: `Bearer ${accessToken}` }
}

function staffHeaders() {
  const { accessToken } = generateTokens({ userId: adminUserId, username: `admin_${adminUserId}`, role: 'admin', parishId, tokenVersion: 1 })
  return { Authorization: `Bearer ${accessToken}` }
}

describe('Server Parents Route (Cổng Phụ Huynh) Tests', () => {
  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(branches).values({ id: branchId, name: 'Phân Ngành Test', scarfColor: '#fff', ageMin: 8, ageMax: 12, parishId })
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-06-30', parishId })
    await db.insert(classes).values({ id: classId, code: `CL-${PREFIX}`, name: 'Lớp 1', branchId, academicYearId: yearId, parishId })
    await db.insert(users).values([
      { id: adminUserId, username: `admin_${PREFIX}`, passwordHash: 'hash', fullName: 'Admin Test', phone: '0900000000', role: 'admin', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: parentId, username: `parent_${PREFIX}`, passwordHash: 'hash', fullName: 'Phụ Huynh Test', phone: '0901 234 567', role: 'phuhuynh', parishId, status: 'ACTIVE', tokenVersion: 1 },
      { id: otherParentId, username: `other_${PREFIX}`, passwordHash: 'hash', fullName: 'Phụ Huynh Khác', phone: '0987654321', role: 'phuhuynh', parishId, status: 'ACTIVE', tokenVersion: 1 },
    ])
    await db.insert(students).values([
      { id: studentMineId, code: `ST-MINE-${PREFIX}`, holyName: 'Giuse', fullName: 'Nguyễn Văn A', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Phụ Huynh Test', parentPhone: '0901234567', address: 'X', branch: 'AuNhi', classId, parishId, status: 'Đang học', createdAt: now, updatedAt: now },
      { id: studentOtherId, code: `ST-OTHER-${PREFIX}`, holyName: 'Maria', fullName: 'Trần Thị B', gender: 'Nữ', dateOfBirth: '2015-02-02', parentName: 'Phụ Huynh Khác', parentPhone: '0987654321', address: 'Y', branch: 'AuNhi', classId, parishId, status: 'Đang học', createdAt: now, updatedAt: now },
      { id: studentDeletedId, code: `ST-DEL-${PREFIX}`, holyName: 'Anrê', fullName: 'Lê Văn C', gender: 'Nam', dateOfBirth: '2015-03-03', parentName: 'Phụ Huynh Test', parentPhone: '0901234567', address: 'Z', branch: 'AuNhi', classId, parishId, status: 'Nghỉ học', deletedAt: now, createdAt: now, updatedAt: now },
    ])
  })

  afterAll(async () => {
    await db.delete(students).where(and(eq(students.parishId, parishId), eq(students.classId, classId)))
    await db.delete(classes).where(eq(classes.id, classId))
    await db.delete(academicYears).where(eq(academicYears.id, yearId))
    await db.delete(branches).where(eq(branches.id, branchId))
    await db.delete(users).where(and(eq(users.parishId, parishId), eq(users.role, 'phuhuynh')))
    await db.delete(users).where(eq(users.id, adminUserId))
  })

  it('blocks unauthenticated GET with 401', async () => {
    const res = await parentsApp.request('/my-children')
    expect(res.status).toBe(401)
  })

  it('blocks non-parent roles with 403', async () => {
    const res = await parentsApp.request('/my-children', { headers: staffHeaders() })
    expect(res.status).toBe(403)
  })

  it('returns only the parent\'s children, matching phone after normalization', async () => {
    const res = await parentsApp.request('/my-children', { headers: parentHeaders(parentId) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe(studentMineId)
    expect(body.data[0].className).toBe('Lớp 1')
    expect(body.data[0].classCode).toBe(`CL-${PREFIX}`)
  })

  it('does not leak other parents\' children', async () => {
    const res = await parentsApp.request('/my-children', { headers: parentHeaders(otherParentId) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe(studentOtherId)
  })

  it('returns empty list when parent has no phone', async () => {
    await db.update(users).set({ phone: null }).where(eq(users.id, otherParentId))
    const res = await parentsApp.request('/my-children', { headers: parentHeaders(otherParentId) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data).toEqual([])
  })

  it.each([
    ['POST', '/telegram/link-token'],
    ['GET', '/telegram/status'],
    ['POST', '/telegram/notifications'],
    ['DELETE', '/telegram/link'],
  ] as const)('keeps the retired Telegram contract authenticated and returns 410 (%s %s)', async (method, path) => {
    const res = await parentsApp.request(path, { method, headers: parentHeaders(parentId) })
    expect(res.status).toBe(410)
    const body = (await res.json()) as any
    expect(body.error).toMatchObject({ code: 'CHANNEL_RETIRED' })
  })

  it('keeps retired Telegram endpoints fail-closed for non-parent roles', async () => {
    const res = await parentsApp.request('/telegram/status', { headers: staffHeaders() })
    expect(res.status).toBe(403)
  })
})
