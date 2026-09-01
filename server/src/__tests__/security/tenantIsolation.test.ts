import { describe, it, expect, beforeAll } from 'vitest'
import { generateTokens } from '../../middleware/auth.js'
import { db } from '../../db/index.js'
import { users, branches, academicYears, classes, students, catechistAssignments, examSessions } from '../../db/schema.js'
import studentsRouter from '../../routes/students.js'
import classesRouter from '../../routes/classes.js'
import gradesRouter from '../../routes/grades.js'
import attendanceRouter from '../../routes/attendance.js'
import examsRouter from '../../routes/exams.js'

// Plan v2 — Section C: tenantIsolation.test.ts
// Case 1: Cross-parish READ — admin A không đọc được dữ liệu giáo xứ B.
// Case 2: Cross-parish WRITE — admin/chunhiem A không ghi được vào dữ liệu giáo xứ B.
// Case 3: Class-level — chủ nhiệm lớp X1 không chạm được lớp X2 cùng giáo xứ.
// Reference-only (đã có coverage): refresh reuse detection → refresh-rotation.test.ts.

const PREFIX = Date.now()
const parishA = `sec-a-${PREFIX}`
const parishB = `sec-b-${PREFIX}`
const ayYear = `2025-${PREFIX.toString().slice(-4)}`

const adminAToken = generateTokens({ userId: `admA-${PREFIX}`, username: `admA_${PREFIX}`, role: 'admin', parishId: parishA }).accessToken
const chunhiemAToken = generateTokens({ userId: `cnA-${PREFIX}`, username: `cnA_${PREFIX}`, role: 'chunhiem', parishId: parishA }).accessToken
const parentAToken = generateTokens({ userId: `parentA-${PREFIX}`, username: `parentA_${PREFIX}`, role: 'phuhuynh', parishId: parishA }).accessToken

const jsonHeaders = { 'Content-Type': 'application/json' }

const STUDENT_B = `stB-${PREFIX}`
const STUDENT_A1 = `stA1-${PREFIX}`
const STUDENT_A2 = `stA2-${PREFIX}`

