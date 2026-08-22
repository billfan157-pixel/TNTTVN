import { describe, it, expect, beforeAll } from 'vitest'
import reportingRouter from '../../routes/reporting.js'
import { db } from '../../db/index.js'
import { users, students, classes, branches, academicYears, grades } from '../../db/schema.js'
import { generateId } from '../../utils/id.js'
import { generateTokens } from '../../middleware/auth.js'

// REPRO-400: Production scenario — DB chỉ có năm học cũ ('2025-2026'),
// phụ huynh truy cập phiếu điểm với academicYear=2026-2027 (năm học mới theo lịch).
describe('REPRO parent report-card academicYear=2026-2027 (DB only has 2025-2026)', () => {
  const parishId = 'parish-repro-400'

  const parentId = generateId('USR')
  let parentToken: string

  const childId = generateId('STU')
  const classId = generateId('CLS')
  const branchId = generateId('BR')

  beforeAll(async () => {
    const now = new Date().toISOString()

    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi REPRO', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId })
    // Chỉ có năm học CŨ trong DB — chưa tạo 2026-2027
    await db.insert(academicYears).values({ id: '2025-2026', startDate: '2025-08-01', endDate: '2026-07-31', parishId })

    await db.insert(users).values({
      id: parentId, username: generateId('pa'), fullName: 'Phụ Huynh REPRO', phone: '0909999999',
      passwordHash: 'hash', role: 'phuhuynh', parishId, tokenVersion: 1, status: 'ACTIVE', createdAt: now,
    })

    await db.insert(classes).values({
      id: classId, code: generateId('C1'), name: 'Ấu Nhi 1A REPRO', branchId, academicYearId: '2025-2026', parishId, createdAt: now, updatedAt: now,
    })

    await db.insert(students).values({
      id: childId, code: generateId('S1'), holyName: 'Maria', fullName: 'Nguyễn Thị REPRO', gender: 'Nữ', dateOfBirth: '2016-01-01',
      parentName: 'Phụ Huynh REPRO', parentPhone: '0909999999', address: 'Address', branch: 'AuNhi', classId, parishId, createdAt: now, updatedAt: now,
    })

    // Điểm năm cũ để kiểm tra không bị mất dữ liệu hợp lệ
    await db.insert(grades).values({
      id: generateId('GRD'), studentId: childId, academicYear: '2025-2026', semester: 2,
      scoreOral: 8, score15m: 7, score1Period: 8, scoreMidterm: 8, scoreFinal: 9,
      parishId, createdAt: now, updatedAt: now,
    })

    parentToken = generateTokens({ userId: parentId, username: 'parent_repro', role: 'phuhuynh', parishId, tokenVersion: 1 }).accessToken
  })

  it('parent requests report-card with NEW year (not in DB) -> should NOT be 400', async () => {
    const res = await reportingRouter.request(`/report-card/${childId}?academicYear=2026-2027`, {
      headers: { Authorization: `Bearer ${parentToken}` },
    })
    const json = (await res.json()) as any
    // Log chi tiết để debug nếu fail
    if (res.status !== 200) console.error('RESPONSE:', JSON.stringify(json))
    expect(res.status).toBe(200)
    expect(json.data.student.id).toBe(childId)
    expect(json.data.academicYear).toBe('2026-2027')
    // Năm mới chưa có điểm → mảng rỗng là hợp lệ
    expect(json.data.grades).toEqual([])
  })

  it('parent requests report-card with OLD year -> 200 with grades', async () => {
    const res = await reportingRouter.request(`/report-card/${childId}?academicYear=2025-2026`, {
      headers: { Authorization: `Bearer ${parentToken}` },
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.data.grades.length).toBe(1)
    expect(json.data.grades[0].gpa).toBeGreaterThan(0)
  })
})
