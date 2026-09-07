import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '../../db/index.js'
import { students, classes, branches, academicYears, users, importBatches, importBatchStudents, auditLogs, funds, financialTransactions } from '../../db/schema.js'
import { clearExpiredImportRollbackSnapshots, detectDuplicates, importStudents, recoverInterruptedImportBatches, recoverInterruptedImportBatchesForAllParishes, undoImport } from '../../services/importService.js'
import { eq } from 'drizzle-orm'

describe('Import Deduplication Hardening Suite (ADR-054)', () => {
  const PARISH = 'parish-dedup-hardening-test'
  const AY_ID = '2025-2026-dedup'
  const BRANCH_ID = 'ThieuNhi-dedup'
  const CLASS_ID = 'cls-dedup-01'
  const ADMIN_ID = 'usr-dedup-admin'
  const FUND_ID = 'fund-dedup-01'

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

    await db.insert(funds).values({
      id: FUND_ID,
      parishId: PARISH,
      name: 'Quỹ kiểm thử import',
      code: 'IMPORT-UNDO',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
    await db.delete(financialTransactions).where(eq(financialTransactions.parishId, PARISH))
    await db.delete(importBatchStudents).where(eq(importBatchStudents.parishId, PARISH))
    await db.delete(importBatches).where(eq(importBatches.parishId, PARISH))
    await db.delete(students).where(eq(students.parishId, PARISH))
    await db.delete(classes).where(eq(classes.parishId, PARISH))
    await db.delete(branches).where(eq(branches.parishId, PARISH))
    await db.delete(academicYears).where(eq(academicYears.parishId, PARISH))
    await db.delete(users).where(eq(users.parishId, PARISH))
    await db.delete(funds).where(eq(funds.parishId, PARISH))
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
          academicYearId: AY_ID,
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

    it('fails closed to skip when the client omits a duplicate decision', async () => {
      const before = (await db.select().from(students).where(eq(students.id, ST1_ID)))[0]
      const result = await importStudents({
        rows: [{
          rowIndex: 11, holyName: 'Maria', fullName: 'Trần Thị Mai', gender: 'Nữ',
          dateOfBirth: '2015-05-10', parentName: 'Không được ghi đè', parentPhone: '0988776655',
          address: 'Không được ghi đè', branch: 'ThieuNhi', className: 'Thiếu Nhi 1',
        }],
        academicYearId: AY_ID,
        classMappings: { 'Thiếu Nhi 1': CLASS_ID },
        duplicateActions: {},
      }, ADMIN_ID, PARISH, '127.0.0.1', 'Vitest')

      expect(result.skipped).toBe(1)
      const after = (await db.select().from(students).where(eq(students.id, ST1_ID)))[0]
      expect(after.parentName).toBe(before.parentName)
      expect(after.address).toBe(before.address)
    })

    it('skips an intra-file duplicate without writing the synthetic id into the FK', async () => {
      const base = {
        holyName: 'Anna', fullName: 'Đỗ Thị Minh Châu', gender: 'Nữ', dateOfBirth: '2016-06-06',
        parentName: 'Đỗ Văn A', parentPhone: '0911222333', address: 'Test', branch: 'ThieuNhi', className: 'Thiếu Nhi 1',
      }
      const result = await importStudents({
        rows: [{ ...base, rowIndex: 21 }, { ...base, rowIndex: 22 }],
        academicYearId: AY_ID,
        classMappings: { 'Thiếu Nhi 1': CLASS_ID }, duplicateActions: {},
      }, ADMIN_ID, PARISH, '127.0.0.1', 'Vitest')

      expect(result.imported).toBe(1)
      expect(result.skipped).toBe(1)
      expect(result.errors).toBe(0)
      const details = await db.select().from(importBatchStudents).where(eq(importBatchStudents.batchId, result.batchId))
      expect(details.find((row) => row.rowIndex === 22)?.studentId).toBeNull()
    })

    it('allows an explicit create decision for a real same-name collision', async () => {
      const result = await importStudents({
        rows: [{
          rowIndex: 31, holyName: 'Têrêsa', fullName: 'Trần Thị Mai', gender: 'Nữ',
          dateOfBirth: '2015-05-10', parentName: 'Gia đình', parentPhone: '0988776655',
          address: 'Test', branch: 'ThieuNhi', className: 'Thiếu Nhi 1',
        }],
        academicYearId: AY_ID,
        classMappings: { 'Thiếu Nhi 1': CLASS_ID }, duplicateActions: { '31': 'create' },
      }, ADMIN_ID, PARISH, '127.0.0.1', 'Vitest')

      expect(result.imported).toBe(1)
      expect(result.errors).toBe(0)
    })

    it('preserves blank cells on update and undo restores the exact unredacted PII snapshot', async () => {
      const before = (await db.select().from(students).where(eq(students.id, ST2_ID)))[0]
      const result = await importStudents({
        rows: [{
          rowIndex: 41, holyName: 'Giuse', fullName: 'Lê Văn Hoàng', gender: '', dateOfBirth: '',
          parentName: 'Phụ huynh mới', parentPhone: '', address: '', branch: '', className: 'Thiếu Nhi 1',
        }],
        academicYearId: AY_ID,
        classMappings: { 'Thiếu Nhi 1': CLASS_ID }, duplicateActions: { '41': 'update' },
      }, ADMIN_ID, PARISH, '127.0.0.1', 'Vitest')

      expect(result.studentChanges).toHaveLength(1)
      expect(result.studentChanges[0]).toMatchObject({
        action: 'updated',
        student: { id: ST2_ID, parentName: 'Phụ huynh mới', parishId: PARISH },
      })
      const updated = (await db.select().from(students).where(eq(students.id, ST2_ID)))[0]
      expect(updated.parentName).toBe('Phụ huynh mới')
      expect(updated.address).toBe(before.address)
      expect(updated.parentPhone).toBe(before.parentPhone)
      expect(updated.gender).toBe(before.gender)

      const undone = await undoImport(result.batchId, PARISH, ADMIN_ID)
      expect(undone).toMatchObject({ undone: 1, errors: [] })
      const restored = (await db.select().from(students).where(eq(students.id, ST2_ID)))[0]
      expect(restored.parentName).toBe(before.parentName)
      expect(restored.address).toBe(before.address)
      expect(restored.parentPhone).toBe(before.parentPhone)
    })

    it('blocks undo when a manual financial transaction was recorded after import', async () => {
      const result = await importStudents({
        rows: [{
          rowIndex: 42, holyName: 'Phêrô', fullName: 'Nguyễn Minh Tài', gender: 'Nam',
          dateOfBirth: '2015-09-09', parentName: 'Nguyễn Văn Phụ', parentPhone: '0909000042',
          address: 'Test', branch: 'ThieuNhi', className: 'Thiếu Nhi 1',
        }],
        academicYearId: AY_ID,
        classMappings: { 'Thiếu Nhi 1': CLASS_ID }, duplicateActions: {},
      }, ADMIN_ID, PARISH, '127.0.0.1', 'Vitest')
      const studentId = result.studentChanges[0]?.student.id
      expect(studentId).toBeTruthy()

      await db.insert(financialTransactions).values({
        id: 'txn-import-undo-42', parishId: PARISH, fundId: FUND_ID, type: 'INCOME',
        amount: 100000, category: 'Đóng góp', title: 'Phiếu thu sau import', studentId,
        classId: CLASS_ID, academicYear: AY_ID, transactionDate: '2025-09-10',
        recordedBy: ADMIN_ID, recordedByName: 'Dedup Admin', createdAt: new Date().toISOString(),
      })

      const undone = await undoImport(result.batchId, PARISH, ADMIN_ID)
      expect(undone.undone).toBe(0)
      expect(undone.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ studentId, status: 'blocked' }),
      ]))
      const [preserved] = await db.select().from(students).where(eq(students.id, studentId!))
      expect(preserved.deletedAt).toBeNull()
    })

    it('blocks undo when a parent account was provisioned from the imported phone', async () => {
      const parentPhone = '0909000043'
      const result = await importStudents({
        rows: [{
          rowIndex: 43, holyName: 'Maria', fullName: 'Nguyễn Minh An', gender: 'Nữ',
          dateOfBirth: '2015-10-10', parentName: 'Nguyễn Văn Phụ', parentPhone,
          address: 'Test', branch: 'ThieuNhi', className: 'Thiếu Nhi 1',
        }],
        academicYearId: AY_ID,
        classMappings: { 'Thiếu Nhi 1': CLASS_ID }, duplicateActions: {},
      }, ADMIN_ID, PARISH, '127.0.0.1', 'Vitest')
      const studentId = result.studentChanges[0]?.student.id
      expect(studentId).toBeTruthy()

      await db.insert(users).values({
        id: 'parent-import-undo-43', parishId: PARISH, username: parentPhone,
        passwordHash: 'hash', fullName: 'Phụ huynh sau import', phone: parentPhone,
        role: 'phuhuynh', status: 'FORCE_PASSWORD_CHANGE',
        createdAt: new Date(Date.now() + 1_000).toISOString(),
      })

      const undone = await undoImport(result.batchId, PARISH, ADMIN_ID)
      expect(undone.undone).toBe(0)
      expect(undone.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ studentId, status: 'blocked' }),
      ]))
      const [preserved] = await db.select().from(students).where(eq(students.id, studentId!))
      expect(preserved.deletedAt).toBeNull()
    })

    it('purges rollback snapshots after the 24-hour privacy window', async () => {
      const batchId = 'imp-expired-rollback'
      const rowId = 'ibs-expired-rollback'
      await db.insert(importBatches).values({
        id: batchId, userId: ADMIN_ID, parishId: PARISH, totalRows: 1,
        status: 'completed', createdAt: '2020-01-01T00:00:00.000Z',
      })
      await db.insert(importBatchStudents).values({
        id: rowId, batchId, parishId: PARISH, rowIndex: 1, action: 'error',
        rollbackSnapshot: JSON.stringify({ secret: 'must-expire' }),
      })

      await clearExpiredImportRollbackSnapshots(PARISH)
      const [row] = await db.select().from(importBatchStudents).where(eq(importBatchStudents.id, rowId))
      expect(row.rollbackSnapshot).toBeNull()
    })

    it('recovers only pre-process import batches from committed row provenance', async () => {
      const interruptedId = 'imp-interrupted-metadata'
      const activeId = 'imp-active-metadata'
      await db.insert(importBatches).values([
        {
          id: interruptedId, userId: ADMIN_ID, parishId: PARISH, totalRows: 3,
          imported: 0, skipped: 0, errorCount: 0, status: 'processing',
          createdAt: '2020-01-01T00:00:00.000Z',
        },
        {
          id: activeId, userId: ADMIN_ID, parishId: PARISH, totalRows: 1,
          imported: 0, skipped: 0, errorCount: 0, status: 'processing',
          createdAt: '2030-01-01T00:00:00.000Z',
        },
      ])
      await db.insert(importBatchStudents).values([
        { id: 'ibs-interrupted-created', batchId: interruptedId, parishId: PARISH, rowIndex: 1, action: 'created', studentId: ST1_ID },
        { id: 'ibs-interrupted-skipped', batchId: interruptedId, parishId: PARISH, rowIndex: 2, action: 'skipped', studentId: ST2_ID },
      ])

      expect(await recoverInterruptedImportBatches(PARISH, '2025-01-01T00:00:00.000Z')).toBe(1)

      const [interrupted] = await db.select().from(importBatches).where(eq(importBatches.id, interruptedId))
      expect(interrupted).toMatchObject({ imported: 1, skipped: 1, errorCount: 1, status: 'partial' })
      const [active] = await db.select().from(importBatches).where(eq(importBatches.id, activeId))
      expect(active.status).toBe('processing')
    })

    it('startup recovery discovers stale processing batches without guessing a parish', async () => {
      const otherParish = 'parish-import-startup-recovery'
      const otherAdmin = 'usr-import-startup-recovery'
      const localBatch = 'imp-startup-local'
      const otherBatch = 'imp-startup-other'
      try {
        await db.insert(users).values({
          id: otherAdmin,
          username: 'import_startup_recovery',
          passwordHash: 'hash',
          fullName: 'Import Recovery Admin',
          role: 'admin',
          parishId: otherParish,
        })
        await db.insert(importBatches).values([
          {
            id: localBatch, userId: ADMIN_ID, parishId: PARISH, totalRows: 1,
            status: 'processing', createdAt: '2000-01-01T00:00:00.000Z',
          },
          {
            id: otherBatch, userId: otherAdmin, parishId: otherParish, totalRows: 2,
            status: 'processing', createdAt: '2000-01-01T00:00:00.000Z',
          },
        ])

        expect(await recoverInterruptedImportBatchesForAllParishes('2001-01-01T00:00:00.000Z')).toBe(2)
        const [local] = await db.select().from(importBatches).where(eq(importBatches.id, localBatch))
        const [other] = await db.select().from(importBatches).where(eq(importBatches.id, otherBatch))
        expect(local).toMatchObject({ status: 'failed', imported: 0, skipped: 0, errorCount: 1 })
        expect(other).toMatchObject({ status: 'failed', imported: 0, skipped: 0, errorCount: 2 })
      } finally {
        await db.delete(importBatches).where(eq(importBatches.parishId, otherParish))
        await db.delete(importBatches).where(eq(importBatches.id, localBatch))
        await db.delete(users).where(eq(users.parishId, otherParish))
      }
    })
  })
})
