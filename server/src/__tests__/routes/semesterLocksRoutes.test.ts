import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../../db/index.js'
import { semesterLocks, academicYears, auditLogs, users } from '../../db/schema.js'
import semesterLocksRouter from '../../routes/semesterLocks.js'
import { drizzleSemesterLockRepository } from '../../repositories/DrizzleSemesterLockRepository.js'
import { generateTokens } from '../../middleware/auth.js'
import { eq, and } from 'drizzle-orm'

describe('Semester Locks Route — State Machine Gates (AYL-02)', () => {
  const testParish = 'parish-sml-rt'
  const adminUserId = 'usr-admin-sml-rt'
  const yearId = 'AY-SML-RT-2025'
  let adminToken: string

  const post = (body: unknown) =>
    semesterLocksRouter.request('/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(body),
    })

  const lockState = async () => {
    const rows = await db
      .select()
      .from(semesterLocks)
      .where(and(eq(semesterLocks.parishId, testParish), eq(semesterLocks.academicYear, yearId)))
    return {
      1: rows.find((r) => r.semester === 1)?.isLocked ?? 0,
      2: rows.find((r) => r.semester === 2)?.isLocked ?? 0,
    }
  }

  beforeAll(async () => {
    adminToken = generateTokens({ userId: adminUserId, username: 'adminsmlrt', role: 'admin', parishId: testParish }).accessToken
    await db.insert(users).values({
      id: adminUserId,
      username: 'adminsmlrt',
      fullName: 'Admin Sml Rt',
      passwordHash: 'hash',
      role: 'admin',
      parishId: testParish,
    }).onConflictDoNothing()
    await db.insert(academicYears).values({
      id: yearId,
      startDate: '2025-08-01',
      endDate: '2026-07-31',
      parishId: testParish,
    }).onConflictDoNothing()
  })

  beforeEach(async () => {
    await db.delete(semesterLocks).where(eq(semesterLocks.parishId, testParish))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, testParish))
    await db
      .update(academicYears)
      .set({ isLocked: 0, status: 'OPEN', currentSemester: 1 })
      .where(eq(academicYears.id, yearId))
  })

  it('locks HK1 successfully (happy path) + audit log', async () => {
    const res = await post({ academicYear: yearId, semester: 1, isLocked: true })
    expect(res.status).toBe(200)
    const json: any = (await res.json()) as any
    expect(json.success).toBe(true)
    expect((await lockState())[1]).toBe(1)

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.parishId, testParish))
    expect(logs.length).toBe(1)
    expect(logs[0].action).toBe('LOCK_SEMESTER')
  })

  it('rejects locking HK2 while HK1 is unlocked (403)', async () => {
    const res = await post({ academicYear: yearId, semester: 2, isLocked: true })
    expect(res.status).toBe(403)
    const json: any = (await res.json()) as any
    expect(json.error.code).toBe('SEMESTER_LOCK_STATE_CONFLICT')
    expect((await lockState())[2]).toBe(0)
  })

  it('allows HK2 lock after HK1 locked, then rejects unlocking HK1 while HK2 locked', async () => {
    await drizzleSemesterLockRepository.setLockState(yearId, 1, true, adminUserId, testParish)

    const lock2 = await post({ academicYear: yearId, semester: 2, isLocked: true })
    expect(lock2.status).toBe(200)
    expect((await lockState())[2]).toBe(1)

    const unlock1 = await post({ academicYear: yearId, semester: 1, isLocked: false })
    expect(unlock1.status).toBe(403)
    expect((await lockState())[1]).toBe(1)

    // unlock HK2 then HK1 → cả khóa mở sạch (quy trình ngược an toàn)
    const unlock2 = await post({ academicYear: yearId, semester: 2, isLocked: false })
    expect(unlock2.status).toBe(200)
    const unlock1retry = await post({ academicYear: yearId, semester: 1, isLocked: false })
    expect(unlock1retry.status).toBe(200)
    expect(await lockState()).toEqual({ 1: 0, 2: 0 })
  })

  it('rejects any lock/unlock on a FINALIZED year (409)', async () => {
    await db
      .update(academicYears)
      .set({ isLocked: 1, status: 'FINALIZED' })
      .where(eq(academicYears.id, yearId))

    const res = await post({ academicYear: yearId, semester: 1, isLocked: true })
    expect(res.status).toBe(409)
    const json: any = (await res.json()) as any
    expect(json.error.code).toBe('SEMESTER_LOCK_STATE_CONFLICT')

    const unlockRes = await post({ academicYear: yearId, semester: 1, isLocked: false })
    expect(unlockRes.status).toBe(409)
  })

  it('rejects lock for non-existent academic year (404)', async () => {
    const res = await post({ academicYear: '2030-2031', semester: 1, isLocked: true })
    expect(res.status).toBe(404)
    const json: any = (await res.json()) as any
    expect(json.error.code).toBe('ACADEMIC_YEAR_NOT_FOUND')
  })
})