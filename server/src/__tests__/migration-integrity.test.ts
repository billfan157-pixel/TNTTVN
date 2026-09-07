import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../db/index.js'
import { attendance, promotionRecords, branches, academicYears, classes, students, users, examSessions, examResults } from '../db/schema.js'
import { sql, eq } from 'drizzle-orm'

describe('Production Readiness: Database Migration & Schema Integrity Tests', () => {
  const pId = 'parish-mig-test'
  const sId = 'st-mig-01'

  beforeAll(async () => {
    await db.insert(branches).values({ id: 'br-mig-01', name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: pId }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: 'AY-2025-2026', startDate: '2025-09-01', endDate: '2026-05-31', parishId: pId }).onConflictDoNothing()
    await db.insert(classes).values({ id: 'cl-mig-01', code: 'CL-MIG', name: 'Lớp Migration', branchId: 'br-mig-01', academicYearId: 'AY-2025-2026', parishId: pId }).onConflictDoNothing()
    await db.insert(users).values({ id: 'usr-mig-admin', username: 'migadmin', fullName: 'Mig Admin', passwordHash: 'hash', role: 'admin', parishId: pId }).onConflictDoNothing()

    await db.insert(students).values({
      id: sId,
      code: 'ST-MIG-01',
      holyName: 'Giu-se',
      fullName: 'Nguyen Van Migration',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'P',
      parentPhone: '000',
      address: 'X',
      branch: 'AuNhi',
      classId: 'cl-mig-01',
      parishId: pId,
    }).onConflictDoNothing()
    // ADR-016: KHÔNG tạo index cũ (student_id, date, type) thiếu parish_id dưới tên
    // idx_attendance_unique — migration 20260803-063 (db/index.ts) đã tạo index chuẩn
    // multi-tenant (parish_id, student_id, date, type) khi module db load, trước test này.
  })

  beforeEach(async () => {
    await db.delete(attendance).where(eq(attendance.studentId, sId))
  })
  it('XD-01: promotion completion columns are nullable, with no implicit legacy completion default', async () => {
    const result = await db.run(sql`PRAGMA table_info(promotion_records)`)
    for (const name of ['completed_at', 'completed_target_year_id']) {
      const column = (result.rows as any[]).find(row => (row.name ?? row[1]) === name)
      expect(column).toBeDefined()
      expect(Number(column.notnull ?? column[3])).toBe(0)
      expect(column.dflt_value ?? column[4]).toBeNull()
    }
  })

  it('1. Verifies SQLite foreign keys and operational table presence', async () => {
    const tableResult = await db.run(sql`SELECT name FROM sqlite_master WHERE type='table'`)
    const tables = (tableResult.rows as any[]).map(r => r[0] || r.name)

    expect(tables).toContain('attendance')
    expect(tables).toContain('promotion_records')
    expect(tables).toContain('semester_locks')
    expect(tables).toContain('grades')
    expect(tables).toContain('audit_logs')
    // Smart Exam Grading (migrations 083-084)
    expect(tables).toContain('exam_sessions')
    expect(tables).toContain('exam_results')
  })

  it('XD-02/03: new historical evidence columns are nullable and never backfill current state', async () => {
    for (const [table, names] of [
      ['academic_years', ['finalization_policy']],
      ['academic_year_snapshots', ['source_class_id', 'report_snapshot']],
    ] as const) {
      const result = await db.run(sql.raw(`PRAGMA table_info(${table})`))
      for (const name of names) {
        const column = (result.rows as any[]).find(row => (row.name ?? row[1]) === name)
        expect(column).toBeDefined()
        expect(Number(column.notnull ?? column[3])).toBe(0)
        expect(column.dflt_value ?? column[4]).toBeNull()
      }
    }
  })

  it('1c. Verifies exam Phase 4 columns (exam_type/question_count/answer_key/answers)', async () => {
    const sessionCols = await db.run(sql`PRAGMA table_info(exam_sessions)`)
    const sessionNames = (sessionCols.rows as any[]).map(r => r[1] || r.name)
    expect(sessionNames).toContain('exam_type')
    expect(sessionNames).toContain('question_count')
    expect(sessionNames).toContain('answer_key')

    const resultCols = await db.run(sql`PRAGMA table_info(exam_results)`)
    const resultNames = (resultCols.rows as any[]).map(r => r[1] || r.name)
    expect(resultNames).toContain('answers')
    expect(resultNames).toContain('parish_id')
  })

  it('1b. Verifies exam UNIQUE(exam_session_id, student_id) constraint + FK cascade', async () => {
    const pId = 'parish-mig-test'
    await db.insert(examSessions).values({
      id: 'exs-mig-01', parishId: pId, classId: 'cl-mig-01', subject: 'Giáo Lý',
      scoreType: '15m', maxScore: 10, semester: 1, academicYear: '2025-2026',
      status: 'draft', createdBy: 'usr-mig-admin',
    }).onConflictDoNothing()
    await db.insert(examResults).values({
      id: 'exr-mig-01', parishId: pId, examSessionId: 'exs-mig-01', studentId: sId, score: 8.5, source: 'qr_scan',
    }).onConflictDoNothing()

    await expect(
      db.insert(examResults).values({
        id: 'exr-mig-02', parishId: pId, examSessionId: 'exs-mig-01', studentId: sId, score: 9,
      })
    ).rejects.toThrow()

    // ON DELETE CASCADE: xóa session → results biến mất
    await db.delete(examSessions).where(eq(examSessions.id, 'exs-mig-01'))
    const remaining = await db.select().from(examResults).where(eq(examResults.examSessionId, 'exs-mig-01'))
    expect(remaining).toHaveLength(0)
  })

  it('1d. Verifies UNIQUE idempotency index on exam_sessions (C1, ADR-023)', async () => {
    const pId = 'parish-mig-test'
    await db.insert(examSessions).values({
      id: 'exs-mig-idem-01', parishId: pId, classId: 'cl-mig-01', subject: 'Giáo Lý',
      scoreType: '15m', maxScore: 10, semester: 1, academicYear: '2025-2026',
      status: 'draft', createdBy: 'usr-mig-admin', idempotencyKey: 'temp-key-c1',
    }).onConflictDoNothing()

    await expect(
      db.insert(examSessions).values({
        id: 'exs-mig-idem-02', parishId: pId, classId: 'cl-mig-01', subject: 'Giáo Lý',
        scoreType: '15m', maxScore: 10, semester: 1, academicYear: '2025-2026',
        status: 'draft', createdBy: 'usr-mig-admin', idempotencyKey: 'temp-key-c1',
      })
    ).rejects.toThrow()

    // SQLite UNIQUE index bỏ qua NULL: session không có idempotencyKey vẫn insert được
    await expect(
      db.insert(examSessions).values({
        id: 'exs-mig-idem-03', parishId: pId, classId: 'cl-mig-01', subject: 'Giáo Lý',
        scoreType: '15m', maxScore: 10, semester: 1, academicYear: '2025-2026',
        status: 'draft', createdBy: 'usr-mig-admin',
      })
    ).resolves.toBeTruthy()

    await db.delete(examSessions).where(eq(examSessions.id, 'exs-mig-idem-01'))
    await db.delete(examSessions).where(eq(examSessions.id, 'exs-mig-idem-03'))
  })

  it('2. Verifies UNIQUE constraint on attendance (ADR-016: parish_id, student_id, date, type)', async () => {
    const pId = 'parish-mig-test'
    const sId = 'st-mig-01'
    const dateStr = '2026-03-01'

    await db.insert(attendance).values({
      id: 'at-mig-01',
      studentId: sId,
      date: dateStr,
      type: 'SundayMass',
      status: 'Present',
      version: 1,
      parishId: pId,
    }).onConflictDoNothing()

    // Attempting duplicate insert with same unique key must trigger SQLite unique constraint violation
    await expect(
      db.insert(attendance).values({
        id: 'at-mig-02',
        studentId: sId,
        date: dateStr,
        type: 'SundayMass',
        status: 'AbsentUnexcused',
        version: 1,
        parishId: pId,
      })
    ).rejects.toThrow()
  })

  it('3. Verifies Snapshot Immutability (ADR-006): promotion_records stores full immutable state', async () => {
    const pId = 'parish-mig-test'
    const snapshotId = 'prm-mig-01'

    await db.insert(promotionRecords).values({
      id: snapshotId,
      studentId: 'st-mig-01',
      academicYear: '2025-2026',
      targetClassId: 'cl-mig-01',
      autoDecision: 'PROMOTED',
      finalDecision: 'PROMOTED',
      gpaSnapshot: 9.0,
      attendanceSnapshot: 95.0,
      approvedBy: 'usr-mig-admin',
      status: 'ACTIVE',
      version: 1,
      parishId: pId,
    }).onConflictDoNothing()

    const [retrieved] = await db.select().from(promotionRecords).where(sql`id = ${snapshotId}`)
    expect(retrieved.autoDecision).toBe('PROMOTED')
    expect(retrieved.finalDecision).toBe('PROMOTED')
    expect(retrieved.gpaSnapshot).toBe(9.0)
  })
})
