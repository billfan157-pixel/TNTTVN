import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '../../db/index.js'
import { students, classes, branches, academicYears, users, importBatches, importBatchStudents, auditLogs } from '../../db/schema.js'
import { detectDuplicates, importStudents } from '../../services/importService.js'
import { eq } from 'drizzle-orm'

describe('Import Deduplication Hardening Suite (ADR-054)', () => {
  const PARISH = 'parish-dedup-hardening-test'
  const AY_ID = '2025-2026-dedup'
  const BRANCH_ID = 'ThieuNhi-dedup'
  const CLASS_ID = 'cls-dedup-01'
  const ADMIN_ID = 'usr-dedup-admin'

  const ST1_ID = 'st-dedup-1'
  const ST2_ID = 'st-dedup-2'

  beforeAll(async () => {
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
      code: 'TN1-DEDUP',
      branchId: BRANCH_ID,
      academicYearId: AY_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    }).onConflictDoNothing()

    await db.insert(users).values({
      id: ADMIN_ID,
      username: 'dedup_admin_user',
      passwordHash: 'hash',
      fullName: 'Dedup Admin',
      role: 'admin',
      parishId: PARISH,
      createdAt: new Date().toISOString(),
    }).onConflictDoNothing()

    const now = new Date().toISOString()
    await db.insert(students).values([
      {
        id: ST1_ID,
        code: 'TN-DEDUP-001',
        holyName: 'Maria',
        fullName: 'Trần Thị Mai',
        dateOfBirth: '2015-05-10',
        gender: 'Nữ',
        parentPhone: '0988776655',
        parentName: 'Trần Văn Phụ',
        address: '123 Test St',
        branch: 'ThieuNhi',
        classId: CLASS_ID,
        parishId: PARISH,
        createdAt: now,
        updatedAt: now,
        updatedBy: 'system',
      },
      {
        id: ST2_ID,
        code: 'TN-DEDUP-002',
        holyName: 'Giuse',
        fullName: 'Lê Văn Hoàng',
        dateOfBirth: '', // no DOB in DB
        gender: 'Nam',
        parentPhone: '', // no Phone in DB
        parentName: 'Lê Phụ',
        address: '456 Test St',
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
    await db.delete(importBatchStudents).where(eq(importBatchStudents.parishId, PARISH))
    await db.delete(importBatches).where(eq(importBatches.parishId, PARISH))
    await db.delete(students).where(eq(students.parishId, PARISH))
    await db.delete(classes).where(eq(classes.parishId, PARISH))
    await db.delete(branches).where(eq(branches.parishId, PARISH))
    await db.delete(academicYears).where(eq(academicYears.parishId, PARISH))
    await db.delete(users).where(eq(users.id, ADMIN_ID))
    await db.delete(auditLogs).where(eq(auditLogs.parishId, PARISH))
  })

  // ─── 1. Intra-File Multi-Key Deduplication ───
  describe('Intra-File Multi-Key Deduplication', () => {
    it('catches intra-file duplicate via Phone even when Date of Birth is missing/placeholder', async () => {
      const rows = [
        {
          rowIndex: 1,
          holyName: 'Maria',
          fullName: 'Võ Thị Hoa',
          dateOfBirth: 'Chưa cập nhật',
          gender: 'Nữ',
          parentPhone: '0912345678',
          parentName: '',
          address: '',
          branch: 'ThieuNhi',
          className: 'Thiếu Nhi 1',
        },
        {
          rowIndex: 2,
          holyName: 'Maria',
          fullName: 'Võ Thị Hoa',
          dateOfBirth: '',
          gender: 'Nữ',
          parentPhone: '0912345678',
          parentName: '',
          address: '',
          branch: 'ThieuNhi',
          className: 'Thiếu Nhi 1',
        },
      ]

      const dupMap = await detectDuplicates(rows, PARISH)
      expect(dupMap.has(2)).toBe(true)
      const dup = dupMap.get(2)!
      expect(dup.studentId).toBe('intra-file')
      expect(dup.reason).toContain('Trùng lặp Họ Tên và SĐT Phụ Huynh với dòng 1')
    })

    it('catches intra-file duplicate via HolyName + FullName + Class when both DOB and Phone are missing', async () => {
      const rows = [
        {
          rowIndex: 1,
          holyName: 'Phêrô',
          fullName: 'Phạm Văn Nam',
          dateOfBirth: '',
          gender: 'Nam',
          parentPhone: '',
          parentName: '',
          address: '',
          branch: 'ThieuNhi',
          className: 'Thiếu Nhi 1',
        },
        {
          rowIndex: 2,
          holyName: 'Phêrô',
          fullName: 'Phạm Văn Nam',
          dateOfBirth: '',
          gender: 'Nam',
          parentPhone: '',
          parentName: '',
          address: '',
          branch: 'ThieuNhi',
          className: 'Thiếu Nhi 1',
        },
      ]

      const dupMap = await detectDuplicates(rows, PARISH)
      expect(dupMap.has(2)).toBe(true)
      const dup = dupMap.get(2)!
      expect(dup.studentId).toBe('intra-file')
      expect(dup.reason).toContain('Trùng lặp Tên Thánh, Họ Tên và Lớp với dòng 1')
    })

    it('catches intra-file duplicate via FullName + Class when HolyName, DOB, and Phone are all missing', async () => {
      const rows = [
        {
          rowIndex: 1,
          holyName: '',
          fullName: 'Đặng Quốc Bảo',
          dateOfBirth: '',
          gender: 'Nam',
          parentPhone: '',
          parentName: '',
          address: '',
          branch: 'ThieuNhi',
          className: 'Thiếu Nhi 1',
        },
        {
          rowIndex: 2,
          holyName: '',
          fullName: 'Đặng Quốc Bảo',
          dateOfBirth: '',
          gender: 'Nam',
          parentPhone: '',
          parentName: '',
          address: '',
          branch: 'ThieuNhi',
          className: 'Thiếu Nhi 1',
        },
      ]

      const dupMap = await detectDuplicates(rows, PARISH)
      expect(dupMap.has(2)).toBe(true)
      const dup = dupMap.get(2)!
      expect(dup.studentId).toBe('intra-file')
      expect(dup.reason).toContain('Trùng lặp Họ Tên trong cùng lớp với dòng 1')
    })
  })

  // ─── 2. Database Lookup when DOB/Phone Missing ───
  describe('Database Duplicate Lookup without DOB/Phone', () => {
    it('detects existing student in class when DOB and Phone are missing in import file', async () => {
      const rows = [
        {
          rowIndex: 1,
          holyName: 'Giuse',
          fullName: 'Lê Văn Hoàng',
          dateOfBirth: '',
          gender: 'Nam',
          parentPhone: '',
          parentName: '',
          address: '',
          branch: 'ThieuNhi',
          className: 'Thiếu Nhi 1',
        },
      ]

      const dupMap = await detectDuplicates(rows, PARISH)
      expect(dupMap.has(1)).toBe(true)
      const dup = dupMap.get(1)!
      expect(dup.studentId).toBe(ST2_ID)
      expect(dup.reason).toBe('name_holy_class')
    })
  })

  // ─── 3. Holy Name Disambiguation (Twins vs Same Person) ───
  describe('Holy Name Difference Detection (Twins)', () => {
    it('flags name_dob_diff_holy_name when FullName + DOB match but HolyName is different', async () => {
      const rows = [
        {
          rowIndex: 1,
          holyName: 'Têrêsa', // DB has Maria
          fullName: 'Trần Thị Mai',
          dateOfBirth: '2015-05-10',
          gender: 'Nữ',
          parentPhone: '0988776655',
          parentName: '',
          address: '',
          branch: 'ThieuNhi',
          className: 'Thiếu Nhi 1',
        },
      ]

      const dupMap = await detectDuplicates(rows, PARISH)
      expect(dupMap.has(1)).toBe(true)
      const dup = dupMap.get(1)!
      expect(dup.studentId).toBe(ST1_ID)
      expect(dup.reason).toBe('name_dob_diff_holy_name')
    })
  })

  // ─── 4. Fuzzy Levenshtein Match on Typo in Name ───
  describe('Fuzzy Name Matching for Typos', () => {
    it('flags fuzzy_phone_dob when Phone + DOB match and Name has minor typo (Levenshtein >= 80%)', async () => {
      const rows = [
        {
          rowIndex: 1,
          holyName: 'Maria',
          fullName: 'Trần Thị May', // Typo: May vs Mai (Levenshtein 1 diff, > 80% similarity)
          dateOfBirth: '2015-05-10',
          gender: 'Nữ',
          parentPhone: '0988776655',
          parentName: '',
          address: '',
          branch: 'ThieuNhi',
          className: 'Thiếu Nhi 1',
        },
      ]

      const dupMap = await detectDuplicates(rows, PARISH)
      expect(dupMap.has(1)).toBe(true)
      const dup = dupMap.get(1)!
      expect(dup.studentId).toBe(ST1_ID)
      expect(dup.reason).toBe('fuzzy_phone_dob')
    })
  })

  // ─── 5. Safe 'skip' Action Behavior ───
  describe('Safe Skip Action Verification', () => {
    it('does NOT insert new student or update existing student when duplicate action is skip', async () => {
      const initialStudent = (await db.select().from(students).where(eq(students.id, ST1_ID)))[0]

      const rows = [
        {
          rowIndex: 1,
          holyName: 'Maria',
          fullName: 'Trần Thị Mai',
          dateOfBirth: '2015-05-10',
          gender: 'Nữ',
          parentPhone: '0988776655',
          parentName: 'Tên Phụ Huynh Mới Cần Bị Bỏ Qua',
          address: 'Địa Chỉ Mới Cần Bị Bỏ Qua',
          branch: 'ThieuNhi',
          className: 'Thiếu Nhi 1',
        },
      ]

      const importResult = await importStudents(
        {
          rows,
          classMappings: { 'Thiếu Nhi 1': CLASS_ID },
          duplicateActions: { '1': 'skip' },
        },
        ADMIN_ID,
        PARISH,
        '127.0.0.1',
        'Vitest'
      )

      expect(importResult.imported).toBe(0)
      expect(importResult.skipped).toBe(1)
      expect(importResult.errors).toBe(0)

      const afterStudent = (await db.select().from(students).where(eq(students.id, ST1_ID)))[0]
      // Verify parentName and address were NOT updated!
      expect(afterStudent.parentName).toBe(initialStudent.parentName)
      expect(afterStudent.address).toBe(initialStudent.address)
      expect(afterStudent.updatedAt).toBe(initialStudent.updatedAt)
    })
  })
})