describe('Multi-Tenant Isolation & Class-Scope Security Tests (Plan v2 §5)', () => {
  beforeAll(async () => {
    // ── Users ──
    await db.insert(users).values([
      { id: `admA-${PREFIX}`, username: `admA_${PREFIX}`, fullName: 'Admin A', passwordHash: 'hash', role: 'admin', parishId: parishA },
      { id: `cnA-${PREFIX}`, username: `cnA_${PREFIX}`, fullName: 'Catechist A CN', passwordHash: 'hash', role: 'chunhiem', parishId: parishA },
      { id: `parentA-${PREFIX}`, username: `parentA_${PREFIX}`, fullName: 'Parent A', passwordHash: 'hash', role: 'phuhuynh', parishId: parishA },
    ]).onConflictDoNothing()

    // ── Branches / Academic Years ──
    await db.insert(branches).values([
      { id: `brA-${PREFIX}`, name: 'Chi Đoàn A', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: parishA },
      { id: `brB-${PREFIX}`, name: 'Chi Đoàn B', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: parishB },
    ]).onConflictDoNothing()

    await db.insert(academicYears).values([
      { id: `ayA-${PREFIX}`, startDate: '2025-09-01', endDate: '2026-05-31', parishId: parishA },
      { id: `ayB-${PREFIX}`, startDate: '2025-09-01', endDate: '2026-05-31', parishId: parishB },
    ]).onConflictDoNothing()

    // ── Classes: A1 (phân công chủ nhiệm A), A2 (không phân), B (giáo xứ B) ──
    await db.insert(classes).values([
      { id: `clA1-${PREFIX}`, code: `CLA1-${PREFIX}`, name: 'Lớp A1', branchId: `brA-${PREFIX}`, academicYearId: `ayA-${PREFIX}`, parishId: parishA },
      { id: `clA2-${PREFIX}`, code: `CLA2-${PREFIX}`, name: 'Lớp A2', branchId: `brA-${PREFIX}`, academicYearId: `ayA-${PREFIX}`, parishId: parishA },
      { id: `clB-${PREFIX}`, code: `CLB-${PREFIX}`, name: 'Lớp B', branchId: `brB-${PREFIX}`, academicYearId: `ayB-${PREFIX}`, parishId: parishB },
    ]).onConflictDoNothing()

    await db.insert(catechistAssignments).values({
      id: `asg-${PREFIX}`,
      userId: `cnA-${PREFIX}`,
      classId: `clA1-${PREFIX}`,
      roleInClass: 'chunhiem',
      parishId: parishA,
    }).onConflictDoNothing()

    // ── Students ──
    await db.insert(students).values([
      { id: STUDENT_A1, code: `STA1-${PREFIX}`, holyName: 'Giuse', fullName: 'Nguyen A1', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '0901', address: 'X', branch: 'AuNhi', classId: `clA1-${PREFIX}`, parishId: parishA },
      { id: STUDENT_A2, code: `STA2-${PREFIX}`, holyName: 'Maria', fullName: 'Nguyen A2', gender: 'Nữ', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '0902', address: 'X', branch: 'AuNhi', classId: `clA2-${PREFIX}`, parishId: parishA },
      { id: STUDENT_B, code: `STB-${PREFIX}`, holyName: 'Phanxico', fullName: 'Nguyen B', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '0903', address: 'X', branch: 'AuNhi', classId: `clB-${PREFIX}`, parishId: parishB },
    ]).onConflictDoNothing()

    // ── Exam sessions ──
    await db.insert(examSessions).values([
      { id: `exA2-${PREFIX}`, parishId: parishA, classId: `clA2-${PREFIX}`, subject: 'Toán', scoreType: 'midterm', maxScore: 10, semester: 1, academicYear: ayYear, status: 'draft', createdBy: `admA-${PREFIX}` },
      { id: `exB-${PREFIX}`, parishId: parishB, classId: `clB-${PREFIX}`, subject: 'Toán', scoreType: 'midterm', maxScore: 10, semester: 1, academicYear: ayYear, status: 'draft', createdBy: `admA-${PREFIX}` },
    ]).onConflictDoNothing()
  })

  describe('1. Cross-Parish READ — data độc lập giữa 2 giáo xứ', () => {
    it('admin A không đọc được student của giáo xứ B (404)', async () => {
      const res = await studentsRouter.request(`/${STUDENT_B}`, {
        headers: { Authorization: `Bearer ${adminAToken}` },
      })
      expect(res.status).toBe(404)
      const json = (await res.json()) as any
      expect(json.error.code).toBe('NOT_FOUND')
    })

    it('admin A không đọc được class của giáo xứ B (404)', async () => {
      const res = await classesRouter.request(`/clB-${PREFIX}`, {
        headers: { Authorization: `Bearer ${adminAToken}` },
      })
      expect(res.status).toBe(404)
    })

    it('admin A không đọc được exam session của giáo xứ B (404)', async () => {
      const res = await examsRouter.request(`/exB-${PREFIX}`, {
        headers: { Authorization: `Bearer ${adminAToken}` },
      })
      expect(res.status).toBe(404)
    })

    it('admin A GET /grades chỉ trả dữ liệu giáo xứ A — không chứa học sinh B', async () => {
      const res = await gradesRouter.request('/', {
        headers: { Authorization: `Bearer ${adminAToken}` },
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      const rows = json.data ?? []
      for (const row of rows as any[]) {
        expect(row.studentId).not.toBe(STUDENT_B)
      }
    })

    it('admin A GET /attendance?studentId=studentB → danh sách rỗng (200, 0 rows)', async () => {
      const res = await attendanceRouter.request(`/?studentId=${STUDENT_B}`, {
        headers: { Authorization: `Bearer ${adminAToken}` },
      })
      expect(res.status).toBe(200)
      const json = (await res.json()) as any
      expect(json.data ?? []).toHaveLength(0)
    })
  })

  describe('2. Cross-Parish WRITE — không ghi được dữ liệu giáo xứ B', () => {
    it('admin A không upsert được điểm cho học sinh giáo xứ B (404)', async () => {
      const res = await gradesRouter.request('/', {
        method: 'POST',
        headers: { ...jsonHeaders, Authorization: `Bearer ${adminAToken}` },
        body: JSON.stringify({ studentId: STUDENT_B, semester: 1, scoreFinal: 8.5 }),
      })
      expect(res.status).toBe(404)
    })

    it('admin A không điểm danh được học sinh giáo xứ B (404)', async () => {
      const res = await attendanceRouter.request('/', {
        method: 'POST',
        headers: { ...jsonHeaders, Authorization: `Bearer ${adminAToken}` },
        body: JSON.stringify({ studentId: STUDENT_B, date: '2025-10-05', type: 'CatechismClass', status: 'Present' }),
      })
      expect(res.status).toBe(404)
    })

    it('admin A không upsert được kết quả vào phiên exam giáo xứ B (404)', async () => {
      const res = await examsRouter.request(`/exB-${PREFIX}/results`, {
        method: 'POST',
        headers: { ...jsonHeaders, Authorization: `Bearer ${adminAToken}` },
        body: JSON.stringify({ results: [{ studentId: STUDENT_B, score: 7 }] }),
      })
      expect(res.status).toBe(404)
    })

    it('admin A không complete được phiên exam giáo xứ B (404)', async () => {
      const res = await examsRouter.request(`/exB-${PREFIX}/complete`, {
        method: 'POST',
        headers: { ...jsonHeaders, Authorization: `Bearer ${adminAToken}` },
      })
      expect(res.status).toBe(404)
    })
  })

  describe('3. Roster read / class-write scope — chủ nhiệm lớp X1', () => {
    it('phụ huynh bị chặn khỏi cả roster và student detail dành cho staff', async () => {
      const listRes = await studentsRouter.request('/?limit=100', {
        headers: { Authorization: `Bearer ${parentAToken}` },
      })
      expect(listRes.status).toBe(403)

      const detailRes = await studentsRouter.request(`/${STUDENT_A1}`, {
        headers: { Authorization: `Bearer ${parentAToken}` },
      })
      expect(detailRes.status).toBe(403)
    })

    it('chủ nhiệm A đọc được roster và chi tiết thiếu nhi của mọi lớp cùng giáo xứ', async () => {
      const listRes = await studentsRouter.request('/?limit=100', {
        headers: { Authorization: `Bearer ${chunhiemAToken}` },
      })
      expect(listRes.status).toBe(200)
      const listJson = await listRes.json() as { data: Array<{ id: string }> }
      expect(listJson.data.map(student => student.id)).toEqual(expect.arrayContaining([STUDENT_A1, STUDENT_A2]))

      const res = await studentsRouter.request(`/${STUDENT_A2}`, {
        headers: { Authorization: `Bearer ${chunhiemAToken}` },
      })
      expect(res.status).toBe(200)
      const json = await res.json() as { data: { id: string } }
      expect(json.data.id).toBe(STUDENT_A2)
    })

    it('chủ nhiệm A xem được metadata lớp khác nhưng không thấy danh sách GLV phân công', async () => {
      const res = await classesRouter.request(`/clA2-${PREFIX}`, {
        headers: { Authorization: `Bearer ${chunhiemAToken}` },
      })
      expect(res.status).toBe(200)
      const json = await res.json() as { data: Record<string, unknown> }
      expect(json.data).not.toHaveProperty('homeroomTeacher')
      expect(json.data).not.toHaveProperty('assistants')
    })

    it('class catalog chỉ đánh dấu assignment của chính tài khoản chủ nhiệm', async () => {
      const res = await classesRouter.request('/', {
        headers: { Authorization: `Bearer ${chunhiemAToken}` },
      })
      expect(res.status).toBe(200)
      const json = await res.json() as { data: Array<{ id: string; assignedToCurrentUser?: boolean }> }
      const ownClass = json.data.find(item => item.id === `clA1-${PREFIX}`)
      const otherClass = json.data.find(item => item.id === `clA2-${PREFIX}`)
      expect(ownClass?.assignedToCurrentUser).toBe(true)
      expect(otherClass?.assignedToCurrentUser).toBe(false)
    })

    it('chủ nhiệm A không upsert điểm cho student lớp không được phân công (403)', async () => {
      const res = await gradesRouter.request('/', {
        method: 'POST',
        headers: { ...jsonHeaders, Authorization: `Bearer ${chunhiemAToken}` },
        body: JSON.stringify({ studentId: STUDENT_A2, semester: 1, scoreFinal: 8.5 }),
      })
      expect(res.status).toBe(403)
    })

    it('chủ nhiệm A không điểm danh student lớp không được phân công (403)', async () => {
      const res = await attendanceRouter.request('/', {
        method: 'POST',
        headers: { ...jsonHeaders, Authorization: `Bearer ${chunhiemAToken}` },
        body: JSON.stringify({ studentId: STUDENT_A2, date: '2025-10-05', type: 'CatechismClass', status: 'Present' }),
      })
      expect(res.status).toBe(403)
    })

    it('chủ nhiệm A không xem exam session của lớp không được phân công (403)', async () => {
      const res = await examsRouter.request(`/exA2-${PREFIX}`, {
        headers: { Authorization: `Bearer ${chunhiemAToken}` },
      })
      expect(res.status).toBe(403)
    })

    it('chủ nhiệm A không tạo exam session cho lớp không được phân công (403)', async () => {
      const res = await examsRouter.request('/', {
        method: 'POST',
        headers: { ...jsonHeaders, Authorization: `Bearer ${chunhiemAToken}` },
        body: JSON.stringify({
          classId: `clA2-${PREFIX}`,
          subject: 'Toán',
          scoreType: 'midterm',
          semester: '1',
        }),
      })
      expect(res.status).toBe(403)
    })
  })
})
