import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { createHash } from 'crypto'
import backupRouter from '../../routes/backup.js'
import { db } from '../../db/index.js'
import { users, students, classes, grades, branches, academicYears, auditLogs } from '../../db/schema.js'
import { generateTokens } from '../../middleware/auth.js'
import { eq } from 'drizzle-orm'

/**
 * A-NEW-25 (2026-08-11): export serialize data ĐÚNG MỘT LẦN (body là JSON hợp lệ,
 * checksum khớp re-serialize, header đúng) — trước đây double stringify làm peak
 * memory ≈ 2× dataset.
 * A-NEW-26 (2026-08-11): restore — preflight row cap (400 trước khi chạm dữ liệu),
 * bulk upsert chạy đúng với snapshot lớn (nhiều batch 100 rows), atomicity giữ nguyên.
 */

const PREFIX = `SCALE-${Date.now()}`
const PARISH = `parish-${PREFIX}`
const ADMIN_ID = `USR-${PREFIX}`
const ADMIN_PASSWORD = 'ScaleAdmin@123'
const BRANCH_ID = `BR-${PREFIX}`
const AY_ID = `AY-${PREFIX}`
const CLASS_ID = `CLS-${PREFIX}`

const { accessToken } = generateTokens({
  userId: ADMIN_ID,
  username: `scale_${PREFIX}`,
  role: 'admin',
  parishId: PARISH,
  tokenVersion: 1,
})
const authHeaders = { Authorization: `Bearer ${accessToken}` }

function sha256(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex')
}

function dataPayload(students: any[], grades: any[], classes: any[]) {
  return {
    students,
    grades,
    attendance: [],
    classes,
    semesterLocks: [],
    gradeOverrides: [],
    promotionSnapshots: [],
    examSessions: [],
    examResults: [],
  }
}

function buildRestoreBody(students: any[], grades: any[], classes: any[]) {
  const data = dataPayload(students, grades, classes)
  return {
    adminPassword: ADMIN_PASSWORD,
    parish: PARISH,
    version: '2.0-production',
    exportedAt: new Date().toISOString(),
    checksum: sha256(data),
    data,
  }
}

function post(path: string, body: unknown) {
  return backupRouter.request(path, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const classRow = { id: CLASS_ID, code: `A1-${PREFIX}`, name: 'Lớp SCALE', branchId: BRANCH_ID, academicYearId: AY_ID, parishId: PARISH }

function studentRow(i: number) {
  return {
    id: `ST-S-${i}`,
    code: `SC-${i}`,
    holyName: 'Gioan',
    fullName: `Học Sinh ${i}`,
    gender: 'Nam',
    dateOfBirth: '2015-01-01',
    parentName: 'Bố',
    parentPhone: `09000000${String(i % 10)}`,
    address: `Xã ${i}`,
    branch: 'AuNhi',
    classId: CLASS_ID,
    status: 'Đang học',
    parishId: PARISH,
  } as const
}

function gradeRow(i: number) {
  return {
    id: `GR-S-${i}`,
    studentId: `ST-S-${i}`,
    academicYear: '2025-2026',
    semester: 2,
    scoreFinal: 8.5,
    parishId: PARISH,
  }
}

describe('A-NEW-25/26 — export single-serialization + restore scale (bulk, cap)', () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 4)
    await db.insert(users).values({
      id: ADMIN_ID,
      username: `scale_${PREFIX}`,
      passwordHash,
      fullName: 'Admin SCALE',
      role: 'admin',
      parishId: PARISH,
      status: 'ACTIVE',
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    })
    await db.insert(branches).values({ id: BRANCH_ID, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: PARISH })
    await db.insert(academicYears).values({ id: AY_ID, startDate: '2025-09-01', endDate: '2026-05-31', parishId: PARISH })
    await db.insert(classes).values(classRow)
  })

  afterAll(async () => {
    await db.delete(grades).where(eq(grades.parishId, PARISH))
    await db.delete(students).where(eq(students.parishId, PARISH))
    await db.delete(classes).where(eq(classes.parishId, PARISH))
    await db.delete(users).where(eq(users.id, ADMIN_ID))
    await db.delete(auditLogs).where(eq(auditLogs.userId, ADMIN_ID))
  })

  it('A-NEW-25: export trả body JSON hợp lệ — data parse nguyên vẹn, checksum khớp re-serialize, header đúng', async () => {
    await db.insert(students).values([
      { ...studentRow(1), id: `ST-X1`, code: `SC-X1` },
      { ...studentRow(2), id: `ST-X2`, code: `SC-X2` },
    ])

    const res = await post('/export', { adminPassword: ADMIN_PASSWORD })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('content-disposition')).toContain('parish-lms-backup-')

    const body = JSON.parse(await res.text())
    expect(body.version).toBe('2.1-question-bank')
    expect(body.parish).toBe(PARISH)
    expect(body.counts.students).toBe(2)
    expect(body.data.students).toHaveLength(2)

    // checksum contract: hash của re-serialize data phải khớp checksum trong file
    expect(body.checksum).toBe(createHash('sha256').update(JSON.stringify(body.data)).digest('hex'))
  })

  it('A-NEW-26: restore bulk 300 students + 300 grades (3 batch 100) → 200 + verified, count thực tế đúng', async () => {
    const studentsArr = Array.from({ length: 300 }, (_, i) => studentRow(i))
    const gradesArr = Array.from({ length: 300 }, (_, i) => gradeRow(i))
    const res = await post('/restore', buildRestoreBody(studentsArr, gradesArr, [classRow]))
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.success).toBe(true)
    expect(json.verified).toBe(true)
    expect(json.counts.students).toBe(300)
    expect((await db.select().from(students).where(eq(students.parishId, PARISH))).length).toBe(300)
    expect((await db.select().from(grades).where(eq(grades.parishId, PARISH))).length).toBe(300)
  })

  it('A-NEW-26: preflight cap — payload trên 200.000 rows → 400 trước khi chạm dữ liệu', async () => {
    const huge = Array.from({ length: 200_001 }, (_, i) => ({ id: `HUGE-${i}` }))
    const res = await post('/restore', buildRestoreBody(huge, [], []))
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.error).toContain('quá lớn')
    // dữ liệu của test trước không bị đụng (preflight trước transaction)
    expect((await db.select().from(students).where(eq(students.parishId, PARISH))).length).toBe(300)
  })
})
