import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../server/src/db/index.js'
import {
  academicYears,
  auditLogs,
  branches,
  catechistAssignments,
  classes,
  examResults,
  examSessions,
  importBatches,
  mappingMemory,
  serviceAssignments,
  students,
  users,
} from '../../server/src/db/schema.js'
import { deleteClass, updateClass } from '../../server/src/services/classService.js'
import { getUserClassIds } from '../../server/src/services/classAccessQueryService.js'
import {
  detectDuplicates,
  importStudents,
  normalizeImportRows,
  undoImport,
  validateImport,
} from '../../server/src/services/importService.js'
import { createStudent, updateStudent } from '../../server/src/services/studentService.js'
import { updateUserAssignments } from '../../server/src/services/userService.js'
import { parseToImportRows } from '../../src/utils/excelParser'

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const parishId = `roster-audit-${suffix}`
const validationParishId = `roster-validate-audit-${suffix}`
const branchAu = `branch-au-${suffix}`
const branchHs = `branch-hs-${suffix}`
const yearOld = `year-old-${suffix}`
const yearCurrent = `year-current-${suffix}`
const adminId = `admin-${suffix}`
const undoAdminId = `undo-admin-${suffix}`
const teacherId = `teacher-${suffix}`
const classA = `class-a-${suffix}`
const classB = `class-b-${suffix}`
const classDeleted = `class-deleted-${suffix}`
const classLegacyDeleted = `class-legacy-deleted-${suffix}`
const classMutable = `class-mutable-${suffix}`
const classSameNameOld = `class-same-old-${suffix}`
const classSameNameCurrent = `class-same-current-${suffix}`
const studentUndo = `student-undo-${suffix}`
const studentDeleteClass = `student-deleted-class-${suffix}`
const studentDedupe = `student-dedupe-${suffix}`
const studentMutableClass = `student-mutable-class-${suffix}`

const importRow = (overrides: Record<string, unknown> = {}) => ({
  rowIndex: 1,
  holyName: 'Maria',
  fullName: 'Nguyễn Thị Minh',
  gender: 'Nữ',
  dateOfBirth: '2014-03-12',
  parentName: 'Phụ huynh audit',
  parentPhone: '0901234567',
  address: 'Địa chỉ audit',
  branch: 'AuNhi',
  className: 'Audit Class B',
  service: 'no',
  ...overrides,
})

async function cleanupParish(targetParishId: string): Promise<void> {
  await db.delete(examResults).where(eq(examResults.parishId, targetParishId))
  await db.delete(examSessions).where(eq(examSessions.parishId, targetParishId))
  await db.delete(serviceAssignments).where(eq(serviceAssignments.parishId, targetParishId))
  await db.delete(mappingMemory).where(eq(mappingMemory.parishId, targetParishId))
  await db.delete(importBatches).where(eq(importBatches.parishId, targetParishId))
  await db.delete(auditLogs).where(eq(auditLogs.parishId, targetParishId))
  await db.delete(catechistAssignments).where(eq(catechistAssignments.parishId, targetParishId))
  await db.delete(students).where(eq(students.parishId, targetParishId))
  await db.delete(classes).where(eq(classes.parishId, targetParishId))
  await db.delete(users).where(eq(users.parishId, targetParishId))
  await db.delete(branches).where(eq(branches.parishId, targetParishId))
  await db.delete(academicYears).where(eq(academicYears.parishId, targetParishId))
}

