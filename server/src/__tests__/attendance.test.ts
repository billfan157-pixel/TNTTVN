import { describe, it, expect, beforeAll } from 'vitest'
import { Hono } from 'hono'
import attendanceRouter from '../routes/attendance.js'
import { db } from '../db/index.js'
import { attendance, branches, classes, academicYears, catechistAssignments, students, users } from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'
import { eq, and } from 'drizzle-orm'

const attendanceApp = new Hono().route('/api/attendance', attendanceRouter)

const jsonHeaders = { 'Content-Type': 'application/json' }

describe('Server Attendance Route Handler Tests', () => {
  it('blocks unauthenticated GET / with 401', async () => {
    const res = await attendanceApp.request('/api/attendance')
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST / with 401', async () => {
    const res = await attendanceApp.request('/api/attendance', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ studentId: 'ST-001', date: '2025-09-01', type: 'CatechismClass', status: 'Present' }),
    })
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST /batch with 401', async () => {
    const res = await attendanceApp.request('/api/attendance/batch', { method: 'POST' })
    expect(res.status).toBe(401)
  })
})

/**
 * BIZ-ATT (2026-10-18): `EucharisticAdoration` (Chầu Thánh Thể / Sinh hoạt xứ
 * đoàn) là loại buổi thứ BA theo BUSINESS_RULES §2.2 (ADR-033/ADR-034) và đã có
 * mặt ở UI, báo cáo 3 trụ cột, analytics, leave-request, schema.
 *
 * Regression thật: enum zod của đường GHI chỉ nhận 2 loại → bấm "Chầu" trả 400
 * (dead end). Test dưới đây gọi đúng HTTP route thật nên sẽ đỏ nếu enum bị thu hẹp
 * lại — và cũng chứng minh DB/UNIQUE/service chấp nhận loại thứ ba.
 */
describe('Attendance — ghi nhận buổi Chầu Thánh Thể (EucharisticAdoration)', () => {
  const parishId = 'parish-att-euch'
  const userId = 'usr-att-euch'
  const username = 'att_euch'
  const classId = 'cl-att-euch'
  const branchId = 'br-att-euch'
  const academicYear = '2025-2026'
  const studentId = 'st-att-euch-01'
  const date = '2025-10-05'

  let token: string

  beforeAll(async () => {
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: academicYear, startDate: '2025-08-01', endDate: '2026-05-31', isLocked: 0, status: 'OPEN', currentSemester: 1, parishId }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, code: 'CL-AE', name: 'Lớp Chầu', branchId, academicYearId: academicYear, parishId }).onConflictDoNothing()
    await db.insert(users).values({
      id: userId,
      username,
      fullName: 'Teacher Eucharistic',
      passwordHash: 'hash',
      role: 'chunhiem',
      parishId,
    }).onConflictDoNothing()
    await db.insert(catechistAssignments).values({ id: `asg-${userId}`, userId, classId, roleInClass: 'chunhiem', parishId }).onConflictDoNothing()
    await db.insert(students).values({
      id: studentId,
      code: 'ST-AE-01',
      holyName: 'Teresa',
      fullName: 'Nguyen Thi Euch',
      gender: 'Nữ',
      dateOfBirth: '2015-01-01',
      parentName: 'P',
      parentPhone: '000',
      address: 'X',
      branch: 'AuNhi',
      classId,
      parishId,
    }).onConflictDoNothing()

    await db.delete(attendance).where(and(eq(attendance.parishId, parishId), eq(attendance.studentId, studentId)))

    const { accessToken } = generateTokens({ userId, username, role: 'chunhiem', parishId, tokenVersion: 1 })
    token = accessToken
  })

  it('POST / nhận type=EucharisticAdoration → 201 và persist đúng loại buổi', async () => {
    const res = await attendanceApp.request('/api/attendance', {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ studentId, date, type: 'EucharisticAdoration', status: 'Present' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as any
    expect(body.data.type).toBe('EucharisticAdoration')
    expect(body.data.status).toBe('Present')

    const rows = await db.select().from(attendance).where(and(eq(attendance.parishId, parishId), eq(attendance.studentId, studentId)))
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('EucharisticAdoration')
  })

  it('POST /batch nhận type=EucharisticAdoration → ghi thành công (không 400)', async () => {
    // Ngày KHÁC bản ghi đã tạo ở test trên: cùng (học sinh, ngày, loại buổi) mà
    // không gửi version sẽ là conflict theo ADR-016 (đúng thiết kế OCC), không
    // phải lỗi enum. Test này cô lập đúng thứ cần chứng minh: enum + đường ghi batch.
    const batchDate = '2025-10-12'
    const res = await attendanceApp.request('/api/attendance/batch', {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ date: batchDate, type: 'EucharisticAdoration', records: [{ studentId, status: 'AbsentExcused', note: 'Bận' }] }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.data.successCount).toBe(1)
    expect(body.data.errorCount).toBe(0)
    expect(body.data.conflictCount).toBe(0)

    const rows = await db.select().from(attendance).where(and(eq(attendance.parishId, parishId), eq(attendance.studentId, studentId), eq(attendance.date, batchDate)))
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('EucharisticAdoration')
    expect(rows[0].status).toBe('AbsentExcused')
  })

  it('GET / lọc được theo type=EucharisticAdoration (đọc lại cả bản ghi đơn và batch)', async () => {
    const res = await attendanceApp.request(`/api/attendance?studentId=${studentId}&type=EucharisticAdoration`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data).toHaveLength(2)
    expect(body.data.every((row: any) => row.type === 'EucharisticAdoration')).toBe(true)
  })

  it('vẫn từ chối loại buổi không thuộc BUSINESS_RULES §2.2', async () => {
    const res = await attendanceApp.request('/api/attendance', {
      method: 'POST',
      headers: { ...jsonHeaders, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ studentId, date, type: 'Retreat', status: 'Present' }),
    })
    expect(res.status).toBe(400)
  })
})
