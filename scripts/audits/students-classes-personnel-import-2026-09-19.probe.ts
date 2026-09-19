import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'
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
const classLocked = `class-locked-${suffix}`
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

describe('Audit #08: Students, Classes, Personnel, Import - Finding Verification Probe', () => {
  it('A8-01: classService.createClass allows creating a new class into a locked/archived academic year without rejection', async () => {
    // createClass does not check targetYear.isLocked or targetYear.status
    const created = await createClass(
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
    )

    expect(created).toBeDefined()
    expect(created.id).toBeDefined()
    expect(created.academicYearId).toBe(yearLocked)

    // Contrast with updateClass: changing academic year to the locked year IS blocked with ACADEMIC_YEAR_INVALID
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
  })

  it('A8-02: studentService.createStudent and updateStudent allow assigning/moving students into classes of locked academic years', async () => {
    // 1. First ensure a class exists in yearLocked
    const lockedClass = await createClass(
      {
        code: `CLS-LCK-${suffix}`,
        name: 'Lớp Khóa Kiểm Thử',
        branchId: branchAu,
        academicYearId: yearLocked,
        room: '001',
      },
      adminId,
      parishId,
      '127.0.0.1',
      'audit-agent',
    )

    // 2. Create a student directly into the class that belongs to yearLocked
    const newStudentInLocked = await createStudent(
      {
        holyName: 'Giuse',
        fullName: 'Nguyễn Văn Khóa',
        gender: 'Nam',
        dateOfBirth: '2016-01-01',
        parentName: 'Phụ huynh',
        parentPhone: '0901234567',
        branch: 'AuNhi',
        classId: lockedClass.id,
      },
      adminId,
      parishId,
      '127.0.0.1',
      'audit-agent',
    )
    expect(newStudentInLocked).toBeDefined()
    expect(newStudentInLocked.classId).toBe(lockedClass.id)

    // 3. Take an existing student in class2025 and transfer into lockedClass via updateStudent
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

    const updated = await updateStudent(
      activeStudent.id,
      {
        classId: lockedClass.id,
        membershipChangeReason: 'Chuyển về lớp cũ đã khóa sổ',
      },
      adminId,
      parishId,
      '127.0.0.1',
      'audit-agent',
    )
    expect(updated).toBeDefined()
    expect(updated?.classId).toBe(lockedClass.id)
  })

  it('A8-03: studentService.updateStudent allows moving a student across academic years, bypassing formal promotion', async () => {
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

    // Move student directly from class2025 (year2025) to class2026 (year2026) using generic updateStudent
    const movedStudent = await updateStudent(
      studentForPromotionBypass.id,
      {
        classId: class2026,
        membershipChangeReason: 'Chuyển thẳng sang lớp năm sau không qua xét duyệt',
      },
      adminId,
      parishId,
      '127.0.0.1',
      'audit-agent',
    )

    expect(movedStudent).toBeDefined()
    expect(movedStudent?.classId).toBe(class2026)

    // Verify: No promotion record was created for this student in the promotion_records table!
    const promoRecords = await db
      .select()
      .from(promotionRecords)
      .where(and(
        eq(promotionRecords.studentId, studentForPromotionBypass.id),
        eq(promotionRecords.parishId, parishId),
      ))

    expect(promoRecords.length).toBe(0)
  })

  it('A8-04: Phone validation regex mismatch between frontend StudentModal and backend import/API', () => {
    const backendRegex = /^(\+84|0)\d{9,10}$/ // Used in server/src/routes/students.ts:39 & importService.ts:322
    const frontendModalRegex = /^[0-9]{10}$/  // Used in src/components/common/StudentModal.tsx:213

    const testPhones = [
      { phone: '+84901234567', desc: 'Vietnamese international format +84 (9 digits after)' },
      { phone: '+849012345678', desc: 'Vietnamese international format +84 (10 digits after)' },
      { phone: '0901234567', desc: 'Standard 10-digit mobile' },
      { phone: '02838123456', desc: '11-digit landline / traditional prefix' },
    ]

    // 1. Both accept standard 10-digit
    expect(backendRegex.test('0901234567')).toBe(true)
    expect(frontendModalRegex.test('0901234567')).toBe(true)

    // 2. Backend accepts +84 format, frontend StudentModal rejects it
    expect(backendRegex.test('+84901234567')).toBe(true)
    expect(frontendModalRegex.test('+84901234567')).toBe(false)

    // 3. Backend accepts 11-digit format, frontend StudentModal rejects it
    expect(backendRegex.test('02838123456')).toBe(true)
    expect(frontendModalRegex.test('02838123456')).toBe(false)
  })
})
