import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { db } from '../../db/index.js'
import { users, students, classes, branches, academicYears, auditLogs, importBatches, importBatchStudents, serviceAssignments, mappingMemory } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { importStudents } from '../../services/importService.js'

// A-NEW-22 (2026-08-11): classMappings (client-supplied) phải thuộc parish hiện tại —
// trước fix attacker cùng parish có thể gán student vào classId của parish khác.

const PREFIX = Date.now()
const parishA = `parish-import-a-${PREFIX}`
const parishB = `parish-import-b-${PREFIX}`
const adminId = `usr-import-admin-${PREFIX}`
const classB = `cls-import-b-${PREFIX}`
const ayId = `AY-${PREFIX}`
const STRONG = 'Parish@123456'

describe('A-NEW-22 — importStudents: classMappings phải scoped theo parish', () => {
  beforeAll(async () => {
    const now = new Date().toISOString()
    const year = new Date().getFullYear()
    // Branch id 'ChienCon' là PK toàn cục — nếu đã tồn tại cho parish khác trong test DB,
    // chuyển ownership sang parishA (test DB, không seed production).
    await db.insert(branches).values({ id: 'ChienCon', name: 'ChienCon', scarfColor: '#EC4899', ageMin: 4, ageMax: 6, parishId: parishA, createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
    await db.insert(branches).values({ id: 'ChienCon', name: 'ChienCon', scarfColor: '#EC4899', ageMin: 4, ageMax: 6, parishId: parishB, createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: ayId, parishId: parishA, startDate: `${year}-08-01`, endDate: `${year + 1}-07-31`, isLocked: 0, createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: ayId, parishId: parishB, startDate: `${year}-08-01`, endDate: `${year + 1}-07-31`, isLocked: 0, createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
    // Class thuộc parish B (kẻ tấn công muốn trỏ vào)
    await db.insert(classes).values({ id: classB, code: 'LOP-B', name: 'Lớp B', branchId: 'ChienCon', academicYearId: ayId, parishId: parishB, createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
    await db.insert(users).values({
      id: adminId,
      username: `import_admin_${PREFIX}`,
      fullName: 'Import Admin',
      passwordHash: await bcrypt.hash(STRONG, 4),
      role: 'admin',
      parishId: parishA,
      tokenVersion: 1,
      status: 'ACTIVE',
      createdAt: now,
    }).onConflictDoNothing()
  })

  afterAll(async () => {
    await db.delete(importBatchStudents).where(eq(importBatchStudents.parishId, parishA))
    await db.delete(students).where(eq(students.parishId, parishA))
    await db.delete(importBatches).where(eq(importBatches.userId, adminId))
    await db.delete(serviceAssignments).where(eq(serviceAssignments.parishId, parishA))
    await db.delete(mappingMemory).where(eq(mappingMemory.parishId, parishA))
    await db.delete(classes).where(and(eq(classes.parishId, parishB), eq(classes.id, classB)))
    await db.delete(classes).where(eq(classes.parishId, parishA))
    await db.delete(academicYears).where(eq(academicYears.parishId, parishB))
    await db.delete(academicYears).where(eq(academicYears.parishId, parishA))
    await db.delete(branches).where(eq(branches.parishId, parishB))
    await db.delete(auditLogs).where(eq(auditLogs.userId, adminId))
    await db.delete(users).where(eq(users.id, adminId))
    await db.delete(branches).where(and(eq(branches.parishId, parishA), eq(branches.id, 'ChienCon')))
  })

  it('classMappings trỏ classId cross-parish → KHÔNG được dùng; chỉ tạo lớp khi payload yêu cầu rõ ràng', async () => {
    const rows = [{ rowIndex: 0, holyName: 'Gioan', fullName: 'Nguyễn Văn An', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Bố', parentPhone: '0900000001', address: 'Xã X', branch: 'ChienCon', className: 'Lớp Cross Parish' }]

    const result = await importStudents(
      {
        rows,
        academicYearId: ayId,
        classMappings: { 'Lớp Cross Parish': classB },
        newClasses: [{ name: 'Lớp Cross Parish', branch: 'ChienCon', academicYearId: ayId }],
        duplicateActions: {},
        fileName: 'cross-parish.xlsx',
      },
      adminId,
      parishA,
      '127.0.0.1',
      'test-agent',
    )

    expect(result.imported, JSON.stringify(result.report)).toBe(1)
    const [student] = await db.select().from(students).where(eq(students.parishId, parishA)).limit(1)
    expect(student).toBeTruthy()
    // classId phải KHÔNG trỏ class của parish B
    expect(student.classId).not.toBe(classB)
    // classId phải là class được tạo trong parish A
    const [cls] = await db.select().from(classes).where(and(eq(classes.id, student.classId), eq(classes.parishId, parishA)))
    expect(cls).toBeTruthy()
  })

  it('classMappings trỏ classId HỢP LỆ trong parish → vẫn dùng được', async () => {
    const now = new Date().toISOString()
    const ownClassId = `cls-import-own-${PREFIX}`
    await db.insert(classes).values({ id: ownClassId, code: 'LOP-A', name: 'Lớp A', branchId: 'ChienCon', academicYearId: ayId, parishId: parishA, createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()

    const rows = [{ rowIndex: 0, holyName: 'Maria', fullName: 'Trần Thị Bích', gender: 'Nữ', dateOfBirth: '2015-02-02', parentName: 'Mẹ', parentPhone: '0900000002', address: 'Xã Y', branch: 'ChienCon', className: 'Lớp A' }]

    const result = await importStudents(
      { rows, academicYearId: ayId, classMappings: { 'Lớp A': ownClassId }, duplicateActions: {}, fileName: 'own-class.xlsx' },
      adminId,
      parishA,
      '127.0.0.1',
      'test-agent',
    )

    expect(result.imported, JSON.stringify(result.report)).toBe(1)
    const [student] = await db.select().from(students).where(eq(students.classId, ownClassId)).limit(1)
    expect(student).toBeTruthy()
    expect(student.parishId).toBe(parishA)
  })
})
