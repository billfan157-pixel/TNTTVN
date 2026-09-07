import { describe, it, expect } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { academicYears, branches, classes, students, grades, attendance, users, catechistAssignments } from '../db/schema.js'
import gradesRouter from '../routes/grades.js'
import attendanceRouter from '../routes/attendance.js'
import { generateTokens } from '../middleware/auth.js'

let sequence = 0
async function fixture() {
  const parishId = `scope-pull-${Date.now()}-${++sequence}`
  await db.insert(users).values({ id: 'teacher', parishId, username: 'scope-teacher', fullName: 'Synthetic Teacher', passwordHash: 'hash', role: 'chunhiem', status: 'ACTIVE', tokenVersion: 1 })
  await db.insert(branches).values({ id: 'branch', parishId, name: 'Synthetic', scarfColor: 'green', ageMin: 6, ageMax: 10 })
  await db.insert(academicYears).values({ id: '2026-2027', parishId, startDate: '2026-08-01', endDate: '2027-07-31', currentSemester: 1 })
  for (const id of ['a', 'b']) {
    await db.insert(classes).values({ id, parishId, code: id, name: id, branchId: 'branch', academicYearId: '2026-2027' })
    await db.insert(students).values({ id, parishId, code: id, fullName: 'Synthetic', holyName: 'Maria', gender: 'Nữ', dateOfBirth: '2015-01-01', parentName: 'Parent', parentPhone: '0901234567', address: 'Synthetic', branch: 'AuNhi', classId: id })
    for (const semester of [1, 2]) await db.insert(grades).values({ id: `${id}-${semester}`, parishId, studentId: id, academicYear: '2026-2027', semester, scoreFinal: 8, updatedAt: '2026-08-01' })
    await db.insert(attendance).values({ id, parishId, studentId: id, date: '2026-08-02', type: 'SundayMass', status: 'Present', updatedAt: '2026-08-02' })
  }
  await db.insert(catechistAssignments).values({ id: 'assignment', parishId, userId: 'teacher', classId: 'a', roleInClass: 'chunhiem' })
  const token = generateTokens({ userId: 'teacher', parishId, username: 'scope-teacher', role: 'chunhiem', tokenVersion: 1 }).accessToken
  const headers = { Authorization: `Bearer ${token}` }
  return { parishId, headers }
}

describe('XD-06 authoritative scope + academic pull', () => {
  it.each([['grades', gradesRouter], ['attendance', attendanceRouter]] as const)('%s retracts revoked scope and backfills newly granted old records despite a future delta cursor', async (_name, router) => {
    const f = await fixture()
    const pull = async (revision = '') => {
      const res = await router.request(`/?includeScope=true&updatedAfter=2099-01-01&scopeRevision=${revision}`, { headers: f.headers })
      expect(res.status).toBe(200)
      return (await res.json() as any).data
    }
    const first = await pull()
    expect(first.mode).toBe('full')
    expect(first.scope.studentIds).toEqual(['a'])
    expect(first.records).toHaveLength(1)
    expect((await pull(first.scope.revision)).records).toEqual([])
    await db.update(catechistAssignments).set({ classId: 'b' }).where(eq(catechistAssignments.parishId, f.parishId))
    const changed = await pull(first.scope.revision)
    expect(changed.mode).toBe('full')
    expect(changed.scope.studentIds).toEqual(['b'])
    expect(changed.records.map((r: any) => r.studentId)).toEqual(['b'])
    await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, f.parishId))
    const revoked = await pull(changed.scope.revision)
    expect(revoked).toMatchObject({ records: [], mode: 'full', scope: { studentIds: [] } })
  })

  it('grade semester transition changes scope and returns old scores from the newly visible semester', async () => {
    const f = await fixture()
    const first = (await (await gradesRouter.request('/?includeScope=true', { headers: f.headers })).json() as any).data
    expect(first.scope.semester).toBe(1)
    await db.update(academicYears).set({ currentSemester: 2 }).where(eq(academicYears.parishId, f.parishId))
    const next = (await (await gradesRouter.request(`/?includeScope=true&updatedAfter=2099&scopeRevision=${first.scope.revision}`, { headers: f.headers })).json() as any).data
    expect(next.scope.semester).toBe(2)
    expect(next.mode).toBe('full')
    expect(next.records.map((g: any) => g.semester)).toEqual([2])
  })

  it('scope excludes deleted students and never supplies identifiers from another parish', async () => {
    const a = await fixture(), b = await fixture()
    await db.update(students).set({ deletedAt: new Date().toISOString() }).where(and(eq(students.parishId, a.parishId), eq(students.id, 'a')))
    const first = await gradesRouter.request('/?includeScope=true', { headers: a.headers })
    expect((await first.json() as any).data.scope.studentIds).toEqual([])
    const other = await gradesRouter.request('/?includeScope=true', { headers: b.headers })
    expect((await other.json() as any).data.scope.studentIds).toEqual(['a'])
  })
})
