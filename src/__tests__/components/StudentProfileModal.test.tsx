import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { StudentProfileModal } from '../../components/common/StudentProfileModal'
import type { Student } from '../../types'
import { useUIStore } from '../../stores/uiStore'

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockImplementation(() => Promise.resolve()),
  },
})

const mockStudent: Student = {
  id: 'st-01',
  code: 'TN-001',
  holyName: 'Maria',
  fullName: 'Nguyễn Thị Hương',
  gender: 'Nữ',
  dateOfBirth: '2014-05-15',
  baptismDate: '2014-06-20',
  firstCommunionDate: '2023-05-20',
  confirmationDate: '',
  parentName: 'Nguyễn Văn Cha',
  parentPhone: '0901234567',
  address: '123 Đường Giáo Xứ, Ấp 1',
  branch: 'ThieuNhi',
  classId: 'TN1',
  status: 'Đang học',
  notes: 'Em chăm ngoan, hát hay và tích cực tham gia các phong trào.',
}

vi.mock('../../stores/classStore', async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    useClassStore: (selector: any) =>
      selector({
        classes: [{ id: 'TN1', name: 'Thiếu Nhi 1A', assignedToCurrentUser: true }],
        findClassById: (id: string) => ({
          id,
          name: 'Thiếu Nhi 1A',
          catechistLeader: 'Huynh Trưởng Trưởng',
          room: 'Phòng 102',
        }),
      }),
  }
})

vi.mock('../../stores/academicYearStore', () => ({
  useAcademicYearStore: (selector: any) =>
    selector({
      currentYear: '2025-2026',
      resolveActiveYear: () => '2025-2026',
      getYearRange: () => ({ startDate: '2025-08-01', endDate: '2026-06-30' }),
    }),
}))

vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: (selector: any) =>
    selector({
      settings: {
        parishName: 'Giáo Xứ Gia Tôn',
        dioceseName: 'Giáo Phận Xuân Lộc',
        promotionPolicy: { minGpa: 5.0, minAttendance: 80 },
      },
    }),
}))

vi.mock('../../stores/gradeStore', () => ({
  useGradeStore: (selector: any) =>
    selector({
      getStudentGrade: (_id: string, sem: number) => ({
        id: `gr-${sem}`,
        scoreOral: 8.5,
        score15m: 9.0,
        score1Period: 8.0,
        scoreMidterm: 8.5,
        scoreFinal: 9.0,
        scoreDaoDuc: 10,
      }),
      calculateStudentAvg: (_id: string, sem: number) => ({
        score: sem === 1 ? 8.6 : 8.8,
        label: 'Giỏi',
      }),
    }),
}))

vi.mock('../../stores/attendanceStore', () => ({
  useAttendanceStore: (selector: any) =>
    selector({
      getStudentAttendanceRate: () => ({ rate: 95.5, presentCount: 38, totalCount: 40 }),
      attendance: [
        { id: 'att-1', studentId: 'st-01', date: '2025-09-07', type: 'SundayMass', status: 'Present' },
        { id: 'att-2', studentId: 'st-01', date: '2025-09-07', type: 'CatechismClass', status: 'Present' },
        { id: 'att-3', studentId: 'st-01', date: '2025-09-14', type: 'SundayMass', status: 'AbsentExcused' },
      ],
    }),
}))

const authMockState = {
  user: { id: 'admin-1', role: 'admin', parishId: 'parish-test' },
  role: 'admin',
  isAdmin: true,
  isChunhiem: false,
  isPhuta: false,
}

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => authMockState,
}))

