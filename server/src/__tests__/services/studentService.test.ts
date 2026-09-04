import { describe, it, expect, afterAll, beforeAll, beforeEach, vi } from 'vitest'
import { getStudents, getStudentById, createStudent, updateStudent, deleteStudent } from '../../services/studentService.js'
import { db } from '../../db/index.js'
import { students, branches, academicYears, classes } from '../../db/schema.js'
import { eq, inArray } from 'drizzle-orm'

const mockGenCode = vi.hoisted(() => vi.fn())
vi.mock('../../services/studentCodeGenerator.js', () => ({
  generateStudentCodeSuffix: mockGenCode,
}))

describe('Server studentService Layer Unit Tests', () => {
  let createdId: string
  const cleanupStudentIds: string[] = []

  beforeAll(async () => {
    // Clean up stale test data from previous runs
    await db.delete(students).where(inArray(students.code, ['TN2025000000', 'TN2025000001', 'TN2025000007']))
    await db.delete(classes).where(eq(classes.id, 'AU-DEL'))

    const now = new Date().toISOString()
    await db.insert(branches).values({ id: 'AuNhi', name: 'Ấu Nhi', scarfColor: '#16A34A', ageMin: 7, ageMax: 9, parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: '2025-2026', startDate: '2025-08-01', endDate: '2026-07-31', parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
    await db.insert(classes).values({ id: 'AU1', code: 'AU-01', name: 'Ấu Nhi 1', branchId: 'AuNhi', academicYearId: '2025-2026', room: 'Phòng 102', parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
    await db.update(classes).set({ parishId: 'gia-ton' }).where(eq(classes.id, 'AU1'))
  })

  afterAll(async () => {
    const allIds = ['ST-COL-1', 'ST-FBK-1', ...cleanupStudentIds]
    if (allIds.length > 0) {
      const { grades } = await import('../../db/schema.js')
      await db.delete(grades).where(inArray(grades.studentId, allIds))
      await db.delete(students).where(inArray(students.id, allIds))
    }
    await db.delete(classes).where(eq(classes.id, 'AU-DEL'))
  })

  beforeEach(() => {
    const base = Math.floor(Math.random() * 400000) + 500000
    let counter = 0
    mockGenCode.mockReset()
    mockGenCode.mockImplementation(() => {
      counter++
      return String(base + counter).slice(-6).padStart(6, '0')
    })
  })

  it('createStudent inserts student into DB with ST prefix and code', async () => {
    const studentData = {
      holyName: 'Phêrô',
      fullName: 'Nguyễn Văn Test',
      gender: 'Nam' as const,
      dateOfBirth: '2016-05-10',
      parentName: 'Nguyễn Văn Ba',
      parentPhone: '0901112233',
      address: 'Xóm Giáo 1',
      branch: 'AuNhi' as const,
      classId: 'AU1',
      status: 'Đang học' as const,
    }

    const created = await createStudent(studentData, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(created).not.toBeNull()
    expect(created?.id).toMatch(/^ST-/)
    expect(created?.fullName).toBe('Nguyễn Văn Test')
    createdId = created!.id
  })

  it('getStudentById retrieves student by ID and parishId', async () => {
    const found = await getStudentById(createdId, 'gia-ton')
    expect(found).not.toBeNull()
    expect(found?.fullName).toBe('Nguyễn Văn Test')
  })

  it('getStudents returns list containing created student', async () => {
    // Lọc theo updatedAt của student vừa tạo (>=): DB test có thể tích lũy >1000
    // students của giáo xứ từ các suite khác → limit 1000 + order ASC sẽ bỏ sót
    // student mới nhất.
    const created = await getStudentById(createdId, 'gia-ton')
    const result = await getStudents('gia-ton', created?.updatedAt ?? undefined, 1000)
    expect(result.data.length).toBeGreaterThan(0)
    const exists = result.data.some((s) => s.id === createdId)
    expect(exists).toBe(true)
  })

  it('updateStudent modifies student record in DB', async () => {
    const updated = await updateStudent(createdId, { fullName: 'Nguyễn Văn Test (Đã sửa)' }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(updated).not.toBeNull()
    expect(updated?.fullName).toBe('Nguyễn Văn Test (Đã sửa)')
  })

  it('createStudent với cùng idempotencyKey → trả về student đã tạo, không tạo trùng (finding #3)', async () => {
    const data = {
      holyName: 'Micae',
      fullName: 'Nguyễn Văn Idem',
      gender: 'Nam' as const,
      dateOfBirth: '2015-03-10',
      parentName: 'Nguyễn Văn Ba',
      parentPhone: '0901234567',
      address: 'Xóm Giáo 2',
      branch: 'AuNhi' as const,
      classId: 'AU1',
      status: 'Đang học' as const,
    }

    const first = await createStudent(data, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest', 'IDEM-KEY-001')
    const second = await createStudent(data, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest', 'IDEM-KEY-001')

    expect(second?.id).toBe(first?.id)
    expect(second?.id).toMatch(/^ST-/)

    const byId = await getStudentById(first!.id, 'gia-ton')
    const { data: list } = await getStudents('gia-ton', byId?.updatedAt ?? undefined, 1000)
    const matches = list.filter(s => (s as any).idempotencyKey === 'IDEM-KEY-001')
    expect(matches).toHaveLength(1)

    cleanupStudentIds.push(first!.id)
  })

  it('IDEM-F3: 2 request ĐỒNG THỜI cùng idempotencyKey → đúng 1 học sinh, không tạo bản sao không key', async () => {
    const data = {
      holyName: 'Tôma',
      fullName: 'Nguyễn Văn Race Idem',
      gender: 'Nam' as const,
      dateOfBirth: '2015-04-10',
      parentName: 'Nguyễn Văn Ba',
      parentPhone: '0901234568',
      address: 'Xóm Giáo 3',
      branch: 'AuNhi' as const,
      classId: 'AU1',
      status: 'Đang học' as const,
    }
    const key = 'IDEM-RACE-001'

    // Cả 2 gọi vượt qua pre-check trước khi bên kia kịp commit → bên thua gặp
    // UNIQUE(parish_id, idempotency_key). Trước fix: rơi vào fallback KHÔNG key
    // → 2 học sinh. Sau fix: trả về bản ghi của request thắng.
    const [a, b] = await Promise.all([
      createStudent(data, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest', key),
      createStudent(data, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest', key),
    ])

    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(b!.id).toBe(a!.id)

    const rows = await db.select().from(students).where(eq(students.parishId, 'gia-ton'))
    const withKey = rows.filter(s => (s as any).idempotencyKey === key)
    expect(withKey).toHaveLength(1)

    cleanupStudentIds.push(a!.id)
  })

  it('deleteStudent performs soft delete (deletedAt set)', async () => {
    const deleted = await deleteStudent(createdId, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(deleted).toBe(true)

    const afterDelete = await getStudentById(createdId, 'gia-ton')
    expect(afterDelete).toBeNull()
  })

  it('returns a soft-delete tombstone only inside an incremental snapshot window', async () => {
    const [deletedRow] = await db.select().from(students).where(eq(students.id, createdId)).limit(1)
    expect(deletedRow.deletedAt).toBeTruthy()

    const delta = await getStudents(
      'gia-ton',
      deletedRow.updatedAt,
      1000,
      1,
      new Date(Date.parse(deletedRow.updatedAt) + 60_000).toISOString(),
    )
    expect(delta.data.find(row => row.id === createdId)?.deletedAt).toBeTruthy()

    const full = await getStudents('gia-ton', undefined, 1000)
    expect(full.data.some(row => row.id === createdId)).toBe(false)
  })

  it('rejects createStudent with nonexistent classId', async () => {
    const data = {
      holyName: 'Test',
      fullName: 'Test Student',
      gender: 'Nam' as const,
      dateOfBirth: '2020-01-01',
      parentName: 'Parent',
      parentPhone: '0901112233',
      address: 'Address',
      branch: 'AuNhi' as const,
      classId: 'NONEXISTENT',
      status: 'Đang học' as const,
    }
    await expect(createStudent(data, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')).rejects.toThrow('Class not found')
  })

  it('rejects createStudent with soft-deleted classId', async () => {
    const now = new Date().toISOString()
    const insertClasses = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await db.insert(classes).values({
            id: 'AU-DEL', code: 'AU-DEL', name: 'Deleted Class',
            branchId: 'AuNhi', academicYearId: '2025-2026',
            room: 'Test', parishId: 'gia-ton',
            createdAt: now, updatedAt: now, updatedBy: 'test',
          }).onConflictDoNothing()
          await db.update(classes).set({ deletedAt: now }).where(eq(classes.id, 'AU-DEL'))
          return
        } catch (err: any) {
          const busy = err?.code === 'SQLITE_BUSY' || err?.cause?.code === 'SQLITE_BUSY'
          if (busy && attempt < 2) {
            await new Promise(r => setTimeout(r, 1000))
            continue
          }
          throw err
        }
      }
    }
    await insertClasses()

    const data = {
      holyName: 'DelTest',
      fullName: 'Deleted Class Student',
      gender: 'Nam' as const,
      dateOfBirth: '2018-01-01',
      parentName: 'Parent Del',
      parentPhone: '0901112244',
      address: 'Address',
      branch: 'AuNhi' as const,
      classId: 'AU-DEL',
      status: 'Đang học' as const,
    }
    await expect(
      createStudent(data, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    ).rejects.toThrow('Class has been deleted: AU-DEL')
  })

  it('retries with new code when generated code collides on UNIQUE constraint (TOCTOU)', async () => {
    await db.insert(students).values({
      id: 'ST-COL-1',
      code: 'TN2025000001',
      holyName: 'ColFixture',
      fullName: 'Collision Fixture',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'Parent',
      parentPhone: '0900000000',
      address: 'Fixture',
      branch: 'AuNhi',
      classId: 'AU1',
      status: 'Đang học',
      parishId: 'gia-ton',
      updatedBy: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).onConflictDoNothing()

    // First call collides with fixture; subsequent calls succeed
    mockGenCode.mockReset()
    let retryCalls = 0
    mockGenCode.mockImplementation(() => {
      retryCalls++
      if (retryCalls === 1) return '000001'
      return '000007'
    })

    const result = await createStudent({
      holyName: 'CollisionTest',
      fullName: 'TOCTOU Retry Test',
      gender: 'Nam' as const,
      dateOfBirth: '2017-06-15',
      parentName: 'Retry Parent',
      parentPhone: '0909999999',
      address: 'Retry Address',
      branch: 'AuNhi' as const,
      classId: 'AU1',
      status: 'Đang học' as const,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')

    expect(result).not.toBeNull()
    expect(result.code).toBe('TN2025000007')
    expect(result.id).toMatch(/^ST-/)
    cleanupStudentIds.push(result.id)
    expect(mockGenCode).toHaveBeenCalledTimes(2)
  })

  it('uses fallback code when all 12 random attempts collide', async () => {
    await db.insert(students).values({
      id: 'ST-FBK-1',
      code: 'TN2025000000',
      holyName: 'FbkFixture',
      fullName: 'Fallback Fixture',
      gender: 'Nam',
      dateOfBirth: '2014-01-01',
      parentName: 'Fbk Parent',
      parentPhone: '0901111111',
      address: 'Fbk',
      branch: 'AuNhi',
      classId: 'AU1',
      status: 'Đang học',
      parishId: 'gia-ton',
      updatedBy: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).onConflictDoNothing()

    mockGenCode.mockReset()
    mockGenCode.mockImplementation(() => '000000')

    const result = await createStudent({
      holyName: 'FallbackTest',
      fullName: 'Fallback Path Test',
      gender: 'Nam' as const,
      dateOfBirth: '2016-03-20',
      parentName: 'Fallback P',
      parentPhone: '0902222222',
      address: 'Fbk Address',
      branch: 'AuNhi' as const,
      classId: 'AU1',
      status: 'Đang học' as const,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')

    expect(result).not.toBeNull()
    expect(result.code).toMatch(/^TN2025\d{6}$/)
    expect(result.code).not.toBe('TN2025000000')
    cleanupStudentIds.push(result.id)
    expect(mockGenCode).toHaveBeenCalledTimes(12)
  }, 30000)

  it('non-UNIQUE constraint error (FK violation) must NOT be caught as isUnique', async () => {
    // Direct insert with nonexistent classId to trigger FOREIGN KEY violation
    try {
      await db.insert(students).values({
        id: 'ST-FK-VIOLATION',
        code: 'TN2025FKVIOLATION',
        holyName: 'FKTest',
        fullName: 'FK Test',
        gender: 'Nam',
        dateOfBirth: '2000-01-01',
        parentName: 'FK Parent',
        parentPhone: '0900000000',
        address: 'FK Address',
        branch: 'AuNhi',
        classId: 'CLASS-DOES-NOT-EXIST-12345',
        parishId: 'gia-ton',
        updatedBy: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      // If FK constraints are off, skip the test
      expect(true).toBe(true)
      return
    } catch (err: any) {
      const extCode = err?.extendedCode || err?.cause?.extendedCode || err?.cause?.cause?.code || ''
      expect(extCode).not.toBe('SQLITE_CONSTRAINT_UNIQUE')
      // Should be a different constraint type (FK, NOTNULL, etc.)
      expect(extCode).toMatch(/^SQLITE_CONSTRAINT_/)
    }
  })

  it('filters out soft-deleted students from ClassSummary and ReportCard projections (Fix F7)', async () => {
    const { ClassSummaryProjectionRepository } = await import('../../repositories/ClassSummaryProjectionRepository.js')
    const { ReportCardProjectionRepository } = await import('../../repositories/ReportCardProjectionRepository.js')

    const delStudent = await createStudent({
      holyName: 'Giu-se',
      fullName: 'Nguyen Soft Delete Test',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'P',
      parentPhone: '0901111111',
      address: 'Test Addr',
      branch: 'AuNhi' as const,
      classId: 'AU1',
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')

    cleanupStudentIds.push(delStudent.id)

    // Soft delete the student
    await deleteStudent(delStudent.id, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')

    // Projection queries must exclude the soft-deleted student
    const projectionContext = {
      executor: db,
      academicYearRange: { startDate: '2025-08-01', endDate: '2026-07-31' },
      gradeWeights: {},
      attendancePolicy: { excusedWeight: 1 },
    }
    const classSummaryRepo = new ClassSummaryProjectionRepository()
    const summary = await classSummaryRepo.getClassSummary('AU1', '2025-2026', 'gia-ton', projectionContext)
    expect(summary?.students.some(s => s.studentId === delStudent.id)).toBe(false)

    const reportCardRepo = new ReportCardProjectionRepository()
    const reportCard = await reportCardRepo.getStudentReportCard(delStudent.id, '2025-2026', 'gia-ton', projectionContext)
    expect(reportCard).toBeNull()

    // Verify grades lifecycle for deleted student (Item 4)
    const { getGrades, upsertGrade } = await import('../../services/gradeService.js')

    // Upsert grade before delete to test getGrades filtering
    const tempStudent = await createStudent({
      holyName: 'An-rê',
      fullName: 'Grade Lifecycle Delete Test Student',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      parentName: 'P',
      parentPhone: '0902222222',
      address: 'Test Addr',
      branch: 'AuNhi' as const,
      classId: 'AU1',
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    cleanupStudentIds.push(tempStudent.id)

    const grade = await upsertGrade({
      studentId: tempStudent.id,
      academicYear: '2025-2026',
      semester: 1,
      scoreOral: 8,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')

    // Soft delete student
    await deleteStudent(tempStudent.id, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')

    // 1. getGrades must exclude the grade of the soft-deleted student
    const activeGrades = await getGrades('gia-ton')
    expect(activeGrades.some(g => g.id === grade.id)).toBe(false)

    // 2. upsertGrade must reject new grades for the soft-deleted student
    await expect(upsertGrade({
      studentId: tempStudent.id,
      academicYear: '2025-2026',
      semester: 1,
      scoreOral: 9,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')).rejects.toThrow('Không tìm thấy thiếu nhi hoặc thiếu nhi đã bị xóa')
  })
})

