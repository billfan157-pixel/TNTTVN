import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import backupRouter from '../../routes/backup.js'
import { db } from '../../db/index.js'
import { students, users, classes, branches, academicYears, examSessions, examResults, questionBankItems, questionBankVersions } from '../../db/schema.js'
import { generateId } from '../../utils/id.js'
import { generateTokens } from '../../middleware/auth.js'
import { and, eq } from 'drizzle-orm'

describe('Sprint 3.3 Real Backup & Restore Integration Test', () => {
  const adminId = generateId('USR')
  // A07 (2026-08-10): export/restore yêu cầu re-authentication — seed bcrypt
  // hash hợp lệ + gửi kèm adminPassword trong mọi call.
  const ADMIN_PASSWORD = 'BackupAdmin@123'
  let parishId: string
  let accessToken: string

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 4)
    parishId = `backup-fixture-${generateId('BR')}`
    accessToken = generateTokens({ userId: adminId, username: 'admin_backup_test', role: 'admin', parishId, tokenVersion: 1 }).accessToken
    // Each whole-parish restore owns its fixture, not another suite's ledger.
    await db.insert(branches).values({ id: 'br-au-nhi', parishId, name: 'Ấu Nhi', scarfColor: 'Xanh Lá', ageMin: 6, ageMax: 9 })
    await db.insert(academicYears).values({ id: '2025-2026', parishId, startDate: '2025-08-01', endDate: '2026-07-31' })
    await db.insert(classes).values({ id: 'cls-test-bk', parishId, code: 'AN1-BK', name: 'Ấu Nhi 1', branchId: 'br-au-nhi', academicYearId: '2025-2026' })
    await db.insert(users).values({
      id: adminId,
      username: 'admin_backup_test',
      passwordHash,
      fullName: 'Admin Backup Test',
      role: 'admin',
      parishId,
      status: 'ACTIVE',
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    })
  })

  it('1. GET /api/backup/export returns complete database snapshot', async () => {

    const testBranchId = 'br-au-nhi'
    const testYearId = '2025-2026'

    await db.insert(branches).values({
      id: testBranchId,
      parishId,
      name: 'Ấu Nhi',
      scarfColor: 'Xanh Lá',
      ageMin: 6,
      ageMax: 9,
    }).onConflictDoNothing()

    await db.insert(academicYears).values({
      id: testYearId,
      parishId,
      startDate: '2025-09-01',
      endDate: '2026-05-31',
    }).onConflictDoNothing()

    const testClassId = 'cls-test-bk'
    await db.insert(classes).values({
      id: testClassId,
      parishId,
      code: 'AN1-BK',
      name: 'Ấu Nhi 1',
      branchId: testBranchId,
      academicYearId: testYearId,
    }).onConflictDoNothing()

    // Insert test student
    const testId = generateId('ST')
    const testCode = `ST-BK-${Date.now()}`
    await db.insert(students).values({
      id: testId,
      code: testCode,
      holyName: 'Gioan',
      parishId,
      fullName: 'Nguyễn Văn Backup',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'Bố Backup',
      parentPhone: '0900000000',
      address: 'Xã X',
      branch: 'AuNhi',
      classId: testClassId,
      status: 'Đang học',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const res = await backupRouter.request('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ adminPassword: ADMIN_PASSWORD }),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.version).toBe('2.1-question-bank')
    expect(json.data.questionBankItems).toBeDefined()
    expect(json.data.questionBankVersions).toBeDefined()
    expect(json.data.examBlueprints).toBeDefined()
    expect(json.data.examBlueprintRules).toBeDefined()
    expect(json.data.examQuestionSnapshots).toBeDefined()
    expect(json.data.students).toBeDefined()
    expect(json.data.students.some((s: any) => s.id === testId)).toBe(true)
  })

  it('2. Sprint 3.3 Test: Backup -> Delete -> Restore -> Verify 100% Data Integrity', async () => {
    const testId = generateId('ST')
    const testCode = `ST-RES-${Date.now()}`
    await db.insert(students).values({
      id: testId,
      code: testCode,
      holyName: 'Maria',
      parishId,
      fullName: 'Trần Thị Khôi Phục',
      gender: 'Nữ',
      dateOfBirth: '2016-05-05',
      parentName: 'Mẹ Khôi Phục',
      parentPhone: '0900111222',
      address: 'Xã Y',
      branch: 'ThieuNhi',
      classId: 'cls-test-bk',
      status: 'Đang học',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    // Step A: Export Backup
    const exportRes = await backupRouter.request('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ adminPassword: ADMIN_PASSWORD }),
    })
    const backupSnapshot = (await exportRes.json()) as any

    // Step B: Delete Record (Simulate Data Loss)
    await db.delete(students).where(eq(students.id, testId))
    const checkDeleted = await db.select().from(students).where(eq(students.id, testId))
    expect(checkDeleted.length).toBe(0)

    // Step C: Restore Database Snapshot
    const restoreRes = await backupRouter.request('/restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ ...backupSnapshot, adminPassword: ADMIN_PASSWORD })
    })

    expect(restoreRes.status).toBe(200)

    // Step D: Verify 100% Data Integrity Restored
    const checkRestored = await db.select().from(students).where(eq(students.id, testId))
    expect(checkRestored.length).toBe(1)
    expect(checkRestored[0].fullName).toBe('Trần Thị Khôi Phục')
  })

  it('3. Export keeps exam results tenant-scoped when session/student IDs collide', async () => {
    const localParish = parishId
    const foreignParish = `${parishId}-foreign`
    const branchId = 'br-backup-domain2-shared'
    const yearId = 'ay-backup-domain2-shared'
    const classId = 'cls-backup-domain2-shared'
    const studentId = 'st-backup-domain2-shared'
    const sessionId = 'EXS-BACKUP-DOMAIN2-SHARED'
    const localResultId = 'EXR-BACKUP-DOMAIN2-LOCAL'
    const foreignResultId = 'EXR-BACKUP-DOMAIN2-FOREIGN'

    for (const parishId of [localParish, foreignParish]) {
      await db.delete(examResults).where(and(eq(examResults.parishId, parishId), eq(examResults.examSessionId, sessionId)))
      await db.delete(examSessions).where(and(eq(examSessions.parishId, parishId), eq(examSessions.id, sessionId)))
      await db.delete(students).where(and(eq(students.parishId, parishId), eq(students.id, studentId)))
      await db.delete(classes).where(and(eq(classes.parishId, parishId), eq(classes.id, classId)))
      await db.delete(branches).where(and(eq(branches.parishId, parishId), eq(branches.id, branchId)))
      await db.delete(academicYears).where(and(eq(academicYears.parishId, parishId), eq(academicYears.id, yearId)))

      await db.insert(branches).values({
        id: branchId,
        parishId,
        name: `Backup Branch ${parishId}`,
        scarfColor: 'Xanh',
        ageMin: 6,
        ageMax: 9,
      })
      await db.insert(academicYears).values({
        id: yearId,
        parishId,
        startDate: '2026-09-01',
        endDate: '2027-05-31',
      })
      await db.insert(classes).values({
        id: classId,
        parishId,
        code: 'BK-D2-SHARED',
        name: `Backup Class ${parishId}`,
        branchId,
        academicYearId: yearId,
        idempotencyKey: 'backup-domain2-class-shared',
      })
      await db.insert(students).values({
        id: studentId,
        parishId,
        code: 'BK-D2-STUDENT',
        holyName: 'Giuse',
        fullName: `Backup Student ${parishId}`,
        gender: 'Nam',
        dateOfBirth: '2015-01-01',
        parentName: 'Backup Parent',
        parentPhone: '0900999888',
        address: 'Test',
        branch: 'AuNhi',
        classId,
      })
      await db.insert(examSessions).values({
        id: sessionId,
        parishId,
        classId,
        subject: 'Backup Tenant Isolation',
        scoreType: '15m',
        maxScore: 10,
        semester: 1,
        academicYear: yearId,
        status: 'draft',
        createdBy: parishId === localParish ? adminId : 'foreign-admin',
        examType: 'written',
        idempotencyKey: 'backup-domain2-session-shared',
      })
    }

    await db.insert(examResults).values([
      {
        id: localResultId,
        parishId: localParish,
        examSessionId: sessionId,
        studentId,
        score: 7,
        source: 'quick_entry',
      },
      {
        id: foreignResultId,
        parishId: foreignParish,
        examSessionId: sessionId,
        studentId,
        score: 3,
        source: 'quick_entry',
      },
    ])

    const res = await backupRouter.request('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ adminPassword: ADMIN_PASSWORD }),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.data.examResults.some((row: any) => row.id === localResultId)).toBe(true)
    expect(json.data.examResults.some((row: any) => row.id === foreignResultId)).toBe(false)
  })

  it('4. Backup v2.1 restores immutable question-bank items and versions', async () => {
    const questionId = generateId('QBI')
    const versionId = generateId('QBV')
    const now = new Date().toISOString()
    await db.insert(questionBankItems).values({
      id: questionId,
      parishId,
      status: 'active',
      currentVersion: 1,
      tags: '[]',
      provenance: 'human',
      createdBy: adminId,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(questionBankVersions).values({
      id: versionId,
      parishId,
      questionId,
      version: 1,
      questionType: 'essay',
      stem: 'Câu hỏi cần khôi phục nguyên vẹn?',
      answerData: '{"rubric":"Đủ ý"}',
      metadataSnapshot: '{}',
      contentHash: 'a'.repeat(64),
      createdBy: adminId,
      createdAt: now,
    })

    const exportRes = await backupRouter.request('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ adminPassword: ADMIN_PASSWORD }),
    })
    const snapshot = (await exportRes.json()) as any
    expect(snapshot.data.questionBankItems.some((row: any) => row.id === questionId)).toBe(true)
    expect(snapshot.data.questionBankVersions.some((row: any) => row.id === versionId)).toBe(true)

    await db.delete(questionBankItems).where(and(eq(questionBankItems.parishId, parishId), eq(questionBankItems.id, questionId)))
    expect(await db.select().from(questionBankVersions).where(and(eq(questionBankVersions.parishId, parishId), eq(questionBankVersions.id, versionId)))).toHaveLength(0)

    const restoreRes = await backupRouter.request('/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ ...snapshot, adminPassword: ADMIN_PASSWORD }),
    })
    expect(restoreRes.status).toBe(200)
    const restored = await db.select().from(questionBankVersions).where(and(eq(questionBankVersions.parishId, parishId), eq(questionBankVersions.id, versionId)))
    expect(restored).toHaveLength(1)
    expect(restored[0].stem).toBe('Câu hỏi cần khôi phục nguyên vẹn?')
  })
})