beforeAll(async () => {
  await cleanupParish(parishId)
  await cleanupParish(validationParishId)

  await db.insert(branches).values([
    { id: branchAu, parishId, name: 'Ấu Nhi', scarfColor: 'Xanh lá', ageMin: 7, ageMax: 10 },
    { id: branchHs, parishId, name: 'Hiệp Sĩ', scarfColor: 'Nâu', ageMin: 15, ageMax: 18 },
  ])
  await db.insert(academicYears).values([
    { id: yearOld, parishId, startDate: '2025-08-01', endDate: '2026-07-31' },
    { id: yearCurrent, parishId, startDate: '2026-08-01', endDate: '2027-07-31' },
  ])
  await db.insert(users).values([
    { id: adminId, parishId, username: `roster_admin_${suffix}`, fullName: 'Roster Audit Admin', passwordHash: 'hash', role: 'admin' },
    { id: undoAdminId, parishId, username: `roster_undo_admin_${suffix}`, fullName: 'Roster Undo Admin', passwordHash: 'hash', role: 'admin' },
    { id: teacherId, parishId, username: `roster_teacher_${suffix}`, fullName: 'Roster Audit Teacher', passwordHash: 'hash', role: 'chunhiem', status: 'ACTIVE' },
  ])
  await db.insert(classes).values([
    { id: classA, parishId, code: `AUD-A-${suffix}`, name: 'Audit Class A', branchId: branchAu, academicYearId: yearCurrent },
    { id: classB, parishId, code: `AUD-B-${suffix}`, name: 'Audit Class B', branchId: branchAu, academicYearId: yearCurrent },
    { id: classDeleted, parishId, code: `AUD-D-${suffix}`, name: 'Audit Class To Delete', branchId: branchAu, academicYearId: yearCurrent },
    { id: classLegacyDeleted, parishId, code: `AUD-LD-${suffix}`, name: 'Legacy Deleted Class', branchId: branchAu, academicYearId: yearCurrent, deletedAt: new Date().toISOString() },
    { id: classMutable, parishId, code: `AUD-M-${suffix}`, name: 'Audit Class Mutable', branchId: branchAu, academicYearId: yearCurrent },
    { id: classSameNameOld, parishId, code: `SAME-OLD-${suffix}`, name: 'Ấu Nhi 1', branchId: branchAu, academicYearId: yearOld, createdAt: '2025-08-01T00:00:00.000Z' },
    { id: classSameNameCurrent, parishId, code: `SAME-CUR-${suffix}`, name: 'Ấu Nhi 1', branchId: branchAu, academicYearId: yearCurrent, createdAt: '2026-08-01T00:00:00.000Z' },
  ])
  await db.insert(students).values([
    {
      id: studentUndo, parishId, code: `ST-UNDO-${suffix}`, holyName: 'Maria', fullName: 'Nguyễn Thị Minh',
      gender: 'Nữ', dateOfBirth: '2014-03-12', parentName: 'Phụ huynh audit', parentPhone: '0901234567',
      address: 'Địa chỉ audit', branch: 'AuNhi', classId: classA,
    },
    {
      id: studentDeleteClass, parishId, code: `ST-DEL-${suffix}`, holyName: 'Gioan', fullName: 'Student In Deleted Class',
      gender: 'Nam', dateOfBirth: '2013-01-01', parentName: 'Parent', parentPhone: '0909999999',
      address: 'Audit', branch: 'AuNhi', classId: classDeleted,
    },
    {
      id: studentDedupe, parishId, code: `ST-DUP-${suffix}`, holyName: 'Giuse', fullName: 'Nguyễn Văn Ánh',
      gender: 'Nam', dateOfBirth: '2012-02-02', parentName: 'Parent', parentPhone: 'Chưa cập nhật',
      address: 'Audit', branch: 'AuNhi', classId: classA,
    },
    {
      id: studentMutableClass, parishId, code: `ST-MUT-${suffix}`, holyName: 'Anna', fullName: 'Student In Mutable Class',
      gender: 'Nữ', dateOfBirth: '2014-01-01', parentName: 'Parent', parentPhone: '0908888888',
      address: 'Audit', branch: 'AuNhi', classId: classMutable,
    },
  ])
  await db.insert(catechistAssignments).values([
    {
      id: `assignment-deleted-${suffix}`, parishId, userId: teacherId, classId: classDeleted,
      roleInClass: 'chunhiem', updatedBy: adminId,
    },
    {
      id: `assignment-legacy-deleted-${suffix}`, parishId, userId: teacherId, classId: classLegacyDeleted,
      roleInClass: 'phuta', updatedBy: adminId,
    },
  ])
})

afterAll(async () => {
  await cleanupParish(parishId)
  await cleanupParish(validationParishId)
})

