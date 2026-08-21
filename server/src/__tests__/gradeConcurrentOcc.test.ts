import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { academicYears, auditLogs, branches, classes, grades, students, users } from '../db/schema.js'
import { upsertGrade, VersionConflictError } from '../services/gradeService.js'

const parishId = 'grade-real-concurrency'
const branchId = 'br-grade-real-concurrency'
const academicYearId = '2026-2027'
const classId = 'cl-grade-real-concurrency'
const studentId = 'st-grade-real-concurrency'
const user1Id = 'usr-grade-real-concurrency-1'
const user2Id = 'usr-grade-real-concurrency-2'

async function cleanup() {
  await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
  await db.delete(grades).where(eq(grades.parishId, parishId))
  await db.delete(students).where(eq(students.parishId, parishId))
  await db.delete(classes).where(eq(classes.parishId, parishId))
  await db.delete(users).where(eq(users.parishId, parishId))
  await db.delete(branches).where(eq(branches.parishId, parishId))
  await db.delete(academicYears).where(eq(academicYears.parishId, parishId))
}

describe('Grade SQL OCC under true concurrent requests', () => {
  beforeAll(async () => {
    await cleanup()
    await db.insert(branches).values({ id: branchId, parishId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9 })
    await db.insert(academicYears).values({ id: academicYearId, parishId, startDate: '2026-09-01', endDate: '2027-05-31' })
    await db.insert(classes).values({ id: classId, parishId, code: 'GR-OCC', name: 'Grade OCC', branchId, academicYearId })
    await db.insert(users).values([
      { id: user1Id, parishId, username: 'grade_occ_user_1', passwordHash: 'hash', fullName: 'Grade User 1', role: 'admin' },
      { id: user2Id, parishId, username: 'grade_occ_user_2', passwordHash: 'hash', fullName: 'Grade User 2', role: 'admin' },
    ])
    await db.insert(students).values({
      id: studentId,
      parishId,
      code: 'GR-OCC-ST',
      holyName: 'Giuse',
      fullName: 'Grade OCC Student',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'Parent',
      parentPhone: '0900000000',
      address: 'Test',
      branch: 'AuNhi',
      classId,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('allows exactly one of two simultaneous version-1 updates to commit', async () => {
    const initial = await upsertGrade({
      studentId,
      academicYear: academicYearId,
      semester: 1,
      scoreOral: 7,
    }, user1Id, parishId, '127.0.0.1', 'vitest')
    expect(initial.version).toBe(1)

    const settled = await Promise.allSettled([
      upsertGrade({ studentId, academicYear: academicYearId, semester: 1, scoreOral: 8, version: 1 }, user1Id, parishId, '127.0.0.1', 'vitest'),
      upsertGrade({ studentId, academicYear: academicYearId, semester: 1, scoreOral: 9, version: 1 }, user2Id, parishId, '127.0.0.1', 'vitest'),
    ])

    const fulfilled = settled.filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
    const rejected = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toBeInstanceOf(VersionConflictError)

    const [finalGrade] = await db.select().from(grades).where(eq(grades.id, initial.id)).limit(1)
    expect(finalGrade.version).toBe(2)
    expect([8, 9]).toContain(finalGrade.scoreOral)
  })
})
