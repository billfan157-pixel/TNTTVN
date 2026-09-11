import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import OrganizationDashboardPage from '../../pages/OrganizationDashboardPage'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import { useParishEventStore } from '../../stores/parishEventStore'
import { useNoticeStore } from '../../stores/noticeStore'
import { useOperationsStore } from '../../stores/operationsStore'
import type { ParishProfileSnapshot } from '../../types/parishProfile'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

const snapshot: ParishProfileSnapshot = {
  profile: {
    parishId: 'gia-ton', displayName: 'Xứ Đoàn Đức Mẹ Fatima', patronName: 'Đức Mẹ Fatima',
    foundedDate: '1998-05-13', motto: 'Cầu nguyện – Rước lễ – Hy sinh – Làm tông đồ',
    description: 'Cùng nhau phụng sự.', updatedBy: 'USR-1', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
  },
  people: [{
    id: 'PPE-1', parishId: 'gia-ton', linkedUserId: null, holyName: 'Giuse', fullName: 'Nguyễn Văn A', birthYear: 1990,
    biography: 'Phục vụ từ năm 2010.', serviceStatus: 'ACTIVE', visibility: 'STAFF', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
  }],
  units: [{
    id: 'POU-1', parishId: 'gia-ton', parentId: null, name: 'Ban Điều Hành', unitType: 'BOARD', description: null,
    sortOrder: 0, isActive: true, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
  }],
  terms: [{
    id: 'PST-1', parishId: 'gia-ton', personId: 'PPE-1', unitId: 'POU-1', positionTitle: 'Xứ đoàn trưởng', positionCode: 'PARISH_LEADER', rankTitle: 'Huynh trưởng cấp III',
    startDate: '2024-01-01', endDate: null, notes: null, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
  }],
  records: [],
  assets: [],
  timeline: [],
  accounts: [],
  permissions: { canManage: true, canUpload: true },
}

describe('OrganizationDashboardPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({
      user: {
        id: 'USR-1',
        parishId: 'gia-ton',
        role: 'admin',
        fullName: 'Trưởng Ban',
        displayName: 'Trưởng Ban',
        email: 'admin@giaton.vn',
      } as any,
    })
    useParishProfileStore.getState().clear()
    useParishProfileStore.setState({ snapshot, isLoading: false, error: null })
    useParishEventStore.setState({ events: [], loading: false, error: null })
    useNoticeStore.setState({ notices: [], loading: false, error: null })
    useOperationsStore.setState({ tasks: [], events: [], loading: false, error: null })
    vi.spyOn(api.parishProfile, 'getSnapshot').mockResolvedValue(snapshot)
  })

  it('hiển thị đầy đủ thông tin tổng quan xứ đoàn và các lối tắt phân hệ', async () => {
    await act(async () => {
      render(<OrganizationDashboardPage />)
    })
    expect(screen.getByText('Xứ Đoàn Đức Mẹ Fatima')).toBeInTheDocument()
    expect(screen.getByText('Hồ sơ Xứ đoàn')).toBeInTheDocument()
    expect(screen.getByText('Công việc')).toBeInTheDocument()
    expect(screen.getByText('Huynh trưởng / GLV')).toBeInTheDocument()
  })

  it('hiển thị banner nhắc việc và badge khi có công việc chờ phản hồi tiếp nhận', async () => {
    useOperationsStore.setState({
      tasks: [
        {
          id: 'TSK-1',
          title: 'Chuẩn bị âm thanh lễ',
          status: 'TODO',
          phase: 'PREPARATION',
          isRequired: true,
          myAssignments: [{ acknowledgementStatus: 'PENDING', assignmentRole: 'OWNER' }],
        } as any,
      ],
    })

    await act(async () => {
      render(<OrganizationDashboardPage />)
    })
    expect(screen.getByText(/Bạn có 1 công việc đang chờ tiếp nhận/i)).toBeInTheDocument()
    expect(screen.getByText('1 chờ nhận')).toBeInTheDocument()
  })

  it('điều hướng chính xác đến từng tab chuyên biệt của Hồ Sơ Xứ Đoàn khi bấm các thẻ KPI và widget', async () => {
    await act(async () => {
      render(<OrganizationDashboardPage />)
    })

    // 1. Click KPI Huynh Trưởng / GLV
    const peopleCard = screen.getByTitle('Xem danh sách hồ sơ Huynh Trưởng / GLV')
    peopleCard.click()
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/parish-profile', search: { tab: 'people' } })

    // 2. Click KPI Đơn Vị Trực Thuộc
    const unitsCard = screen.getByTitle('Xem sơ đồ cơ cấu tổ chức và các ban ngành')
    unitsCard.click()
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/parish-profile', search: { tab: 'organization' } })

    // 3. Click KPI Hoạt Động & Cột Mốc
    const recordsCard = screen.getByTitle('Xem các cột mốc lịch sử và sự kiện nổi bật')
    recordsCard.click()
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/parish-profile', search: { tab: 'history' } })

    // 4. Click KPI Kho Tư Liệu
    const assetsCard = screen.getByTitle('Xem kho ảnh, video và văn kiện lưu trữ')
    assetsCard.click()
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/parish-profile', search: { tab: 'archive' } })

    // 5. Click "Xem tất cả" tại Ban Điều Hành
    const seeAllLeadershipBtn = screen.getByRole('button', { name: 'Xem tất cả' })
    seeAllLeadershipBtn.click()
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/parish-profile', search: { tab: 'organization' } })
  })

  it('gắn badge Điều phối cho nhiệm kỳ có quyền và ẩn nhiệm kỳ chưa bắt đầu', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    useParishProfileStore.setState({
      snapshot: {
        ...snapshot,
        people: [
          ...snapshot.people,
          {
            id: 'PPE-2', parishId: 'gia-ton', linkedUserId: null, holyName: null, fullName: 'Trần Thị B', birthYear: null,
            biography: null, serviceStatus: 'ACTIVE', visibility: 'STAFF', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
          },
        ],
        terms: [
          ...snapshot.terms,
          {
            id: 'PST-2', parishId: 'gia-ton', personId: 'PPE-2', unitId: 'POU-1', positionTitle: 'Thư ký', positionCode: null, rankTitle: null,
            startDate: tomorrow, endDate: null, notes: null, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
          },
        ],
      } as any,
    })

    await act(async () => {
      render(<OrganizationDashboardPage />)
    })
    expect(screen.getByText('Điều phối')).toBeInTheDocument()
    expect(screen.queryByText('Trần Thị B')).toBeNull()
  })
})
