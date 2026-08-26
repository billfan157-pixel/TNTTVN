import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '../../db/index.js'
import { students, classes, branches, academicYears, users, examSessions, examResults, semesterLocks, auditLogs, importBatches, importBatchStudents, grades, assessmentEntries } from '../../db/schema.js'
import { detectDuplicates, validateImport, importStudents } from '../../services/importService.js'
import { reopenExamSession, createExamSession, completeExamSession } from '../../services/examService.js'
import { eq, and } from 'drizzle-orm'

describe('Audit Import / Exam Fixes (IE-01 .. IE-05)', () => {
  const PARISH = 'parish-audit-ie-test'
  const AY_ID = '2025-2026'
  const BRANCH_ID = 'ThieuNhi'
  const CLASS_ID = 'cls-ie-01'
  const ADMIN_ID = 'usr-ie-admin'

  const SIBLING_PHONE = '0901234567'
  const S1_ID = 'st-ie-s1'
  const S2_ID = 'st-ie-s2'

  beforeAll(async () => {
    // Seed Academic Year & Branch
    await db.insert(academicYears).values({
      id: AY_ID,
      parishId: PARISH,
      startDate: '2025-08-01',
      endDate: '2026-07-31',
      isLocked: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    }).onConflictDoNothing()

    await db.insert(branches).values({
      id: BRANCH_ID,
      parishId: PARISH,
      name: 'Thiếu Nhi',
      scarfColor: 'Xanh Biển',
      ageMin: 10,
      ageMax: 12,
    }).onConflictDoNothing()

    await db.insert(classes).values({
      id: CLASS_ID,
      parishId: PARISH,
      name: 'Thiếu Nhi 1',
      code: 'TN1',
      branchId: BRANCH_ID,
      academicYearId: AY_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    }).onConflictDoNothing()

    await db.insert(users).values({
      id: ADMIN_ID,
      username: 'ie_admin_user',
      passwordHash: 'hash',
      fullName: 'IE Admin',
      role: 'admin',
      parishId: PARISH,
      createdAt: new Date().toISOString(),
    }).onConflictDoNothing()

    // Seed 2 siblings sharing the same parent phone
    const now = new Date().toISOString()
    await db.insert(students).values([
      {
        id: S1_ID,
        code: 'TN-2025-001',
        holyName: 'Maria',
        fullName: 'Nguyễn Thị An',
        dateOfBirth: '2014-05-15',
        gender: 'Nữ',
        parentPhone: SIBLING_PHONE,
        parentName: 'Nguyễn Văn Phụ Huynh',
        address: '123 Test Address',
        branch: 'ThieuNhi',
        classId: CLASS_ID,
        parishId: PARISH,
        createdAt: now,
        updatedAt: now,
        updatedBy: 'system',
      },
      {
        id: S2_ID,
        code: 'TN-2025-002',
        holyName: 'Giuse',
        fullName: 'Nguyễn Văn Bình',
        dateOfBirth: '2017-08-20',
        gender: 'Nam',
        parentPhone: SIBLING_PHONE,
        parentName: 'Nguyễn Văn Phụ Huynh',
        address: '123 Test Address',
        branch: 'ThieuNhi',
        classId: CLASS_ID,
        parishId: PARISH,
        createdAt: now,
        updatedAt: now,
        updatedBy: 'system',
      },
    ]).onConflictDoNothing()
  })

  afterAll(async () => {
    await db.delete(examResults).where(eq(examResults.parishId, PARISH))
    await db.delete(examSessions).where(eq(examSessions.parishId, PARISH))
    await db.delete(semesterLocks).where(eq(semesterLocks.parishId, PARISH))
    await db.delete(importBatchStudents).where(eq(importBatchStudents.parishId, PARISH))
    await db.delete(importBatches).where(eq(importBatches.parishId, PARISH))
    // IE-04 gọi completeExamSession → finalize ghi grades + assessmentEntries
    // (FK restrict tới students) — phải xóa trước khi xóa students.
    await db.delete(assessmentEntries).where(eq(assessmentEntries.parishId, PARISH))
    await db.delete(grades).where(eq(grades.parishId, PARISH))
    await db.delete(students).where(eq(students.parishId, PARISH))
    await db.delete(classes).where(eq(classes.parishId, PARISH))
    await db.delete(branches).where(eq(branches.parishId, PARISH))
    await db.delete(academicYears).where(eq(academicYears.parishId, PARISH))
    await db.delete(users).where(eq(users.id, ADMIN_ID))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, PARISH))
  })

  // ─── IE-01: Duplicate Detection Disambiguation ───
  describe('IE-01: Sibling Disambiguation in detectDuplicates', () => {
    it('accurately identifies Sibling 1 (Nguyễn Thị An) without collapsing with Sibling 2', async () => {
      const rows = [
        {
          rowIndex: 0,
          holyName: 'Maria',
          fullName: 'Nguyễn Thị An',
          dateOfBirth: '2014-05-15',
          gender: 'Nữ' as const,
          parentPhone: SIBLING_PHONE,
          parentName: 'Nguyễn Văn Phụ Huynh',
          address: '123 Test Address',
          className: 'Thiếu Nhi 1',
          branch: 'ThieuNhi',
        },
      ]

      const dupMap = await detectDuplicates(rows, PARISH)
      expect(dupMap.has(0)).toBe(true)
      const dup = dupMap.get(0)!
      expect(dup.studentId).toBe(S1_ID)
      expect(dup.fullName).toBe('Nguyễn Thị An')
    })

    it('accurately identifies Sibling 2 (Nguyễn Văn Bình) without being overwritten by Sibling 1', async () => {
      const rows = [
        {
          rowIndex: 0,
          holyName: 'Giuse',
          fullName: 'Nguyễn Văn Bình',
          dateOfBirth: '2017-08-20',
          gender: 'Nam' as const,
          parentPhone: SIBLING_PHONE,
          parentName: 'Nguyễn Văn Phụ Huynh',
          address: '123 Test Address',
          className: 'Thiếu Nhi 1',
          branch: 'ThieuNhi',
        },
      ]

      const dupMap = await detectDuplicates(rows, PARISH)
      expect(dupMap.has(0)).toBe(true)
      const dup = dupMap.get(0)!
      expect(dup.studentId).toBe(S2_ID)
      expect(dup.fullName).toBe('Nguyễn Văn Bình')
    })

    it('recognizes a NEW third sibling (Nguyễn Văn Chi) as a new student, NOT a duplicate of existing siblings', async () => {
      const rows = [
        {
          rowIndex: 0,
          holyName: 'Phêrô',
          fullName: 'Nguyễn Văn Chi',
          dateOfBirth: '2020-03-10',
          gender: 'Nam' as const,
          parentPhone: SIBLING_PHONE,
          parentName: 'Nguyễn Văn Phụ Huynh',
          address: '123 Test Address',
          className: 'Thiếu Nhi 1',
          branch: 'ThieuNhi',
        },
      ]

      const dupMap = await detectDuplicates(rows, PARISH)
      // Must NOT match either S1 or S2!
      expect(dupMap.has(0)).toBe(false)
    })
  })

  // ─── IE-02: Content Hash Synchronization ───
  describe('IE-02: Canonical Content Hash Synchronization', () => {
    it('produces identical contentHash in validateImport and importStudents even with sparse rows', async () => {
      const rawRows = [
        {
          rowIndex: 0,
          holyName: 'Maria',
          fullName: 'Trần Thị Mai',
          dateOfBirth: '', // raw missing
          gender: '' as any,
          parentPhone: '', // raw missing
          parentName: '',
          address: '',
          className: 'Thiếu Nhi 1',
          branch: '',
        },
      ]

      const allClasses = [
        { id: CLASS_ID, name: 'Thiếu Nhi 1', code: 'TN1', branchId: BRANCH_ID, branchName: 'Thiếu Nhi' },
      ]

      const validationResult = await validateImport(rawRows, PARISH, allClasses)

      // The validationResult.contentHash MUST equal hash of normalized rows
      expect(validationResult.contentHash).toBeDefined()

      // Perform import
      const importResult = await importStudents(
        {
          rows: rawRows,
          classMappings: { 'Thiếu Nhi 1': CLASS_ID },
          duplicateActions: {},
        },
        ADMIN_ID,
        PARISH,
        '127.0.0.1',
        'Vitest'
      )

      expect(importResult.contentHash).toBe(validationResult.contentHash)
    })
  })

  // ─── IE-04: Reopen Exam Semester Lock ───
  describe('IE-04: Reopen Exam Semester Lock Enforcement', () => {
    it('blocks reopenExamSession with 403 when the semester is locked', async () => {
      // 1. Create draft session
      const session = await createExamSession(
        {
          classId: CLASS_ID,
          subject: 'Giáo Lý',
          scoreType: '15m',
          maxScore: 10,
          semester: 1,
          academicYear: AY_ID,
        },
        ADMIN_ID,
        PARISH,
        '127.0.0.1',
        'Vitest'
      )

      // 2. Insert dummy result and complete session
      await db.insert(examResults).values({
        id: 'exr-lock-test',
        examSessionId: session.id,
        studentId: S1_ID,
        score: 9.0,
        parishId: PARISH,
        createdAt: new Date().toISOString(),
      })

      await completeExamSession(session.id, ADMIN_ID, PARISH, '127.0.0.1', 'Vitest', null)

      // 3. Lock Semester 1
      await db.insert(semesterLocks).values({
        id: `lock-${Date.now()}`,
        academicYear: AY_ID,
        semester: 1,
        isLocked: 1,
        lockedBy: ADMIN_ID,
        lockedAt: new Date().toISOString(),
        parishId: PARISH,
      })

      // 4. Attempt to reopen should reject with 403
      await expect(
        reopenExamSession(session.id, ADMIN_ID, PARISH, '127.0.0.1', 'Vitest')
      ).rejects.toThrow(/đã bị khóa sổ điểm/)

      // 5. Unlock Semester 1 and reopen should succeed
      await db.delete(semesterLocks).where(and(eq(semesterLocks.academicYear, AY_ID), eq(semesterLocks.semester, 1), eq(semesterLocks.parishId, PARISH)))
      const reopened = await reopenExamSession(session.id, ADMIN_ID, PARISH, '127.0.0.1', 'Vitest')
      expect(reopened.status).toBe('draft')
    })
  })
})
