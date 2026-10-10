import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { academicYears, auditLogs, branches, classes, importBatches, importBatchStudents, students, users } from '../../db/schema.js'
import { createStudent } from '../../services/studentService.js'
import { detectDuplicates, importStudents } from '../../services/importService.js'

const parish = 'identity-create-test'
const otherParish = 'identity-create-other'
const yearId = 'identity-year'
const classId = 'identity-class'
const adminId = 'identity-admin'
const base = {
  fullName: 'Đặng Văn An', holyName: 'Giuse', gender: 'Nam' as const,
  dateOfBirth: '2016-04-09', parentName: '', parentPhone: '', address: '',
  branch: 'AuNhi' as const, classId,
}
const importRow = { ...base, rowIndex: 1, className: 'Identity Class' }
const importInput = (rows = [importRow], duplicateActions: Record<string, 'skip' | 'update' | 'create'> = {}) => ({
  rows, duplicateActions, academicYearId: yearId, classMappings: { 'Identity Class': classId },
})
const add = (data = base, key?: string) => createStudent(data, adminId, parish, 'test', 'Vitest', key)

async function clearRows(scope: string) {
  await db.delete(importBatchStudents).where(eq(importBatchStudents.parishId, scope))
  await db.delete(importBatches).where(eq(importBatches.parishId, scope))
  await db.delete(auditLogs).where(eq(auditLogs.parishId, scope))
  await db.delete(students).where(eq(students.parishId, scope))
}

describe('Student identity policy across all creation writers', () => {
  beforeAll(async () => {
    for (const scope of [parish, otherParish]) {
      await db.insert(users).values({ id: adminId, username: `identity-admin-${scope}`, passwordHash: 'hash', fullName: 'Identity Admin', role: 'admin', parishId: scope }).onConflictDoNothing()
      await db.insert(branches).values({ id: 'identity-branch', name: 'Ấu Nhi', ageMin: 7, ageMax: 9, scarfColor: '', parishId: scope }).onConflictDoNothing()
      await db.insert(academicYears).values({ id: yearId, startDate: '2025-08-01', endDate: '2026-07-31', status: 'OPEN', parishId: scope }).onConflictDoNothing()
      for (const id of [classId, `${classId}-other`]) {
        await db.insert(classes).values({ id, code: id, name: 'Identity Class', branchId: 'identity-branch', academicYearId: yearId, parishId: scope }).onConflictDoNothing()
      }
    }
  })
  beforeEach(async () => { await clearRows(parish); await clearRows(otherParish) })
  afterAll(async () => {
    for (const scope of [parish, otherParish]) {
      await clearRows(scope)
      await db.delete(classes).where(eq(classes.parishId, scope))
      await db.delete(branches).where(eq(branches.parishId, scope))
      await db.delete(academicYears).where(eq(academicYears.parishId, scope))
      await db.delete(users).where(eq(users.parishId, scope))
    }
  })

  it.each([undefined, 'new-command'])('rejects a second identity regardless of request key (%s), holy name or class', async (key) => {
    const first = await add(base, 'first-command')
    await expect(add({ ...base, fullName: '  DANG   VAN AN ', holyName: 'Phêrô', classId: `${classId}-other` }, key))
      .rejects.toMatchObject({ code: 'STUDENT_ALREADY_EXISTS', status: 409 })
    const persisted = await db.select().from(students).where(eq(students.parishId, parish))
    expect(persisted.map(student => student.id)).toEqual([first.id])
  })

  it('serializes concurrent different-key commands; only one student and CREATE audit commit', async () => {
    const results = await Promise.allSettled([add(base, 'race-a'), add(base, 'race-b')])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'STUDENT_ALREADY_EXISTS', status: 409 } })
    expect(await db.select().from(students).where(eq(students.parishId, parish))).toHaveLength(1)
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.parishId, parish), eq(auditLogs.action, 'CREATE')))).toHaveLength(1)
  })

  it('allows a namesake with a different DOB and the same parent phone', async () => {
    await add({ ...base, parentPhone: '0901234567' })
    await add({ ...base, parentPhone: '0901234567', dateOfBirth: '2017-04-09' })
    expect(await db.select().from(students).where(eq(students.parishId, parish))).toHaveLength(2)
  })

  it('does not expose or block the matching identity in another parish', async () => {
    await createStudent(base, adminId, otherParish, 'test', 'Vitest')
    await expect(add()).resolves.toMatchObject({ parishId: parish })
  })

  it('does not recreate a soft-deleted identity', async () => {
    const first = await add()
    await db.update(students).set({ deletedAt: new Date().toISOString() }).where(and(eq(students.id, first.id), eq(students.parishId, parish)))
    await expect(add()).rejects.toMatchObject({ code: 'STUDENT_ALREADY_EXISTS' })
    expect(await db.select().from(students).where(eq(students.parishId, parish))).toHaveLength(1)
  })

  it('blocks import create overrides and detects the unaccented đ variant without phone matching', async () => {
    await add()
    const row = { ...importRow, fullName: 'Dang Van An', holyName: 'Phêrô' }
    const duplicates = await detectDuplicates([row], parish)
    expect(duplicates.get(1)).toMatchObject({ creationBlocked: true })
    const skipped = await importStudents(importInput([row]), adminId, parish, 'test', 'Vitest')
    expect(skipped).toMatchObject({ imported: 0, skipped: 1, errors: 0 })
    const rejected = await importStudents(importInput([row], { '1': 'create' }), adminId, parish, 'test', 'Vitest')
    expect(rejected).toMatchObject({ imported: 0, errors: 1 })
    expect(await db.select().from(students).where(eq(students.parishId, parish))).toHaveLength(1)
  })

  it('blocks an intra-file create override after the first row commits', async () => {
    const result = await importStudents(importInput([importRow, { ...importRow, rowIndex: 2 }], { '2': 'create' }), adminId, parish, 'test', 'Vitest')
    expect(result).toMatchObject({ imported: 1, errors: 1 })
    expect(await db.select().from(students).where(eq(students.parishId, parish))).toHaveLength(1)
  })

  it('rechecks a stale import snapshot at bulk commit and preserves unrelated rows via fallback', async () => {
    const originalTransaction = db.transaction.bind(db)
    let transactions = 0
    // The first import transaction persists its batch. Inject a real creator
    // just before the bulk write transaction, after dupMap was built.
    const spy = vi.spyOn(db, 'transaction').mockImplementation(async (callback, config) => {
      transactions++
      if (transactions === 2) {
        spy.mockRestore()
        await add(base, 'between-preview-and-commit')
      }
      return originalTransaction(callback, config)
    })
    try {
      const unrelated = { ...importRow, rowIndex: 2, fullName: 'Lê Văn Bình' }
      const result = await importStudents(importInput([importRow, unrelated]), adminId, parish, 'test', 'Vitest')
      expect(result).toMatchObject({ imported: 1, errors: 1 })
      const persisted = await db.select().from(students).where(eq(students.parishId, parish))
      expect(persisted.map(student => student.fullName).sort()).toEqual(['Lê Văn Bình', base.fullName].sort())
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.parishId, parish))
      expect(logs.filter(log => log.action === 'IMPORT_CREATE')).toHaveLength(1)
    } finally { spy.mockRestore() }
  })
})