describe('Students, Classes, Personnel & Import audit reproducibility probes', () => {
  it('regression R7-08: validation fails closed without creating an academic year', async () => {
    expect(await db.select().from(academicYears).where(eq(academicYears.parishId, validationParishId))).toHaveLength(0)

    await expect(validateImport([], validationParishId, [], '')).rejects.toMatchObject({ code: 'ACADEMIC_YEAR_REQUIRED' })

    expect(await db.select().from(academicYears).where(eq(academicYears.parishId, validationParishId))).toHaveLength(0)
  })

  it('regression R7-13: import rejects a real date before the manual 1900 lower bound', async () => {
    const result = await validateImport([importRow({
      rowIndex: 2,
      fullName: 'Pre 1900 Probe',
      dateOfBirth: '1899-12-31',
      parentPhone: '0933333333',
    })], parishId, [
      { id: classB, name: 'Audit Class B', code: `AUD-B-${suffix}`, branchId: branchAu, branchName: 'Ấu Nhi', academicYearId: yearCurrent },
    ], yearCurrent)

    expect(result.rows[0].errors).toContain('Ngày sinh không hợp lệ, phải từ năm 1900 và không nằm trong tương lai')
  })

  it('regression R7-03: class deletion is blocked by live membership/assignments and stale deleted-class scope is ignored', async () => {
    await expect(deleteClass(classDeleted, adminId, parishId, '127.0.0.1', 'roster-audit')).rejects.toMatchObject({
      code: 'CLASS_HAS_DEPENDENCIES',
    })

    const [student] = await db.select().from(students).where(and(
      eq(students.parishId, parishId), eq(students.id, studentDeleteClass), isNull(students.deletedAt),
    ))
    expect(student.classId).toBe(classDeleted)
    const authorizedClassIds = await getUserClassIds(teacherId, parishId)
    expect(authorizedClassIds).toContain(classDeleted)
    expect(authorizedClassIds).not.toContain(classLegacyDeleted)
  })

  it('regression R7-05: user-centric assignment enforces the one-homeroom-class limit', async () => {
    await expect(updateUserAssignments(teacherId, [classA, classB], adminId, parishId, '127.0.0.1', 'roster-audit')).rejects.toMatchObject({
      code: 'USER_ALREADY_CN',
    })

    const rows = await db.select().from(catechistAssignments).where(and(
      eq(catechistAssignments.parishId, parishId),
      eq(catechistAssignments.userId, teacherId),
      eq(catechistAssignments.roleInClass, 'chunhiem'),
    ))
    expect(rows.map(row => row.classId)).toEqual([classDeleted])
  })

  it('regression R7-04: class branch/year rewrite is blocked while active membership exists', async () => {
    await expect(updateClass(classMutable, {
      branchId: branchHs,
      academicYearId: yearOld,
    }, adminId, parishId, '127.0.0.1', 'roster-audit')).rejects.toMatchObject({ code: 'CLASS_STRUCTURE_LOCKED' })

    const [student] = await db.select().from(students).where(and(
      eq(students.parishId, parishId), eq(students.id, studentMutableClass),
    ))
    const [classRow] = await db.select().from(classes).where(and(
      eq(classes.parishId, parishId), eq(classes.id, classMutable),
    ))
    expect(classRow).toMatchObject({ branchId: branchAu, academicYearId: yearCurrent })
    expect(student).toMatchObject({ branch: 'AuNhi', classId: classMutable })
  })

  it('regression R7-01: normalized name plus DOB finds a diacritic/case variant', async () => {
    const duplicates = await detectDuplicates([importRow({
      rowIndex: 41,
      fullName: 'nguyen van anh',
      dateOfBirth: '2012-02-02',
      parentPhone: 'Chưa cập nhật',
      className: 'Audit Class A',
    })], parishId)

    expect(duplicates.get(41)).toMatchObject({ studentId: studentDedupe, reason: 'name_dob_diff_holy_name' })
  })

  it('regression R7-07: blank gender remains unknown and validation requires an explicit value', async () => {
    const [clientRow] = parseToImportRows(
      [['Maria', 'Trần Thị Mai', '', '12/03/2014', '', '', '', 'Ấu Nhi', 'Audit Class A']],
      { holyName: 0, fullName: 1, gender: 2, dateOfBirth: 3, parentName: 4, parentPhone: 5, address: 6, branch: 7, className: 8 },
    )
    const [serverRow] = normalizeImportRows([clientRow])

    expect(clientRow.gender).toBe('')
    expect(serverRow.gender).toBe('')
    const validation = await validateImport([serverRow], parishId, [
      { id: classA, name: 'Audit Class A', code: `AUD-A-${suffix}`, branchId: branchAu, branchName: 'Ấu Nhi', academicYearId: yearCurrent },
    ], yearCurrent)
    expect(validation.rows[0].errors).toContain('Thiếu Giới Tính')
    expect(validation.rows[0].branch).toBe('AuNhi')
  })

  it('regression R7-06: exact class-name matching is scoped to the selected academic year', async () => {
    const result = await validateImport([importRow({
      rowIndex: 51,
      fullName: 'Unique Academic Year Probe',
      parentPhone: '0912345678',
      className: 'Ấu Nhi 1',
    })], parishId, [
      { id: classSameNameOld, name: 'Ấu Nhi 1', code: `SAME-OLD-${suffix}`, branchId: branchAu, branchName: 'Ấu Nhi', academicYearId: yearOld },
      { id: classSameNameCurrent, name: 'Ấu Nhi 1', code: `SAME-CUR-${suffix}`, branchId: branchAu, branchName: 'Ấu Nhi', academicYearId: yearCurrent },
    ], yearCurrent)

    expect(result.rows[0].classMatch?.id).toBe(classSameNameCurrent)
  })

  it('regression R7-06: fuzzy class matching requires a clear lead instead of selecting a tie', async () => {
    const first = `fuzzy-first-${suffix}`
    const second = `fuzzy-second-${suffix}`
    const result = await validateImport([importRow({
      rowIndex: 52,
      fullName: 'Unique Fuzzy Tie Probe',
      parentPhone: '0922345678',
      className: 'Au Nhi 1',
      branch: 'AuNhi',
    })], parishId, [
      { id: first, name: 'Au Nhi 1 A', code: `FUZZ-A-${suffix}`, branchId: branchAu, branchName: 'AuNhi', academicYearId: yearCurrent },
      { id: second, name: 'Au Nhi 1 B', code: `FUZZ-B-${suffix}`, branchId: branchAu, branchName: 'AuNhi', academicYearId: yearCurrent },
    ], yearCurrent)

    expect(result.rows[0].classSuggestions).toHaveLength(2)
    expect(result.rows[0].classSuggestions[0].confidence).toBe(result.rows[0].classSuggestions[1].confidence)
    expect(result.rows[0].classMatch).toBeNull()
  })

  it('regression R7-10: undo blocks an updated student after a downstream exam result', async () => {
    const imported = await importStudents({
      rows: [importRow()],
      academicYearId: yearCurrent,
      classMappings: { 'Audit Class B': classB },
      duplicateActions: { '1': 'update' },
      fileName: 'undo-dependency-probe.xlsx',
    }, adminId, parishId, '127.0.0.1', 'roster-audit')
    expect(imported.imported).toBe(1)

    const examSessionId = `exam-after-import-${suffix}`
    await db.insert(examSessions).values({
      id: examSessionId, parishId, classId: classB, subject: 'Undo dependency probe', scoreType: '15m',
      maxScore: 10, semester: 1, academicYear: yearCurrent, createdBy: adminId,
      idempotencyKey: `exam-after-import-key-${suffix}`,
    })
    await db.insert(examResults).values({
      id: `result-after-import-${suffix}`, parishId, examSessionId, studentId: studentUndo, score: 8,
      source: 'quick_entry', examVersion: 'A', savedBy: adminId,
    })

    const undone = await undoImport(imported.batchId, parishId, adminId)
    const [student] = await db.select().from(students).where(and(eq(students.parishId, parishId), eq(students.id, studentUndo)))
    expect(undone.undone).toBe(0)
    expect(undone.errors).toHaveLength(1)
    expect(undone.items[0]).toMatchObject({ studentId: studentUndo, status: 'blocked' })
    expect(student.classId).toBe(classB)
  })

  it('regression R7-11: undo records the current administrator as the recovery actor', async () => {
    const imported = await importStudents({
      rows: [importRow({
        rowIndex: 53,
        fullName: 'Undo Actor Probe',
        dateOfBirth: '2014-06-06',
        parentPhone: '0966666653',
      })],
      academicYearId: yearCurrent,
      classMappings: { 'Audit Class B': classB },
      duplicateActions: {},
      fileName: 'undo-actor-probe.xlsx',
    }, adminId, parishId, '127.0.0.1', 'roster-audit')
    const createdStudentId = imported.studentChanges[0]?.student.id
    expect(createdStudentId).toBeTruthy()

    const undone = await undoImport(imported.batchId, parishId, undoAdminId)
    const [student] = await db.select().from(students).where(and(eq(students.parishId, parishId), eq(students.id, createdStudentId!)))
    const [audit] = await db.select().from(auditLogs).where(and(
      eq(auditLogs.parishId, parishId), eq(auditLogs.entityId, createdStudentId!), eq(auditLogs.action, 'UNDO_IMPORT'),
    )).limit(1)
    expect(undone).toMatchObject({ undone: 1, errors: [] })
    expect(student.updatedBy).toBe(undoAdminId)
    expect(audit.userId).toBe(undoAdminId)
  })

  it('regression R7-09: a failed all-error batch cleans up its unreferenced pre-created class', async () => {
    const orphanName = `Orphan Audit ${suffix}`
    const result = await importStudents({
      rows: [importRow({ rowIndex: 61, fullName: '', className: orphanName })],
      academicYearId: yearCurrent,
      classMappings: {},
      newClasses: [{ name: orphanName, branch: branchAu, academicYearId: yearCurrent }],
      duplicateActions: {},
      fileName: 'orphan-probe.xlsx',
    }, adminId, parishId, '127.0.0.1', 'roster-audit')

    const [batch] = await db.select().from(importBatches).where(and(eq(importBatches.parishId, parishId), eq(importBatches.id, result.batchId)))
    const [orphanClass] = await db.select().from(classes).where(and(
      eq(classes.parishId, parishId), eq(classes.name, orphanName),
    ))
    expect(batch.status).toBe('failed')
    expect(orphanClass).toBeDefined()
    expect(orphanClass.deletedAt).toBeTruthy()
    expect(result.orphanClasses).toBeUndefined()
    await expect(undoImport(result.batchId, parishId, adminId)).rejects.toThrow('đã được hoàn tác hoặc đang xử lý')
  })

  it('regression R7-02: manual create rejects a branch that conflicts with the selected class', async () => {
    await expect(createStudent({
      holyName: 'Phêrô', fullName: 'Branch Mismatch Probe', gender: 'Nam', dateOfBirth: '2013-05-05',
      parentName: 'Parent', parentPhone: '0987654321', address: 'Audit', branch: 'HiepSi', classId: classA,
      baptismDate: null, firstCommunionDate: null, confirmationDate: null, avatarUrl: null, status: 'Đang học', notes: null,
    }, adminId, parishId, '127.0.0.1', 'roster-audit', `branch-mismatch-${suffix}`)).rejects.toMatchObject({
      code: 'BRANCH_CLASS_MISMATCH',
    })
  })

  it('regression R7-14: generic membership correction requires an explicit reason', async () => {
    await expect(updateStudent(
      studentMutableClass,
      { classId: classB, branch: 'AuNhi' },
      adminId,
      parishId,
      '127.0.0.1',
      'roster-audit',
    )).rejects.toMatchObject({ code: 'MEMBERSHIP_CHANGE_REASON_REQUIRED' })

    const [student] = await db.select().from(students).where(and(
      eq(students.parishId, parishId),
      eq(students.id, studentMutableClass),
    ))
    expect(student.classId).toBe(classMutable)
  })
})
