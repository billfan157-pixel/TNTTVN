import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopDailyGradeEntry } from '../../components/desktop/DesktopDailyGradeEntry'
import { MobileDailyGradeEntry } from '../../components/mobile/MobileDailyGradeEntry'
import { useDailyGradeStore } from '../../stores/dailyGradeStore'
import { useStudentStore } from '../../stores/studentStore'
import { useFilterStore } from '../../stores/filterStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'
import { useToastStore } from '../../stores/toastStore'
import { useAuth } from '../../hooks/useAuth'
import type { Student } from '../../types'

vi.mock('../../hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../../hooks/useSemesterAccess', () => ({ useSemesterAccess: () => ({ restricted: false, openSemester: 1 }) }))

const student = { id: 'ST-1', code: 'TN01', fullName: 'Nguyễn An', holyName: 'Giuse', status: 'Đang học', classId: 'CL-1' } as Student
const otherStudent = { ...student, id: 'ST-2', code: 'TN02', fullName: 'Trần Bình' }
const addScoreBonus = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({ can: () => true } as any)
  addScoreBonus.mockResolvedValue(undefined)
  useAcademicYearStore.setState({ currentYear: '2026-2027' })
  useFilterStore.setState({ selectedClassId: 'CL-1', selectedSemester: 1 })
  useStudentStore.setState({ students: [student, otherStudent] })
  useDailyGradeStore.setState({ entries: [], serverEntries: [], addScoreBonus, fetchDailyEntries: vi.fn().mockResolvedValue(undefined) })
  useToastStore.setState({ toasts: [] })
})

describe.each(['desktop', 'mobile'] as const)('Inline +1 on %s daily entry', mode => {
  const renderEntry = () => render(mode === 'desktop' ? <DesktopDailyGradeEntry /> : <MobileDailyGradeEntry onViewReport={vi.fn()} />)

  it('adds exactly one point to the named student in one click without opening a dialog or expanding a mobile card', async () => {
    renderEntry()
    const button = screen.getByRole('button', { name: 'Cộng 1 điểm miệng cho Trần Bình' })
    const nameContainer = button.closest(mode === 'desktop' ? 'td' : 'article')!
    expect(within(nameContainer as HTMLElement).getByText('Trần Bình')).toBeInTheDocument()
    fireEvent.click(button)
    await waitFor(() => expect(addScoreBonus).toHaveBeenCalledExactlyOnceWith('ST-2', 'oral', 1, 1, '2026-2027'))
    expect(screen.queryByRole('dialog')).toBeNull()
    if (mode === 'mobile') expect(within(nameContainer as HTMLElement).getByRole('button', { expanded: false })).toBeInTheDocument()
    await waitFor(() => expect(button).toBeEnabled())
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/Trần Bình.*chờ đồng bộ/)
  })

  it('uses the selected score column and semester', async () => {
    useFilterStore.setState({ selectedSemester: 2 })
    renderEntry()
    fireEvent.click(screen.getByRole(mode === 'desktop' ? 'button' : 'tab', { name: mode === 'desktop' ? /Điểm 15 Phút/ : '15 phút' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cộng 1 điểm 15 phút cho Nguyễn An' }))
    await waitFor(() => expect(addScoreBonus).toHaveBeenCalledExactlyOnceWith('ST-1', '15m', 1, 2, '2026-2027'))
  })

  it('adds one point to prayer when the Khảo kinh column is selected', async () => {
    renderEntry()
    fireEvent.click(screen.getByRole(mode === 'desktop' ? 'button' : 'tab', { name: /Khảo [Kk]inh/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cộng 1 điểm khảo kinh cho Nguyễn An' }))
    await waitFor(() => expect(addScoreBonus).toHaveBeenCalledExactlyOnceWith('ST-1', 'prayer', 1, 1, '2026-2027'))
  })

  it('blocks duplicate clicks while persisting, reports failure, then allows a retry', async () => {
    let reject!: (reason: Error) => void
    addScoreBonus.mockImplementationOnce(() => new Promise<void>((_, no) => { reject = no }))
    renderEntry()
    const button = screen.getByRole('button', { name: 'Cộng 1 điểm miệng cho Nguyễn An' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(addScoreBonus).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    // Another student's independent action remains available.
    expect(screen.getByRole('button', { name: 'Cộng 1 điểm miệng cho Trần Bình' })).toBeEnabled()
    await act(async () => reject(new Error('Disk full')))
    expect(button).toBeEnabled()
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ type: 'error', message: expect.stringMatching(/Chưa lưu được.*Nguyễn An/) })
    fireEvent.click(button)
    await waitFor(() => expect(addScoreBonus).toHaveBeenCalledTimes(2))
  })

  it('does not offer score bonuses to a read-only actor', () => {
    vi.mocked(useAuth).mockReturnValue({ can: () => false } as any)
    renderEntry()
    expect(screen.queryByRole('button', { name: /Cộng 1 điểm/ })).toBeNull()
  })
})