describe('StudentProfileModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    authMockState.role = 'admin'
    authMockState.isAdmin = true
    authMockState.isChunhiem = false
    authMockState.isPhuta = false
    useUIStore.setState({
      isStudentProfileOpen: true,
      studentForProfile: mockStudent,
    })
  })

  it('renders student identity accurately on mount', () => {
    render(<StudentProfileModal isOpen onClose={onClose} student={mockStudent} />)

    // Name and Holy Name
    expect(screen.getByText('Maria')).toBeInTheDocument()
    expect(screen.getByText('Nguyễn Thị Hương')).toBeInTheDocument()

    // Badges & code
    expect(screen.getByText('TN-001')).toBeInTheDocument()
    expect(screen.getByText('Thiếu Nhi')).toBeInTheDocument()
    expect(screen.getByText('Lớp: Thiếu Nhi 1A')).toBeInTheDocument()
    expect(screen.getByText('Đang học')).toBeInTheDocument()
  })

  it('displays overview tab with sacraments and notes', () => {
    render(<StudentProfileModal isOpen onClose={onClose} student={mockStudent} />)

    // Default tab is Overview
    expect(screen.getByText('Thông Tin Cá Nhân')).toBeInTheDocument()
    expect(screen.getByText('123 Đường Giáo Xứ, Ấp 1')).toBeInTheDocument()
    expect(screen.getByText('Huynh Trưởng Trưởng')).toBeInTheDocument()

    // Sacraments
    expect(screen.getByText('1. Bí Tích Rửa Tội')).toBeInTheDocument()
    expect(screen.getByText('2. Rước Lễ Lần Đầu')).toBeInTheDocument()
    expect(screen.getByText('3. Bí Tích Thêm Sức')).toBeInTheDocument()

    // Notes
    expect(screen.getByText(/"Em chăm ngoan, hát hay và tích cực tham gia các phong trào."/)).toBeInTheDocument()
  })

  it('switches to Family tab and renders parent contact info with action buttons', () => {
    render(<StudentProfileModal isOpen onClose={onClose} student={mockStudent} />)

    const familyTabBtn = screen.getByRole('tab', { name: /Gia Đình & Liên Hệ/i })
    fireEvent.click(familyTabBtn)

    expect(screen.getByText('Nguyễn Văn Cha')).toBeInTheDocument()
    expect(screen.getByText('0901234567')).toBeInTheDocument()

    const callBtn = screen.getByRole('link', { name: /Gọi Điện/i })
    expect(callBtn).toHaveAttribute('href', 'tel:0901234567')

    const smsBtn = screen.getByRole('link', { name: /Gửi SMS/i })
    expect(smsBtn).toHaveAttribute('href', 'sms:0901234567')
  })

  it('switches to Academic tab and renders grades, attendance and promotion prediction', () => {
    render(<StudentProfileModal isOpen onClose={onClose} student={mockStudent} />)

    const academicTabBtn = screen.getByRole('tab', { name: /Học Tập & Chuyên Cần/i })
    fireEvent.click(academicTabBtn)

    // Scores
    expect(screen.getAllByText('8.6').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('8.8').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('95.5%')).toBeInTheDocument()

    // Promotion
    expect(screen.getByText(/Đủ điều kiện thăng tiến/i)).toBeInTheDocument()
  })

  it('switches to Card & QR tab and renders digital card and download button', () => {
    render(<StudentProfileModal isOpen onClose={onClose} student={mockStudent} />)

    const cardTabBtn = screen.getByRole('tab', { name: /Thẻ Số & Mã QR/i })
    fireEvent.click(cardTabBtn)

    expect(screen.getByText(/Catevia Digital ID/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tải Ảnh Mã QR/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mở Mẫu In Thẻ Đeo Ngực/i })).toBeInTheDocument()
  })

  it('transitions to edit student modal when clicking Chỉnh Sửa button', () => {
    const openEditStudent = vi.fn()
    useUIStore.setState({ openEditStudent })

    render(<StudentProfileModal isOpen onClose={onClose} student={mockStudent} />)

    const editBtn = screen.getByRole('button', { name: /Chỉnh Sửa/i })
    fireEvent.click(editBtn)

    expect(onClose).toHaveBeenCalled()
    expect(openEditStudent).toHaveBeenCalledWith(mockStudent)
  })

  it('hides Chỉnh Sửa button for non-admin when student is not in an assigned class', () => {
    authMockState.role = 'chunhiem'
    authMockState.isAdmin = false
    authMockState.isChunhiem = true

    // Student has classId 'OTHER_CLASS' which is not in assigned classes
    render(<StudentProfileModal isOpen onClose={onClose} student={{ ...mockStudent, classId: 'OTHER_CLASS' }} />)

    expect(screen.queryByRole('button', { name: /Chỉnh Sửa/i })).not.toBeInTheDocument()
  })
})
