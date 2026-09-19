import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../../server/src/db/index.js'
import {
  academicYears,
  auditLogs,
  branches,
  catechistAssignments,
  classes,
  promotionRecords,
  students,
  users,
} from '../../server/src/db/schema.js'
import { createClass, updateClass } from '../../server/src/services/classService.js'
import { createStudent, updateStudent } from '../../server/src/services/studentService.js'

const suffix = `a8-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const parishId = `audit8-parish-${suffix}`
const branchAu = `branch-au-${suffix}`
const branchTn = `branch-tn-${suffix}`
const yearLocked = `year-locked-${suffix}`
const year2025 = `year-2025-${suffix}`
const year2026 = `year-2026-${suffix}`
const adminId = `admin-${suffix}`
const class2025 = `class-2025-${suffix}`
const class2026 = `class-2026-${suffix}`

async function cleanupParish(targetParishId: string): Promise<void> {
  await db.delete(promotionRecords).where(eq(promotionRecords.parishId, targetParishId))
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

  await db.insert(branches).values([
    { id: branchAu, parishId, name: 'Ấu Nhi', scarfColor: 'Xanh lá', ageMin: 7, ageMax: 10 },
    { id: branchTn, parishId, name: 'Thiếu Nhi', scarfColor: 'Xanh dương', ageMin: 10, ageMax: 13 },
  ])

  await db.insert(academicYears).values([
    {
      id: yearLocked,
      parishId,
      startDate: '2023-08-01',
      endDate: '2024-07-31',
      isLocked: 1,
      status: 'ARCHIVED',
    },
    {
      id: year2025,
      parishId,
      startDate: '2025-08-01',
      endDate: '2026-07-31',
      isLocked: 0,
      status: 'ACTIVE',
    },
    {
      id: year2026,
      parishId,
      startDate: '2026-08-01',
      endDate: '2027-07-31',
      isLocked: 0,
      status: 'ACTIVE',
    },
  ])

  await db.insert(users).values([
    {
      id: adminId,
      parishId,
      username: `admin_${suffix}`,
      fullName: 'Audit Admin',
      passwordHash: 'hash',
      role: 'admin',
    },
  ])

  await db.insert(classes).values([
    {
      id: class2025,
      parishId,
      code: `AU1-${suffix}`,
      name: 'Ấu 1 (2025)',
      branchId: branchAu,
      academicYearId: year2025,
      room: '101',
      updatedBy: adminId,
    },
    {
      id: class2026,
      parishId,
      code: `AU2-${suffix}`,
      name: 'Ấu 2 (2026)',
      branchId: branchAu,
      academicYearId: year2026,
      room: '102',
      updatedBy: adminId,
    },
  ])
})

afterAll(async () => {
  await cleanupParish(parishId)
})

describe('Audit #08: Students, Classes, Personnel, Import - Post-fix Regression', () => {
  it('A8-01 (fixed): classService.createClass rejects a locked/archived academic year', async () => {
    // createClass now enforces the same closed-year gate as updateClass.
    await expect(
      createClass(
        {
          code: `LOCKED-${suffix}`,
          name: 'Lớp Niên Khóa Đã Khóa',
          branchId: branchAu,
          academicYearId: yearLocked,
          room: '000',
        },
        adminId,
        parishId,
        '127.0.0.1',
        'audit-agent',
      ),
    ).rejects.toMatchObject({
      code: 'ACADEMIC_YEAR_INVALID',
    })

    // Contrast retained: changing academic year to the locked year IS blocked with ACADEMIC_YEAR_INVALID
    await expect(
      updateClass(
        class2025,
        { academicYearId: yearLocked },
        adminId,
        parishId,
        '127.0.0.1',
        'audit-agent',
      ),
    ).rejects.toMatchObject({
      code: 'ACADEMIC_YEAR_INVALID',
    })

    // Control: creating into an OPEN year still succeeds.
    const created = await createClass(
      {
        code: `OPEN-${suffix}`,
        name: 'Lớp Niên Khóa Mở',
        branchId: branchAu,
        academicYearId: year2025,
        room: '100',
      },
      adminId,
      parishId,
      '127.0.0.1',
      'audit-agent',
    )
    expect(created).toBeDefined()
    expect(created.academicYearId).toBe(year2025)
  })

  it('A8-02 (fixed): studentService rejects enrollment/transfer into classes of locked academic years', async () => {
    // Fixture bypasses the writer (raw insert) — the gate under test lives in
    // the student writer, not in fixture setup.
    const lockedClassId = `class-locked-direct-${suffix}`
    const openSiblingClassId = `class-2025b-${suffix}`
    await db.insert(classes).values([
      {
        id: lockedClassId,
        parishId,
        code: `LCK-${suffix}`,
        name: 'Lớp Khóa (fixture)',
        branchId: branchAu,
        academicYearId: yearLocked,
        room: '001',
        updatedBy: adminId,
      },
      {
        id: openSiblingClassId,
        parishId,
        code: `AU1B-${suffix}`,
        name: 'Ấu 1B (2025)',
        branchId: branchAu,
        academicYearId: year2025,
        room: '103',
        updatedBy: adminId,
      },
    ])

    // 1. Creating a student directly into the locked-year class is rejected.
    await expect(
      createStudent(
        {
          holyName: 'Giuse',
          fullName: 'Nguyễn Văn Khóa',
          gender: 'Nam',
          dateOfBirth: '2016-01-01',
          parentName: 'Phụ huynh',
          parentPhone: '0901234567',
          branch: 'AuNhi',
          classId: lockedClassId,
        },
        adminId,
        parishId,
        '127.0.0.1',
        'audit-agent',
      ),
    ).rejects.toMatchObject({ code: 'ACADEMIC_YEAR_INVALID' })

    // 2. Transferring an active student into the locked class is rejected.
    const activeStudent = await createStudent(
      {
        holyName: 'Maria',
        fullName: 'Trần Thị Mở',
        gender: 'Nữ',
        dateOfBirth: '2016-02-02',
        parentName: 'Phụ huynh 2',
        parentPhone: '0901234568',
        branch: 'AuNhi',
        classId: class2025,
      },
      adminId,
      parishId,
      '127.0.0.1',
      'audit-agent',
    )

    await expect(
      updateStudent(
        activeStudent.id,
        {
          classId: lockedClassId,
          membershipChangeReason: 'Chuyển về lớp cũ đã khóa sổ',
        },
        adminId,
        parishId,
        '127.0.0.1',
        'audit-agent',
      ),
    ).rejects.toMatchObject({ code: 'ACADEMIC_YEAR_INVALID' })

    // 3. Control: intra-year transfer into an OPEN class still succeeds.
    const moved = await updateStudent(
      activeStudent.id,
      {
        classId: openSiblingClassId,
        membershipChangeReason: 'Chuyển lớp trong cùng niên khóa',
      },
      adminId,
      parishId,
      '127.0.0.1',
      'audit-agent',
    )
    expect(moved?.classId).toBe(openSiblingClassId)
  })

  it('A8-03 (fixed): studentService.updateStudent rejects cross-year transfers; promotion stays the only path', async () => {
    const studentForPromotionBypass = await createStudent(
      {
        holyName: 'Phêrô',
        fullName: 'Lê Văn Nhảy Năm',
        gender: 'Nam',
        dateOfBirth: '2015-05-05',
        parentName: 'Phụ huynh 3',
        parentPhone: '0901234569',
        branch: 'AuNhi',
        classId: class2025,
      },
      adminId,
      parishId,
      '127.0.0.1',
      'audit-agent',
    )

    expect(studentForPromotionBypass.classId).toBe(class2025)

    // Direct cross-year move via generic update is rejected with a dedicated code.
    await expect(
      updateStudent(
        studentForPromotionBypass.id,
        {
          classId: class2026,
          membershipChangeReason: 'Chuyển thẳng sang lớp năm sau không qua xét duyệt',
        },
        adminId,
        parishId,
        '127.0.0.1',
        'audit-agent',
      ),
    ).rejects.toMatchObject({ code: 'CROSS_ACADEMIC_YEAR_TRANSFER_DISALLOWED' })

    // The student was not moved.
    const [row] = await db
      .select()
      .from(students)
      .where(and(
        eq(students.id, studentForPromotionBypass.id),
        eq(students.parishId, parishId),
      ))
    expect(row.classId).toBe(class2025)

    // And no promotion record was fabricated by the rejected attempt.
    const promoRecords = await db
      .select()
      .from(promotionRecords)
      .where(and(
        eq(promotionRecords.studentId, studentForPromotionBypass.id),
        eq(promotionRecords.parishId, parishId),
      ))

    expect(promoRecords.length).toBe(0)
  })

  it('A8-04 (fixed): StudentModal validation mirrors the backend/import phone rule', async () => {
    // Source-level assertion: the strict 10-digit-only pattern must be gone
    // from the modal and replaced by the aligned rule. Runtime behavior is
    // covered by src/__tests__/components/StudentModal.test.tsx (A8-04 block).
    const { readFileSync } = await import('node:fs')
    const modalSrc = readFileSync('src/components/common/StudentModal.tsx', 'utf8')
    expect(modalSrc).not.toMatch(/\/\^\[0-9\]\{10\}\$\//)
    expect(modalSrc).toContain('^(\\+84|0)\\d{9,10}$')

    const aligned = /^(\+84|0)\d{9,10}$/
    expect(aligned.test('0901234567')).toBe(true)
    expect(aligned.test('+84901234567')).toBe(true)
    expect(aligned.test('02838123456')).toBe(true)
    expect(aligned.test('123')).toBe(false)
  })
})
