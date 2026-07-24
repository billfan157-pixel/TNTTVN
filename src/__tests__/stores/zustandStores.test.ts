import { describe, it, expect, beforeEach } from 'vitest'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useAttendanceStore } from '../../stores/attendanceStore'
import { useNoticeStore } from '../../stores/noticeStore'

describe('Zustand State Stores Unit Tests', () => {
  beforeEach(() => {
    useStudentStore.setState({ students: [] })
    useGradeStore.setState({ grades: [] })
    useAttendanceStore.setState({ attendance: [] })
    useNoticeStore.setState({ notices: [] })
  })

  it('addStudent adds a new student to studentStore', () => {
    const store = useStudentStore.getState()
    store.addStudent({
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

  it('updateStudent modifies existing student in studentStore', () => {
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
    store.updateStudent('ST-001', { fullName: 'Trần Văn B (Đã sửa)' })
    expect(useStudentStore.getState().students[0].fullName).toBe('Trần Văn B (Đã sửa)')
  })

  it('upsertGrade adds and calculates average score correctly in gradeStore', () => {
    const store = useGradeStore.getState()
    store.upsertGrade({
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

  it('saveAttendance saves attendance status in attendanceStore', () => {
    const store = useAttendanceStore.getState()
    store.saveAttendance('ST-001', '2026-03-01', 'SundayMass', 'Present', 'Đi lễ đúng giờ')

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
