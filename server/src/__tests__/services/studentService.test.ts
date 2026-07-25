import { describe, it, expect, beforeAll } from 'vitest'
import { getStudents, getStudentById, createStudent, updateStudent, deleteStudent } from '../../services/studentService.js'
import { db } from '../../db/index.js'
import { branches, academicYears, classes } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

describe('Server studentService Layer Unit Tests', () => {
  let createdId: string

  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(branches).values({ id: 'AuNhi', name: 'Ấu Nhi', scarfColor: '#16A34A', ageMin: 7, ageMax: 9, parishId: 'thanh-gia', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: '2025-2026', startDate: '2025-08-01', endDate: '2026-07-31', parishId: 'thanh-gia', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
    await db.insert(classes).values({ id: 'AU1', code: 'AU-01', name: 'Ấu Nhi 1', branchId: 'AuNhi', academicYearId: '2025-2026', room: 'Phòng 102', parishId: 'thanh-gia', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
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

    const created = await createStudent(studentData, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')
    expect(created).not.toBeNull()
    expect(created?.id).toMatch(/^ST-/)
    expect(created?.fullName).toBe('Nguyễn Văn Test')
    createdId = created!.id
  })

  it('getStudentById retrieves student by ID and parishId', async () => {
    const found = await getStudentById(createdId, 'thanh-gia')
    expect(found).not.toBeNull()
    expect(found?.fullName).toBe('Nguyễn Văn Test')
  })

  it('getStudents returns list containing created student', async () => {
    const list = await getStudents('thanh-gia')
    expect(list.length).toBeGreaterThan(0)
    const exists = list.some((s) => s.id === createdId)
    expect(exists).toBe(true)
  })

  it('updateStudent modifies student record in DB', async () => {
    const updated = await updateStudent(createdId, { fullName: 'Nguyễn Văn Test (Đã sửa)' }, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')
    expect(updated).not.toBeNull()
    expect(updated?.fullName).toBe('Nguyễn Văn Test (Đã sửa)')
  })

  it('deleteStudent performs soft delete (deletedAt set)', async () => {
    const deleted = await deleteStudent(createdId, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')
    expect(deleted).toBe(true)

    // Soft-deleted student should no longer be returned by getStudentById
    const afterDelete = await getStudentById(createdId, 'thanh-gia')
    expect(afterDelete).toBeNull()
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
    await expect(createStudent(data, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')).rejects.toThrow('Class not found')
  })

  it('rejects createStudent with soft-deleted classId', async () => {
    const now = new Date().toISOString()
    await db.insert(classes).values({
      id: 'AU-DEL', code: 'AU-DEL', name: 'Deleted Class',
      branchId: 'AuNhi', academicYearId: '2025-2026',
      room: 'Test', parishId: 'thanh-gia',
      createdAt: now, updatedAt: now, updatedBy: 'test',
    }).onConflictDoNothing()
    await db.update(classes).set({ deletedAt: now }).where(eq(classes.id, 'AU-DEL'))

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
      createStudent(data, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')
    ).rejects.toThrow('Class has been deleted')
  })
})
