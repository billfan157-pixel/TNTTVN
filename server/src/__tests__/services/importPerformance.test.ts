import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  academicYears,
  auditLogs,
  branches,
  classes,
  importBatches,
  importBatchStudents,
  mappingMemory,
  serviceAssignments,
  students,
  users,
} from '../../db/schema.js'
import { importStudents } from '../../services/importService.js'

const ROW_COUNT = 120
const PREFIX = `import-performance-${Date.now()}`
const PARISH_ID = `parish-${PREFIX}`
const USER_ID = `user-${PREFIX}`
const BRANCH_ID = `branch-${PREFIX}`
const ACADEMIC_YEAR_ID = `ay-${PREFIX}`
const CLASS_ID = `class-${PREFIX}`

describe('importStudents performance regression', () => {
  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(users).values({
      id: USER_ID,
      username: USER_ID,
      passwordHash: 'test-only',
      fullName: 'Import Performance Admin',
      role: 'admin',
      parishId: PARISH_ID,
      createdAt: now,
    })
    await db.insert(branches).values({
      id: BRANCH_ID,
      name: 'Thiếu Nhi',
      scarfColor: '#2563eb',
      ageMin: 10,
      ageMax: 12,
      parishId: PARISH_ID,
      createdAt: now,
      updatedAt: now,
      updatedBy: USER_ID,
    })
    await db.insert(academicYears).values({
      id: ACADEMIC_YEAR_ID,
      startDate: '2026-08-01',
      endDate: '2027-07-31',
      isLocked: 0,
      parishId: PARISH_ID,
      createdAt: now,
      updatedAt: now,
      updatedBy: USER_ID,
    })
    await db.insert(classes).values({
      id: CLASS_ID,
      code: 'TN-PERF',
      name: 'Thiếu Nhi Performance',
      branchId: BRANCH_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      parishId: PARISH_ID,
      createdAt: now,
      updatedAt: now,
      updatedBy: USER_ID,
    })
  })

  afterAll(async () => {
    await db.delete(serviceAssignments).where(eq(serviceAssignments.parishId, PARISH_ID))
    await db.delete(importBatchStudents).where(eq(importBatchStudents.parishId, PARISH_ID))
    await db.delete(importBatches).where(eq(importBatches.parishId, PARISH_ID))
    await db.delete(mappingMemory).where(eq(mappingMemory.parishId, PARISH_ID))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, PARISH_ID))
    await db.delete(students).where(eq(students.parishId, PARISH_ID))
    await db.delete(classes).where(eq(classes.parishId, PARISH_ID))
    await db.delete(academicYears).where(eq(academicYears.parishId, PARISH_ID))
    await db.delete(branches).where(eq(branches.parishId, PARISH_ID))
    await db.delete(users).where(eq(users.id, USER_ID))
  })

  it('imports 120 new students inside the local regression budget', async () => {
    const rows = Array.from({ length: ROW_COUNT }, (_, index) => ({
      rowIndex: index + 1,
      holyName: index % 2 === 0 ? 'Giuse' : 'Maria',
      fullName: `Học viên hiệu năng ${index + 1}`,
      gender: index % 2 === 0 ? 'Nam' : 'Nữ',
      dateOfBirth: `2015-01-${String((index % 28) + 1).padStart(2, '0')}`,
      parentName: `Phụ huynh ${index + 1}`,
      parentPhone: `0901${String(index).padStart(6, '0')}`,
      address: 'Địa chỉ kiểm thử',
      branch: 'ThieuNhi',
      className: 'Thiếu Nhi Performance',
    }))

    const startedAt = performance.now()
    const result = await importStudents({
      rows,
      classMappings: { 'Thiếu Nhi Performance': CLASS_ID },
      newClasses: [],
      duplicateActions: {},
      fileName: 'performance.xlsx',
    }, USER_ID, PARISH_ID, '127.0.0.1', 'Vitest')
    const durationMs = performance.now() - startedAt

    console.info(`[import-performance] rows=${ROW_COUNT} durationMs=${durationMs.toFixed(1)}`)
    expect(result.imported, JSON.stringify(result.report)).toBe(ROW_COUNT)
    expect(result.errors).toBe(0)
    expect(result.studentChanges).toHaveLength(ROW_COUNT)
    expect(result.studentChanges.every(change => change.action === 'created')).toBe(true)
    expect(new Set(result.studentChanges.map(change => change.student.code)).size).toBe(ROW_COUNT)
    expect(result.studentChanges.every(change => change.student.parishId === PARISH_ID)).toBe(true)
    expect(durationMs).toBeLessThan(2_000)
  }, 30_000)

  it('falls back to isolated rows when an atomic fast-path chunk fails', async () => {
    await db.run(sql.raw(`
      CREATE TRIGGER import_performance_fallback_trigger
      BEFORE INSERT ON students
      WHEN NEW.parish_id = '${PARISH_ID}' AND NEW.full_name = 'Force Fast Path Failure'
      BEGIN
        SELECT RAISE(ABORT, 'forced fast path failure');
      END
    `))

    try {
      const result = await importStudents({
        rows: [
          {
            rowIndex: 1001, holyName: 'Giuse', fullName: 'Fast Path Survivor', gender: 'Nam',
            dateOfBirth: '2015-04-01', parentName: 'Phụ huynh A', parentPhone: '0920001001',
            address: 'Địa chỉ A', branch: 'ThieuNhi', className: 'Thiếu Nhi Performance',
          },
          {
            rowIndex: 1002, holyName: 'Maria', fullName: 'Force Fast Path Failure', gender: 'Nữ',
            dateOfBirth: '2015-04-02', parentName: 'Phụ huynh B', parentPhone: '0920001002',
            address: 'Địa chỉ B', branch: 'ThieuNhi', className: 'Thiếu Nhi Performance',
          },
        ],
        classMappings: { 'Thiếu Nhi Performance': CLASS_ID },
        newClasses: [],
        duplicateActions: {},
      }, USER_ID, PARISH_ID, '127.0.0.1', 'Vitest')

      expect(result.imported).toBe(1)
      expect(result.errors).toBe(1)
      expect(result.studentChanges).toHaveLength(1)
      expect(result.studentChanges[0].student.fullName).toBe('Fast Path Survivor')
    } finally {
      await db.run(sql.raw('DROP TRIGGER IF EXISTS import_performance_fallback_trigger'))
    }
  })
})
