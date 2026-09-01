import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatechistPage } from '../pages/CatechistPage'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useClassStore } from '../stores/classStore'

vi.mock(import('../lib/api'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: {
      ...actual.api,
      getCatechists: vi.fn(),
      getUsers: vi.fn(),
      deleteUser: vi.fn(),
    },
  }
})

vi.mock(import('@tanstack/react-router'), async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => vi.fn() }
})

const directoryEntry = {
  id: 'glv-1',
  fullName: 'Nguyễn Văn An',
  holyName: 'Phêrô',
  role: 'chunhiem' as const,
  assignedClasses: ['class-1'],
  assignedClassNames: ['Ấu Nhi 1'],
}

describe('CatechistPage role-aware directory and management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getCatechists).mockResolvedValue([directoryEntry])
    vi.mocked(api.getUsers).mockResolvedValue([
      { id: 'admin-1', username: 'admin', fullName: 'Admin', role: 'admin', status: 'ACTIVE', assignedClasses: [], lastLoginAt: null },
      { id: 'glv-1', username: 'glv_an', fullName: 'Nguyễn Văn An', holyName: 'Phêrô', role: 'chunhiem', status: 'ACTIVE', assignedClasses: ['class-1'], lastLoginAt: null },
    ] as any)
    vi.mocked(api.deleteUser).mockResolvedValue({ id: 'glv-1', deleted: true, alreadyDeleted: false })
    useClassStore.setState({
      classes: [{ id: 'class-1', code: 'AN-1', name: 'Ấu Nhi 1' }] as any,
      getClassList: () => [{ id: 'class-1', code: 'AN-1', name: 'Ấu Nhi 1' }] as any,
      findClassById: (id: string) => id === 'class-1' ? ({ id, code: 'AN-1', name: 'Ấu Nhi 1' } as any) : undefined,
    })
  })

  it.each(['chunhiem', 'phuta'] as const)('renders a sanitized read-only directory for %s', async role => {
    useAuthStore.setState({
      user: { id: `${role}-1`, username: role, fullName: role, role, status: 'ACTIVE', parishId: 'p1' },
      isAuthenticated: true,
    })

    await act(async () => { render(<CatechistPage />) })

    expect(await screen.findByText('Nguyễn Văn An')).toBeInTheDocument()
    expect(screen.getByText(/Chế độ chỉ xem/)).toBeInTheDocument()
    expect(screen.queryByText('@glv_an')).toBeNull()
    expect(screen.queryByRole('button', { name: /Phân Công|Đặt Mật Khẩu|Xóa Tài Khoản/i })).toBeNull()
    expect(api.getUsers).not.toHaveBeenCalled()
  })

  it('lets admin delete an account only after password re-authentication', async () => {
    useAuthStore.setState({
      user: { id: 'admin-1', username: 'admin', fullName: 'Admin', role: 'admin', status: 'ACTIVE', parishId: 'p1' },
      isAuthenticated: true,
    })

    await act(async () => { render(<CatechistPage />) })
    expect(await screen.findAllByText('Nguyễn Văn An')).not.toHaveLength(0)

    fireEvent.click(screen.getAllByTitle('Xóa Tài Khoản')[0])
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại của Admin'), { target: { value: 'AdminDelete@123' } })
    const deleteButtons = screen.getAllByRole('button', { name: 'Xóa Tài Khoản' })
    fireEvent.click(deleteButtons[deleteButtons.length - 1])

    await waitFor(() => expect(api.deleteUser).toHaveBeenCalledWith('glv-1', 'AdminDelete@123'))
  })
})
