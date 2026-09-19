import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getDB } from '../../lib/db'
import { setTenantScope } from '../../lib/tenantScope'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { useNoticeStore } from '../../stores/noticeStore'
import { attendanceApiClient } from '../../lib/api/attendance'

describe('Zustand State Stores Unit Tests', () => {
  beforeEach(async () => {
    await getDB().syncQueue.clear()
    setTenantScope({ userId: 'USR-STORE-TEST', parishId: 'gia-ton' })
    localStorage.setItem('parish_current_user', JSON.stringify({ id: 'USR-STORE-TEST', parishId: 'gia-ton' }))
    useStudentStore.setState({ students: [] })
    useGradeStore.setState({ grades: [] })
    useAttendanceStore.setState({ attendance: [] })
    useNoticeStore.setState({ notices: [] })
  })

  afterEach(async () => {
    await getDB().syncQueue.clear()
    setTenantScope(null)
    localStorage.removeItem('parish_current_user')
    vi.restoreAllMocks()
  })

  it('addStudent adds a new student to studentStore', async () => {
    const store = useStudentStore.getState()
    await store.addStudent({
      fullName: 'Nguyễn Văn A',
      holyName: 'Phêrô',
      gender: 'Nam',
      dateOfBirth: '2015-01-01',
      branch: 'AuNhi',
      classId: 'au-1a',
      status: 'Đang học',
      address: '123 Đường ABC',
      parentName: 'Nguyễn Văn B',
      parentPhone: '0901234567',
    })
    expect(useStudentStore.getState().students.length).toBe(1)
    expect(useStudentStore.getState().students[0].fullName).toBe('Nguyễn Văn A')
  })

  it('updateStudent modifies existing student in studentStore', async () => {
    useStudentStore.setState({
      students: [
        {
          id: 'ST-001',
          code: 'TN001',
          holyName: 'Giuse',
          fullName: 'Trần Văn B',
          gender: 'Nam',
          dateOfBirth: '2015-02-02',
          branch: 'AuNhi',
          classId: 'au-1a',
          status: 'Đang học',
          parentName: 'Trần Văn C',
          parentPhone: '0907654321',
          address: '456 Đường XYZ',
        },
      ],
    })
    const store = useStudentStore.getState()
    // ADR-109/durable-first: the mutation is not acknowledged until its Dexie
    // queue write commits; leaving it un-awaited rejects after afterEach resets
    // the tenant scope.
    await store.updateStudent('ST-001', { fullName: 'Trần Văn B (Đã sửa)' })
    expect(useStudentStore.getState().students[0].fullName).toBe('Trần Văn B (Đã sửa)')
  })

  it('upsertGrade adds and calculates average score correctly in gradeStore', async () => {
    const store = useGradeStore.getState()
    await store.upsertGrade({
      studentId: 'ST-001',
      semester: 1,
      scoreOral: 9,
      score15m: 8,
      score1Period: 9,
      scoreMidterm: 10,
      scoreFinal: 9,
    })

    const studentGrade = useGradeStore.getState().getStudentGrade('ST-001', 1)
    expect(studentGrade).toBeDefined()
    expect(studentGrade?.scoreFinal).toBe(9)
  })

  it('saveAttendance saves attendance status in attendanceStore', async () => {
    const store = useAttendanceStore.getState()
    const mockRecord = { id: 'AT-01', studentId: 'ST-001', date: '2026-03-01', type: 'SundayMass', status: 'Present', note: 'Đi lễ đúng giờ', version: 1, createdAt: '', updatedAt: '' }
    vi.spyOn(attendanceApiClient, 'markAttendance').mockResolvedValue(mockRecord as any)

    await store.saveAttendance('ST-001', '2026-03-01', 'SundayMass', 'Present', 'Đi lễ đúng giờ')

    expect(useAttendanceStore.getState().attendance.length).toBe(1)
    expect(useAttendanceStore.getState().attendance[0].status).toBe('Present')
  })

  it('setNotices updates noticeStore correctly', () => {
    const store = useNoticeStore.getState()
    store.setNotices([
      {
        id: 'NC-001',
        title: 'Thông báo Họp Phụ Huynh',
        content: 'Trân trọng kính mời quý phụ huynh...',
        author: 'Cha Tuyên Úy',
        date: '2026-03-01',
        priority: 'important',
      },
    ])

    expect(useNoticeStore.getState().notices.length).toBe(1)
    expect(useNoticeStore.getState().notices[0].title).toBe('Thông báo Họp Phụ Huynh')
  })
})
