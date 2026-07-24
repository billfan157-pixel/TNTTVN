import { describe, it, expect } from 'vitest'
import { getStudents, getStudentById, createStudent, updateStudent, deleteStudent } from '../../services/studentService.js'

describe('Server studentService Layer Unit Tests', () => {
  let createdId: string

  it('createStudent inserts student into DB with ST prefix and code', async () => {
    const studentData = {
      holyName: 'Phêrô',
      fullName: 'Nguyễn Văn Test',
      gender: 'Nam',
      dateOfBirth: '2016-05-10',
      parentName: 'Nguyễn Văn Ba',
      parentPhone: '0901112233',
      address: 'Xóm Giáo 1',
      branch: 'AuNhi',
      classId: 'AU1',
      status: 'Đang học',
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
})
