import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStudentStore } from '../../stores/studentStore'
import * as syncService from '../../lib/syncService'
import { api } from '../../lib/api'
import type { Student } from '../../types'

vi.mock('../../lib/api', () => ({
  api: {
    getStudents: vi.fn(),
  },
  isAuthenticated: () => {
    try {
      return !!localStorage.getItem('parish_current_user')
    } catch {
      return false
    }
  },
}))

vi.mock('../../lib/syncService', () => ({
  syncCreateStudent: vi.fn().mockResolvedValue(undefined),
  syncUpdateStudent: vi.fn().mockResolvedValue(undefined),
  syncDeleteStudent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../lib/db', () => ({
  dexieStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

const makeStudent = (overrides: Partial<Student> = {}): Student => ({
  id: 'ST-001', code: 'TN-1001', holyName: 'Giuse', fullName: 'Nguyễn Văn A',
  gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Cha A',
  parentPhone: '0901234567', address: 'Giáo Xứ', branch: 'ThieuNhi',
  classId: 'TN1', status: 'Đang học',
  ...overrides,
})

beforeEach(() => {
  useStudentStore.setState({ students: [], isLoading: false, error: null, pagination: { total: 0, page: 1, limit: 50 } })
  vi.clearAllMocks()
})

describe('studentStore', () => {
  it('addStudent creates student with id, code and syncs', async () => {
    await useStudentStore.getState().addStudent({
      holyName: 'Maria', fullName: 'Trần Thị B', gender: 'Nữ',
      dateOfBirth: '2015-02-02', parentName: 'Mẹ B', parentPhone: '0907654321',
      address: 'Giáo Xứ', branch: 'AuNhi', classId: 'AU1', status: 'Đang học',
    })
    const students = useStudentStore.getState().students
    expect(students).toHaveLength(1)
    expect(students[0].fullName).toBe('Trần Thị B')
    expect(students[0].id).toMatch(/^ST-/)
    expect(students[0].code).toMatch(/^TN/)
    expect(vi.mocked(syncService.syncCreateStudent)).toHaveBeenCalledTimes(1)
  })

  it('addStudent assigns id and code to the new student', async () => {
    const data: Omit<Student, 'id' | 'code'> = {
      holyName: 'Phêrô', fullName: 'Nguyễn Văn C', gender: 'Nam',
      dateOfBirth: '2015-03-03', parentName: 'Cha C', parentPhone: '0912345678',
      address: 'Giáo Xứ', branch: 'ThieuNhi', classId: 'TN2', status: 'Đang học',
    }
    await useStudentStore.getState().addStudent(data)
    const s = useStudentStore.getState().students[0]
    expect(s.holyName).toBe('Phêrô')
    expect(s.id).toMatch(/^ST-/)
    expect(s.code).toMatch(/^TN/)
    expect(s.gender).toBe('Nam')
  })

  it('replaceStudentId replaces a student in-place', () => {
    useStudentStore.setState({ students: [makeStudent()] })
    const serverStudent: Student = makeStudent({ id: 'ST-SERVER-001', code: 'TN-2000', fullName: 'Nguyễn Văn A (Server)' })
    useStudentStore.getState().replaceStudentId('ST-001', serverStudent)
    expect(useStudentStore.getState().students[0].id).toBe('ST-SERVER-001')
    expect(useStudentStore.getState().students[0].fullName).toBe('Nguyễn Văn A (Server)')
  })

  it('updateStudent updates locally and syncs', async () => {
    useStudentStore.setState({ students: [makeStudent()] })
    await useStudentStore.getState().updateStudent('ST-001', { fullName: 'Nguyễn Văn A (Đã sửa)' })
    expect(useStudentStore.getState().students[0].fullName).toBe('Nguyễn Văn A (Đã sửa)')
    expect(vi.mocked(syncService.syncUpdateStudent)).toHaveBeenCalledWith('ST-001', { fullName: 'Nguyễn Văn A (Đã sửa)' })
  })

  it('deleteStudent removes student and syncs', async () => {
    useStudentStore.setState({ students: [makeStudent()] })
    await useStudentStore.getState().deleteStudent('ST-001')
    expect(useStudentStore.getState().students).toHaveLength(0)
    expect(vi.mocked(syncService.syncDeleteStudent)).toHaveBeenCalledWith('ST-001')
  })

  it('deleteStudents removes multiple students and enqueues sync op for each', async () => {
    const s1 = makeStudent({ id: 'ST-001' })
    const s2 = makeStudent({ id: 'ST-002', fullName: 'Trần Thị B' })
    const s3 = makeStudent({ id: 'ST-003', fullName: 'Lê Văn C' })
    useStudentStore.setState({ students: [s1, s2, s3] })
    await useStudentStore.getState().deleteStudents(['ST-001', 'ST-003'])
    expect(useStudentStore.getState().students).toEqual([s2])
    expect(vi.mocked(syncService.syncDeleteStudent)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(syncService.syncDeleteStudent)).toHaveBeenCalledWith('ST-001')
    expect(vi.mocked(syncService.syncDeleteStudent)).toHaveBeenCalledWith('ST-003')
  })

  it('deleteStudents does nothing for empty list', async () => {
    useStudentStore.setState({ students: [makeStudent()] })
    await useStudentStore.getState().deleteStudents([])
    expect(useStudentStore.getState().students).toHaveLength(1)
    expect(vi.mocked(syncService.syncDeleteStudent)).not.toHaveBeenCalled()
  })

  it('deleteStudents tolerates ids not present locally', async () => {
    useStudentStore.setState({ students: [makeStudent()] })
    await useStudentStore.getState().deleteStudents(['ST-001', 'ST-NOPE'])
    expect(useStudentStore.getState().students).toHaveLength(0)
    expect(vi.mocked(syncService.syncDeleteStudent)).toHaveBeenCalledTimes(2)
  })

  it('batchPromote updates branch and classId for multiple students', async () => {
    const s1 = makeStudent({ id: 'ST-001', branch: 'ThieuNhi', classId: 'TN1' })
    const s2 = makeStudent({ id: 'ST-002', fullName: 'Trần Thị B', branch: 'ThieuNhi', classId: 'TN2' })
    useStudentStore.setState({ students: [s1, s2] })
    await useStudentStore.getState().batchPromote([
      { studentId: 'ST-001', newBranch: 'NghiaSi', newClassId: 'NS1' },
      { studentId: 'ST-002', newBranch: 'NghiaSi', newClassId: 'NS2' },
    ])
    expect(useStudentStore.getState().students[0].branch).toBe('NghiaSi')
    expect(useStudentStore.getState().students[0].classId).toBe('NS1')
    expect(useStudentStore.getState().students[1].branch).toBe('NghiaSi')
    expect(useStudentStore.getState().students[1].classId).toBe('NS2')
    expect(vi.mocked(syncService.syncUpdateStudent)).toHaveBeenCalledTimes(2)
  })

  it('batchPromote skips students not in list', async () => {
    const s1 = makeStudent({ id: 'ST-001', branch: 'ThieuNhi', classId: 'TN1' })
    const s2 = makeStudent({ id: 'ST-002', fullName: 'Trần Thị B', branch: 'ChienCon', classId: 'CC1' })
    useStudentStore.setState({ students: [s1, s2] })
    await useStudentStore.getState().batchPromote([{ studentId: 'ST-001', newBranch: 'NghiaSi', newClassId: 'NS1' }])
    expect(useStudentStore.getState().students[0].branch).toBe('NghiaSi')
    expect(useStudentStore.getState().students[1].branch).toBe('ChienCon')
  })

  it('fetchStudents with page>1 merges with existing', async () => {
    useStudentStore.setState({ students: [makeStudent()] })
    vi.mocked(api.getStudents).mockResolvedValue({ data: [makeStudent({ id: 'ST-002', fullName: 'Trần Thị B' })], total: 2 })
    localStorage.setItem('parish_current_user', '{"id":"U-TEST"}')
    await useStudentStore.getState().fetchStudents({ page: 2 })
    expect(useStudentStore.getState().students).toHaveLength(2)
    localStorage.removeItem('parish_current_user')
  })

  it('fetchStudents with updatedAfter merges', async () => {
    useStudentStore.setState({ students: [makeStudent()] })
    vi.mocked(api.getStudents).mockResolvedValue({ data: [makeStudent({ id: 'ST-002', fullName: 'Trần Thị B' })], total: 2 })
    localStorage.setItem('parish_current_user', '{"id":"U-TEST"}')
    await useStudentStore.getState().fetchStudents({ updatedAfter: '2025-01-01T00:00:00Z' })
    expect(useStudentStore.getState().students).toHaveLength(2)
    localStorage.removeItem('parish_current_user')
  })

  it('setStudents replaces all students', () => {
    useStudentStore.getState().setStudents([makeStudent()])
    expect(useStudentStore.getState().students).toHaveLength(1)
  })

  it('setPagination updates pagination state', () => {
    useStudentStore.getState().setPagination({ total: 100 })
    expect(useStudentStore.getState().pagination.total).toBe(100)
  })
})
