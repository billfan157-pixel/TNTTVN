import { describe, it, expect } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { academicYears, branches, classes, users, students, attendance, leaveRequests } from '../db/schema.js'
import { attendanceApplicationService } from '../services/AttendanceApplicationService.js'
import { batchAttendanceApplicationService } from '../services/BatchAttendanceApplicationService.js'
import { drizzleSemesterLockRepository } from '../repositories/DrizzleSemesterLockRepository.js'
import { generateTokens } from '../middleware/auth.js'
import classesRouter from '../routes/classes.js'
import leaveRouter from '../routes/leaveRequests.js'

let sequence = 0
async function fixture() {
  const parishId = `period-boundary-${Date.now()}-${++sequence}`
  await db.insert(users).values({ id: 'admin', parishId, username: 'period-admin', fullName: 'Synthetic Admin', passwordHash: 'hash', role: 'admin', status: 'ACTIVE', tokenVersion: 1 })
  await db.insert(branches).values({ id: 'AuNhi', parishId, name: 'Ấu Nhi', scarfColor: 'green', ageMin: 7, ageMax: 10 })
  await db.insert(academicYears).values([
    { id: 'legacy', parishId, startDate: '2024-08-01', endDate: '2025-09-01' },
    { id: '2025-2026', parishId, startDate: '2025-08-01', endDate: '2026-07-31' },
  ])
  await db.insert(classes).values({ id: 'class', parishId, code: 'AU1', name: 'Ấu 1', branchId: 'AuNhi', academicYearId: '2025-2026' })
  await db.insert(students).values({ id: 'student', parishId, code: 'S1', holyName: 'Synthetic', fullName: 'Synthetic Student', parentName: 'Synthetic Parent', parentPhone: '0901234567', address: 'Synthetic', gender: 'Nam', dateOfBirth: '2015-01-01', classId: 'class', branch: 'AuNhi' })
  const { accessToken } = generateTokens({ userId: 'admin', parishId, role: 'admin', username: 'period-admin', tokenVersion: 1 })
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  const command = { studentId: 'student', parishId, userId: 'admin', date: '2025-08-10', type: 'SundayMass' as const, status: 'Present' as const }
  return { parishId, headers, command }
}

describe('XD-04 cross-domain period lock regression', () => {
  it.each(['semester-lock', 'FINALIZED', 'PROMOTED', 'ARCHIVED', 'year-lock'] as const)('direct, batch and leave approve cannot change a date in a protected legacy period (%s)', async mode => {
    const f = await fixture()
    if (mode === 'semester-lock') await drizzleSemesterLockRepository.setLockState('legacy', 1, true, 'admin', f.parishId)
    else await db.update(academicYears).set(mode === 'year-lock' ? { isLocked: 1 } : { status: mode }).where(and(eq(academicYears.parishId, f.parishId), eq(academicYears.id, 'legacy')))
    // An explicitly supplied unlocked period must not bypass a locked range.
    await expect(attendanceApplicationService.markAttendance({ ...f.command, academicYear: '2025-2026', semester: 1 })).rejects.toMatchObject({ status: 403 })
    const batch = await batchAttendanceApplicationService.markAttendanceBatch([f.command])
    expect(batch.errorCount).toBe(1)
    expect(batch.successCount).toBe(0)
    const created = await leaveRouter.request('/', { method: 'POST', headers: f.headers, body: JSON.stringify({ studentId: 'student', date: f.command.date, sessionTypes: ['SundayMass'], reason: 'Synthetic request' }) })
    expect(created.status).toBe(201)
    const requestId = ((await created.json()) as { data: { id: string } }).data.id
    const reviewed = await leaveRouter.request(`/${requestId}/review`, { method: 'PATCH', headers: f.headers, body: JSON.stringify({ status: 'APPROVED' }) })
    expect(reviewed.status).toBe(403)
    expect(await db.select().from(attendance).where(eq(attendance.parishId, f.parishId))).toHaveLength(0)
    const [request] = await db.select().from(leaveRequests).where(and(eq(leaveRequests.parishId, f.parishId), eq(leaveRequests.id, requestId)))
    expect(request.status).toBe('PENDING')
    // Rejection is not an academic write and remains allowed.
    expect((await leaveRouter.request(`/${requestId}/review`, { method: 'PATCH', headers: f.headers, body: JSON.stringify({ status: 'REJECTED' }) })).status).toBe(200)
  })

  it('a lock in another parish does not block the same date; an unrelated locked date range does not block current attendance', async () => {
    const other = await fixture()
    await drizzleSemesterLockRepository.setLockState('legacy', 1, true, 'admin', other.parishId)
    const f = await fixture()
    await db.update(academicYears).set({ status: 'FINALIZED', endDate: '2025-07-31' }).where(and(eq(academicYears.parishId, f.parishId), eq(academicYears.id, 'legacy')))
    expect((await attendanceApplicationService.markAttendance(f.command)).status).toBe('Present')
  })

  it('new year ranges must stay inside their canonical year; shortened teaching years are still allowed', async () => {
    const f = await fixture()
    for (const dates of [{ startDate: '2024-07-31', endDate: '2025-06-30' }, { startDate: '2024-09-01', endDate: '2025-08-01' }]) {
      const response = await classesRouter.request('/academic-years', { method: 'POST', headers: f.headers, body: JSON.stringify({ id: '2024-2025', ...dates }) })
      expect(response.status).toBe(400)
    }
    expect(await db.select().from(academicYears).where(and(eq(academicYears.parishId, f.parishId), eq(academicYears.id, '2024-2025')))).toHaveLength(0)
    expect((await classesRouter.request('/academic-years', { method: 'POST', headers: f.headers, body: JSON.stringify({ id: '2024-2025', startDate: '2024-09-01', endDate: '2025-06-30' }) })).status).toBe(201)
  })
})
