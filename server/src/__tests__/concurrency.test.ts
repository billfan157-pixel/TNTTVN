import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../db/index.js'
import { grades, users, students, classes, branches, academicYears, catechistAssignments } from '../db/schema.js'
import { upsertGrade, VersionConflictError } from '../services/gradeService.js'
import { eq } from 'drizzle-orm'

describe('Production Readiness: Real Concurrency & Optimistic Lock Tests (ADR-001)', () => {
  const testParish = 'parish-concurrency'
  const user1Id = 'usr-conc-1'
  const user2Id = 'usr-conc-2'
  const studentId = 'st-conc-01'
  const classId = 'cl-conc-01'
  const branchId = 'br-conc-01'
  const yearId = 'AY-CONC-2025-2026'

  beforeAll(async () => {
    await db.insert(branches).values({ id: branchId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: testParish }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: yearId, startDate: '2025-09-01', endDate: '2026-05-31', parishId: testParish }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, code: 'CL-CONC', name: 'Lớp Concurrency', branchId, academicYearId: yearId, parishId: testParish }).onConflictDoNothing()
    await db.insert(users).values([
      { id: user1Id, username: 'userconc1', fullName: 'User Conc 1', passwordHash: 'hash', role: 'chunhiem', parishId: testParish },
      { id: user2Id, username: 'userconc2', fullName: 'User Conc 2', passwordHash: 'hash', role: 'chunhiem', parishId: testParish },
    ]).onConflictDoNothing()
    await db.insert(catechistAssignments).values([
      { id: 'asg-conc-1', userId: user1Id, classId, roleInClass: 'chunhiem', parishId: testParish },
      { id: 'asg-conc-2', userId: user2Id, classId, roleInClass: 'chunhiem', parishId: testParish },
    ]).onConflictDoNothing()

    await db.insert(students).values({
      id: studentId,
      code: 'ST-CONC-01',
      holyName: 'Phaolo',
      fullName: 'Nguyen Van Concurrent',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'P',
      parentPhone: '000',
      address: 'X',
      branch: 'AuNhi',
      classId,
      parishId: testParish,
    }).onConflictDoNothing()
  })

  beforeEach(async () => {
    await db.delete(grades).where(eq(grades.studentId, studentId))
  })

  it('1. Handles simultaneous read-modify-write race conditions: First succeeds (version 2), Second fails with VersionConflictError (ADR-001)', async () => {
    // 1. Initial grade entry (version 1)
    const initialGrade = await upsertGrade({
      studentId,
      academicYear: yearId,
      semester: 1,
      scoreOral: 8,
    }, user1Id, testParish, '127.0.0.1', 'vitest')

    expect(initialGrade.version).toBe(1)

    // 2. User 1 and User 2 both read version 1
    const user1Payload = {
      studentId,
      academicYear: yearId,
      semester: 1,
      scoreOral: 9,
      version: 1, // User 1 holds version 1
    }

    const user2Payload = {
      studentId,
      academicYear: yearId,
      semester: 1,
      scoreOral: 5,
      version: 1, // User 2 holds stale version 1
    }

    // 3. User 1 submits first -> succeeds and increments DB version to 2
    const user1Result = await upsertGrade(user1Payload, user1Id, testParish, '127.0.0.1', 'vitest')
    expect(user1Result.version).toBe(2)
    expect(user1Result.scoreOral).toBe(9)

    // 4. User 2 submits with stale version 1 -> MUST throw VersionConflictError
    await expect(
      upsertGrade(user2Payload, user2Id, testParish, '127.0.0.1', 'vitest')
    ).rejects.toThrow(VersionConflictError)

    // 5. Verify final DB state remains version 2 with User 1's score (9)
    const [finalGrade] = await db.select().from(grades).where(eq(grades.id, initialGrade.id)).limit(1)
    expect(finalGrade.version).toBe(2)
    expect(finalGrade.scoreOral).toBe(9)
  })
})
