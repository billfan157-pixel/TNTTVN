import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createAcademicYearMock, isAuthenticatedMock } = vi.hoisted(() => ({
  createAcademicYearMock: vi.fn(),
  isAuthenticatedMock: vi.fn(() => true),
}))

vi.mock('../../lib/api', () => ({
  api: {
    createAcademicYear: (...args: unknown[]) => createAcademicYearMock(...args),
    getClassAcademicYears: vi.fn(),
  },
  isAuthenticated: () => isAuthenticatedMock(),
}))

vi.mock('../../lib/db', () => ({
  dexieStorage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}))

import { useAcademicYearStore } from '../../stores/academicYearStore'

describe('academicYearStore authoritative creation acknowledgement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isAuthenticatedMock.mockReturnValue(true)
    useAcademicYearStore.setState({
      currentYear: '2025-2026',
      academicYears: [{ id: '2025-2026', startDate: '2025-08-01', endDate: '2026-07-31', isLocked: 0 }],
      error: null,
      isLoading: false,
    })
  })

  it('keeps the selected year unchanged when the server rejects creation', async () => {
    createAcademicYearMock.mockRejectedValue(new Error('Network error'))

    await expect(useAcademicYearStore.getState().createAcademicYear('2026-2027')).rejects.toThrow('Network error')

    expect(useAcademicYearStore.getState().currentYear).toBe('2025-2026')
    expect(useAcademicYearStore.getState().academicYears.map((year) => year.id)).toEqual(['2025-2026'])
  })

  it('does not turn unauthenticated selection into an offline create workflow', async () => {
    isAuthenticatedMock.mockReturnValue(false)

    await expect(useAcademicYearStore.getState().createAcademicYear('2026-2027')).rejects.toThrow(/kết nối và đăng nhập/i)

    expect(createAcademicYearMock).not.toHaveBeenCalled()
    expect(useAcademicYearStore.getState().currentYear).toBe('2025-2026')
  })

  it('updates the list and current selection only after an acknowledged row', async () => {
    createAcademicYearMock.mockResolvedValue({
      id: '2026-2027', startDate: '2026-08-01', endDate: '2027-07-31', isLocked: 0,
    })

    await useAcademicYearStore.getState().createAcademicYear('2026 - 2027')

    expect(createAcademicYearMock).toHaveBeenCalledWith({ id: '2026-2027' })
    expect(useAcademicYearStore.getState().currentYear).toBe('2026-2027')
    expect(useAcademicYearStore.getState().academicYears.map((year) => year.id)).toEqual(['2026-2027', '2025-2026'])
  })
})
