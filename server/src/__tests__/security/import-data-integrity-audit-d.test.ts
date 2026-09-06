import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '../../db/index.js'
import { importBatches, importBatchStudents, classes, branches, academicYears, users } from '../../db/schema.js'
import { importStudents } from '../../services/importService.js'
import { eq, and } from 'drizzle-orm'

describe('AUDIT D — Import Data Integrity Tests (D-01, D-02, D-03)', () => {
  const parishId = 'parish-audit-d-test'
  const userId = 'usr-audit-d-admin'
  const classId = 'cls-audit-d-01'

  beforeAll(async () => {
    await db.insert(branches).values({ id: 'br-audit-d', name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: 'AY-2025-2026', startDate: '2025-09-01', endDate: '2026-05-31', parishId }).onConflictDoNothing()
    await db.insert(classes).values({ id: classId, code: 'CL-AUD-D', name: 'Lớp Audit D', branchId: 'br-audit-d', academicYearId: 'AY-2025-2026', parishId }).onConflictDoNothing()
    await db.insert(users).values({ id: userId, username: 'auditdadmin', fullName: 'Audit D Admin', passwordHash: 'hash', role: 'admin', parishId }).onConflictDoNothing()
  })

  it('D-01: importBatchStudents ALWAYS inherits parishId explicitly instead of defaulting to gia-ton', async () => {
    const result = await importStudents({
      fileName: 'test-d01.xlsx',
      academicYearId: 'AY-2025-2026',
      classMappings: {},
      duplicateActions: {},
      rows: [
        { rowIndex: 1, holyName: 'Giu-se', fullName: 'Nguyen Van D1', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P1', parentPhone: '0901111111', address: 'Addr', branch: 'AuNhi', className: 'Lớp Audit D' },
        { rowIndex: 2, holyName: 'Maria', fullName: 'Tran Thi D2', gender: 'Nữ', dateOfBirth: '2015-02-02', parentName: 'P2', parentPhone: '0902222222', address: 'Addr', branch: 'AuNhi', className: 'Lớp Không Tồn Tại' },
      ],
    }, userId, parishId, '127.0.0.1', 'Vitest')

    expect(result.imported).toBe(1)
    expect(result.errors).toBe(1)

    const batchStudents = await db
      .select()
      .from(importBatchStudents)
      .where(eq(importBatchStudents.batchId, result.batchId))

    expect(batchStudents).toHaveLength(2)
    for (const bs of batchStudents) {
      expect(bs.parishId).toBe(parishId)
      expect(bs.parishId).not.toBe('gia-ton')
    }
  })

  it('D-02 & D-03: import_batches status reflects partial/failed states accurately', async () => {
    const result = await importStudents({
      fileName: 'test-d02-partial.xlsx',
      academicYearId: 'AY-2025-2026',
      classMappings: {},
      duplicateActions: {},
      rows: [
        { rowIndex: 1, holyName: 'Giu-se', fullName: 'Nguyen Van D3', gender: 'Nam', dateOfBirth: '2015-03-03', parentName: 'P3', parentPhone: '0903333333', address: 'Addr', branch: 'AuNhi', className: 'Lớp Audit D' },
        { rowIndex: 2, holyName: 'Phero', fullName: 'Le Van D4', gender: 'Nam', dateOfBirth: '2015-04-04', parentName: 'P4', parentPhone: '0904444444', address: 'Addr', branch: 'AuNhi', className: 'Lớp Sai' },
      ],
    }, userId, parishId, '127.0.0.1', 'Vitest')

    const [batchRecord] = await db
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.id, result.batchId), eq(importBatches.parishId, parishId)))

    expect(batchRecord).toBeDefined()
    expect(batchRecord.imported).toBe(1)
    expect(batchRecord.errorCount).toBe(1)
    expect(batchRecord.status).toBe('partial')
  })
})
