import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStudentStore } from '../../stores/studentStore'
import { useClassStore } from '../../stores/classStore'
import * as syncService from '../../lib/syncService'
import type { Student } from '../../types'
import { setTenantScope } from '../../lib/tenantScope'

vi.mock('../../lib/api', () => ({
  api: {
    getStudents: vi.fn(),
  },
  isAuthenticated: () => true,
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

const mockClasses: any[] = [
  { id: 'CLS-AU1', code: 'AU1', name: 'Ấu 1', branchId: 'AuNhi', academicYearId: 'AY-2026' },
  { id: 'CLS-AU2', code: 'AU2', name: 'Ấu 2', branchId: 'AuNhi', academicYearId: 'AY-2026' },
  { id: 'CLS-TN1', code: 'TN1', name: 'Thiếu 1', branchId: 'ThieuNhi', academicYearId: 'AY-2026' },
]

const makeStudent = (id: string, fullName: string, classId: string, branch: any): Student => ({
  id,
  code: `TN-${id}`,
  holyName: 'Giuse',
  fullName,
  gender: 'Nam',
  dateOfBirth: '2015-01-01',
  parentName: 'Phụ huynh',
  parentPhone: '0901234567',
  address: 'Giáo xứ',
  branch,
  classId,
  status: 'Đang học',
})

beforeEach(() => {
  setTenantScope({ parishId: 'PARISH-TEST', userId: 'U-TEST' })
  useClassStore.setState({ classes: mockClasses })
  useStudentStore.setState({
    students: [
      makeStudent('ST-01', 'Nguyễn Văn An', 'CLS-AU1', 'AuNhi'),
      makeStudent('ST-02', 'Trần Thị Bình', 'CLS-AU1', 'AuNhi'),
      makeStudent('ST-03', 'Lê Văn Cường', 'CLS-AU2', 'AuNhi'),
    ],
    isLoading: false,
    error: null,
  })
  vi.clearAllMocks()
})

describe('studentStore.transferStudents', () => {
  it('updates classId and branch optimistically and enqueues syncUpdateStudent with reason', async () => {
    await useStudentStore.getState().transferStudents(
      ['ST-01', 'ST-02'],
      'CLS-TN1',
      'Chuyển lớp theo nguyện vọng phụ huynh'
    )

    const students = useStudentStore.getState().students
    const s1 = students.find((s) => s.id === 'ST-01')!
    const s2 = students.find((s) => s.id === 'ST-02')!
    const s3 = students.find((s) => s.id === 'ST-03')!

    expect(s1.classId).toBe('CLS-TN1')
    expect(s1.branch).toBe('ThieuNhi')
    expect(s2.classId).toBe('CLS-TN1')
    expect(s2.branch).toBe('ThieuNhi')
    // ST-03 was not transferred
    expect(s3.classId).toBe('CLS-AU2')

    // Expect syncUpdateStudent to be called for both students with membershipChangeReason
    expect(syncService.syncUpdateStudent).toHaveBeenCalledTimes(2)
    expect(syncService.syncUpdateStudent).toHaveBeenCalledWith('ST-01', {
      classId: 'CLS-TN1',
      branch: 'ThieuNhi',
      membershipChangeReason: 'Chuyển lớp theo nguyện vọng phụ huynh',
    })
    expect(syncService.syncUpdateStudent).toHaveBeenCalledWith('ST-02', {
      classId: 'CLS-TN1',
      branch: 'ThieuNhi',
      membershipChangeReason: 'Chuyển lớp theo nguyện vọng phụ huynh',
    })
  })

  it('rejects if reason has less than 5 characters', async () => {
    await expect(
      useStudentStore.getState().transferStudents(['ST-01'], 'CLS-TN1', 'abc')
    ).rejects.toThrow('Vui lòng nhập lý do chuyển lớp/ngành (ít nhất 5 ký tự).')

    // State remains untouched
    const s1 = useStudentStore.getState().students.find((s) => s.id === 'ST-01')!
    expect(s1.classId).toBe('CLS-AU1')
    expect(syncService.syncUpdateStudent).not.toHaveBeenCalled()
  })

  it('rejects if targetClassId does not exist', async () => {
    await expect(
      useStudentStore.getState().transferStudents(['ST-01'], 'NON-EXISTENT', 'Lý do hợp lệ dài')
    ).rejects.toThrow('Không tìm thấy lớp học đích.')

    expect(syncService.syncUpdateStudent).not.toHaveBeenCalled()
  })

  it('rolls back optimistic state if sync fails', async () => {
    vi.mocked(syncService.syncUpdateStudent).mockRejectedValueOnce(new Error('Sync enqueue error'))

    await expect(
      useStudentStore.getState().transferStudents(['ST-01'], 'CLS-TN1', 'Lý do hợp lệ dài')
    ).rejects.toThrow('Sync enqueue error')

    // Rolled back to original state
    const s1 = useStudentStore.getState().students.find((s) => s.id === 'ST-01')!
    expect(s1.classId).toBe('CLS-AU1')
    expect(s1.branch).toBe('AuNhi')
  })
})
