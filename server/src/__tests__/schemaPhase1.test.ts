import { describe, it, expect } from 'vitest'
import { client, db } from '../db/index.js'
import { branches, classes, academicYears, attendanceSessions, students, grades } from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { eq } from 'drizzle-orm'

describe('Phase 1 Schema Audit Fixes (F1, F2 & F4)', () => {
  it('verifies attendance_sessions and assessments tables exist in database', async () => {
    const res = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('attendance_sessions', 'assessments')`
    )
    const tables = (res.rows || []).map((r: any) => r.name)
    expect(tables).toContain('attendance_sessions')
    expect(tables).toContain('assessments')
  })

  it('verifies UNIQUE constraint on attendance_sessions (parish_id, class_id, date, type)', async () => {
    const branchId = generateId('BR')
    const classId = generateId('CLS')
    const yearId = generateId('AY')
    const date = '2026-07-30'
    const parishId = 'gia-ton'

    // Create prerequisite branch, academic year, and class using Drizzle ORM
    await db.insert(branches).values({
      id: branchId,
      name: 'Test Branch',
      scarfColor: 'Red',
      ageMin: 6,
      ageMax: 10,
      parishId,
    })

    await db.insert(academicYears).values({
      id: yearId,
      startDate: '2025-09-01',
      endDate: '2026-06-30',
      parishId,
    })

    await db.insert(classes).values({
      id: classId,
      branchId,
      academicYearId: yearId,
      name: 'Test Class',
      code: classId,
      parishId,
    })

    // Insert first session
    await db.insert(attendanceSessions).values({
      id: generateId('ATS'),
      classId,
      date,
      type: 'SundayMass',
      status: 'OPEN',
      parishId,
    })

    // Attempting to insert duplicate session for same class, date, type must fail with UNIQUE constraint error
    let errorCaught = false
    try {
      await db.insert(attendanceSessions).values({
        id: generateId('ATS'),
        classId,
        date,
        type: 'SundayMass',
        status: 'OPEN',
        parishId,
      })
    } catch (err: any) {
      errorCaught = true
      const errStr = JSON.stringify(err) + ' ' + (err.stack || '') + ' ' + (err.message || '')
      expect(errStr.toLowerCase()).toMatch(/unique|constraint/)
    }

    expect(errorCaught).toBe(true)
  })

  it('verifies DB triggers reject score values out of range 0-10 (Fix F1)', async () => {
    const branchId = generateId('BR')
    const classId = generateId('CLS')
    const yearId = generateId('AY')
    const studentId = generateId('STD')
    const parishId = 'gia-ton'

    await db.insert(branches).values({
      id: branchId,
      name: 'Test Branch F1',
      scarfColor: 'Green',
      ageMin: 6,
      ageMax: 10,
      parishId,
    })

    await db.insert(academicYears).values({
      id: yearId,
      startDate: '2025-09-01',
      endDate: '2026-06-30',
      parishId,
    })

    await db.insert(classes).values({
      id: classId,
      branchId,
      academicYearId: yearId,
      name: 'Test Class F1',
      code: classId,
      parishId,
    })

    await db.insert(students).values({
      id: studentId,
      code: studentId,
      holyName: 'Giuse',
      fullName: 'Test Student',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'Bố Test',
      parentPhone: '0900000000',
      address: 'Xã X',
      branch: 'AuNhi',
      classId,
      parishId,
    })

    // Attempting to insert score > 10 must fail via DB trigger
    let insertError = false
    try {
      await db.insert(grades).values({
        id: generateId('GR'),
        studentId,
        semester: 1,
        academicYear: '2025-2026',
        scoreOral: 15, // Out of range!
        parishId,
      })
    } catch (err: any) {
      insertError = true
      const fullErr = JSON.stringify(err) + ' ' + (err.stack || '') + ' ' + (err.message || '') + ' ' + (err.cause ? JSON.stringify(err.cause) : '')
      expect(fullErr.toLowerCase()).toMatch(/range|constraint|abort/)
    }
    expect(insertError).toBe(true)

    // Valid score insert succeeds
    const validGradeId = generateId('GR')
    await db.insert(grades).values({
      id: validGradeId,
      studentId,
      semester: 1,
      academicYear: '2025-2026',
      scoreOral: 9,
      parishId,
    })

    // Attempting to update score < 0 must fail via DB trigger
    let updateError = false
    try {
      await db.update(grades).set({ scoreOral: -2 }).where(eq(grades.id, validGradeId))
    } catch (err: any) {
      updateError = true
      const fullErr = JSON.stringify(err) + ' ' + (err.stack || '') + ' ' + (err.message || '') + ' ' + (err.cause ? JSON.stringify(err.cause) : '')
      expect(fullErr.toLowerCase()).toMatch(/range|constraint|abort/)
    }
    expect(updateError).toBe(true)
  })

  it('verifies outbox_messages status trigger rejects invalid status (Fix F3)', async () => {
    let errorCaught = false
    try {
      await client.execute({
        sql: `INSERT INTO outbox_messages (id, aggregate_id, event_type, payload, status) VALUES (?, ?, ?, ?, ?)`,
        args: [generateId('OB'), 'AGG-1', 'TestEvent', '{}', 'invalid_status'],
      })
    } catch (err: any) {
      errorCaught = true
      expect(String(err).toLowerCase()).toMatch(/invalid|abort|constraint/)
    }
    expect(errorCaught).toBe(true)
  })

  it('verifies grade_overrides score_field trigger rejects invalid field names (Fix F5)', async () => {
    let errorCaught = false
    try {
      await client.execute({
        sql: `INSERT INTO grade_overrides (id, grade_id, score_field, manual_value, overridden_by) VALUES (?, ?, ?, ?, ?)`,
        args: [generateId('GOV'), 'GR-1', 'invalidScoreField', 8.5, 'USR-1'],
      })
    } catch (err: any) {
      errorCaught = true
      expect(String(err).toLowerCase()).toMatch(/invalid|abort|constraint/)
    }
    expect(errorCaught).toBe(true)
  })

  it('verifies promotion_records foreign key indexes exist (Fix F6)', async () => {
    const res = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_promotion_records_target_class', 'idx_promotion_records_approved_by')`
    )
    const indexes = (res.rows || []).map((r: any) => r.name)
    expect(indexes).toContain('idx_promotion_records_target_class')
    expect(indexes).toContain('idx_promotion_records_approved_by')
  })
})
