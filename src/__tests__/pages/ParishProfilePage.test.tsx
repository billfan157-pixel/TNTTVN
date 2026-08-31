import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ParishProfilePage from '../../pages/ParishProfilePage'
import { api } from '../../lib/api'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import type { ParishProfileSnapshot } from '../../types/parishProfile'

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
    id: 'POU-1', parishId: 'gia-ton', parentId: null, name: 'Ban Trị Sự', unitType: 'BOARD', description: null,
    sortOrder: 0, isActive: true, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
  }],
  terms: [{
    id: 'PST-1', parishId: 'gia-ton', personId: 'PPE-1', unitId: 'POU-1', positionTitle: 'Xứ đoàn trưởng', rankTitle: 'Huynh trưởng cấp III',
    startDate: '2024-01-01', endDate: null, notes: null, createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z',
  }],
  records: [
    { id: 'PRC-1', parishId: 'gia-ton', recordType: 'MILESTONE', title: 'Ngày thành lập', summary: 'Cột mốc khai sinh Xứ đoàn.', content: null, occurredOn: '1998-05-13', endedOn: null, location: null, status: 'PUBLISHED', visibility: 'STAFF', showOnTimeline: true, sourceEventId: null, personIds: [], assetIds: [], publishedAt: '2026-08-31T00:00:00Z', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z' },
    { id: 'PRC-2', parishId: 'gia-ton', recordType: 'ACTIVITY', title: 'Trại hè 2026', summary: null, content: null, occurredOn: '2026-06-01', endedOn: null, location: 'Giáo xứ', status: 'PUBLISHED', visibility: 'STAFF', showOnTimeline: true, sourceEventId: null, personIds: ['PPE-1'], assetIds: [], publishedAt: '2026-08-31T00:00:00Z', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z' },
  ],
  assets: [],
  timeline: [{ id: 'PRC-2', kind: 'RECORD', date: '2026-06-01', endDate: null, title: 'Trại hè 2026', summary: null, recordType: 'ACTIVITY' }],
  accounts: [],
  permissions: { canManage: true, canUpload: true },
}

describe('ParishProfilePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useParishProfileStore.getState().clear()
    vi.spyOn(api.parishProfile, 'getSnapshot').mockResolvedValue(snapshot)
  })

  it('hiển thị hồ sơ cấp Xứ đoàn và bảy phân khu nghiệp vụ', async () => {
    render(<ParishProfilePage />)
    expect(await screen.findByRole('heading', { name: 'Xứ Đoàn Đức Mẹ Fatima' })).toBeTruthy()
    expect(screen.getAllByRole('tab')).toHaveLength(7)
    expect(screen.getByText('Cột mốc khai sinh Xứ đoàn.')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Hoạt động/ }))
    expect(screen.getByText('Trại hè 2026')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Cơ cấu/ }))
    expect(screen.getAllByText('Ban Trị Sự')).toHaveLength(2)
    expect(screen.getByText(/Xứ đoàn trưởng/)).toBeTruthy()
  })

  it('không hiện thao tác quản trị khi snapshot chỉ cho phép đọc', async () => {
    vi.mocked(api.parishProfile.getSnapshot).mockResolvedValue({ ...snapshot, permissions: { canManage: false, canUpload: false } })
    render(<ParishProfilePage />)
    await waitFor(() => expect(screen.getByText('Xứ Đoàn Đức Mẹ Fatima')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Cập nhật' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Sửa Ngày thành lập/ })).toBeNull()
  })

  it('uses the shared vertical form-group contract inside the editor modal', async () => {
    render(<ParishProfilePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cập nhật' }))

    const nameInput = screen.getByLabelText('Tên Xứ đoàn *')
    expect(nameInput.closest('label')?.classList.contains('form-group')).toBe(true)
    expect(document.querySelector('.form-field')).toBeNull()
  })
})
