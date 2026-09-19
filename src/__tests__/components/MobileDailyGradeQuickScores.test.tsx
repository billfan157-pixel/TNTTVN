import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MobileDailyGradeEntry } from '../../components/mobile/MobileDailyGradeEntry'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useDailyGradeStore } from '../../stores/dailyGradeStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import { useAuth } from '../../hooks/useAuth'
import { useToastStore } from '../../stores/toastStore'

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../../hooks/useSemesterAccess', () => ({
  useSemesterAccess: () => ({ restricted: false, openSemester: 1 }),
}))

describe('MobileDailyGradeEntry Quick Scores & Accessibility', () => {
  const mockStudent = {
    id: 'st-01',
    code: 'TN01',
    holyName: 'Maria',
    fullName: 'Nguyễn Thị Hoa',
    classId: 'cl-01',
    status: 'Đang học',
    gender: 'Nữ',
    dateOfBirth: '2015-05-05',
  }

  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      can: () => true,
      role: 'chunhiem',
      user: { id: 'u1', username: 'glv', role: 'chunhiem', fullName: 'Giáo Lý Viên' },
    } as any)

    useStudentStore.setState({
      students: [mockStudent as any],
    })

    useClassStore.setState({
      classes: [{ id: 'cl-01', name: 'Khai Tâm 1' }] as any,
    })

    useDailyGradeStore.setState({
      entries: [],
      addEntry: vi.fn(),
      removeEntry: vi.fn(),
      getAverageForStudent: () => null,
      getEntriesForStudent: () => [],
    })

    useGradeStore.setState({
      getStudentGrade: () => undefined,
    })

    useFilterStore.setState({
      selectedClassId: 'cl-01',
      selectedSemester: 1,
    })
  })

  it('renders student card and expands on tap', () => {
    render(<MobileDailyGradeEntry onViewReport={vi.fn()} />)

    expect(screen.getByText('Nguyễn Thị Hoa')).toBeInTheDocument()

    const cardButton = screen.getByRole('button', { name: /Nguyễn Thị Hoa/i })
    expect(cardButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(cardButton)
    expect(cardButton).toHaveAttribute('aria-expanded', 'true')

    // Quick 1-tap pills should appear (10, 9, 8, 7, 6, 5)
    expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '9' })).toBeInTheDocument()
  })

  it('retains input and shows no success while admission is pending or rejected', async () => {
    let reject!: (error: Error) => void
    const pending = new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise })
    const addEntry = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(undefined)
    useDailyGradeStore.setState({ addEntry })
    const toast = vi.spyOn(useToastStore.getState(), 'addToast')
    render(<MobileDailyGradeEntry onViewReport={vi.fn()} />)
    const card = screen.getByRole('button', { name: /Nguyễn Thị Hoa/i })
    fireEvent.click(card)
    const input = screen.getByPlaceholderText('Nhập 0–10...')
    fireEvent.change(input, { target: { value: '8.5' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(addEntry).toHaveBeenCalledTimes(1)
    expect(input).toHaveValue('8.5')
    expect(card).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByText(/Đã thêm .*8.5/)).not.toBeInTheDocument()
    await act(async () => { reject(new Error('Synthetic quota failure')); await Promise.resolve() })
    expect(input).toHaveValue('8.5')
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/Chưa lưu được điểm/), 'error')
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(input).toHaveValue(''))
    expect(addEntry).toHaveBeenCalledTimes(2)
    toast.mockRestore()
  })

  it('adds score when 1-tap quick pill is clicked', () => {
    const addEntryMock = vi.fn()
    useDailyGradeStore.setState({ addEntry: addEntryMock })

    render(<MobileDailyGradeEntry onViewReport={vi.fn()} />)

    const cardButton = screen.getByRole('button', { name: /Nguyễn Thị Hoa/i })
    fireEvent.click(cardButton)

    const pill10 = screen.getByRole('button', { name: '10' })
    fireEvent.click(pill10)

    expect(addEntryMock).toHaveBeenCalledWith('st-01', 'oral', 10, 1)
  })

  it('contains accessible live region announcing grade additions', () => {
    render(<MobileDailyGradeEntry onViewReport={vi.fn()} />)

    const liveRegion = document.querySelector('[aria-live="polite"]')
    expect(liveRegion).not.toBeNull()
    expect(liveRegion).toHaveClass('sr-only')
  })

  it('auto-advances to the next student accordion sequentially upon grading', async () => {
    const mockStudent2 = {
      id: 'st-02',
      code: 'TN02',
      holyName: 'Giuse',
      fullName: 'Trần Văn Nam',
      classId: 'cl-01',
      status: 'Đang học',
      gender: 'Nam',
      dateOfBirth: '2015-06-06',
    }
    useStudentStore.setState({
      students: [mockStudent as any, mockStudent2 as any],
    })
    const addEntryMock = vi.fn()
    useDailyGradeStore.setState({ addEntry: addEntryMock })

    render(<MobileDailyGradeEntry onViewReport={vi.fn()} />)

    const cardButton1 = screen.getByRole('button', { name: /Nguyễn Thị Hoa/i })
    const cardButton2 = screen.getByRole('button', { name: /Trần Văn Nam/i })

    expect(cardButton1).toHaveAttribute('aria-expanded', 'false')
    expect(cardButton2).toHaveAttribute('aria-expanded', 'false')

    // Open first student
    fireEvent.click(cardButton1)
    expect(cardButton1).toHaveAttribute('aria-expanded', 'true')

    // Click quick pill 8
    const pill8 = screen.getByRole('button', { name: '8' })
    fireEvent.click(pill8)

    // The durable admission is asynchronous: the component awaits the store
    // acknowledgement before haptics/announcement/auto-advance, so assert the
    // post-acknowledgement DOM instead of the pre-await snapshot.
    await waitFor(() => {
      expect(addEntryMock).toHaveBeenCalledWith('st-01', 'oral', 8, 1)
      // Auto-advance should collapse student 1 and expand student 2
      expect(cardButton1).toHaveAttribute('aria-expanded', 'false')
      expect(cardButton2).toHaveAttribute('aria-expanded', 'true')
    })
  })

  it('allows disabling auto-advance via the toggle button', () => {
    const mockStudent2 = {
      id: 'st-02',
      code: 'TN02',
      holyName: 'Giuse',
      fullName: 'Trần Văn Nam',
      classId: 'cl-01',
      status: 'Đang học',
      gender: 'Nam',
      dateOfBirth: '2015-06-06',
    }
    useStudentStore.setState({
      students: [mockStudent as any, mockStudent2 as any],
    })
    const addEntryMock = vi.fn()
    useDailyGradeStore.setState({ addEntry: addEntryMock })

    render(<MobileDailyGradeEntry onViewReport={vi.fn()} />)

    // Toggle auto-advance off
    const toggleBtn = screen.getByRole('button', { name: /Tự chuyển em kế tiếp/i })
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(toggleBtn)
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'false')

    const cardButton1 = screen.getByRole('button', { name: /Nguyễn Thị Hoa/i })
    const cardButton2 = screen.getByRole('button', { name: /Trần Văn Nam/i })

    // Open first student
    fireEvent.click(cardButton1)
    expect(cardButton1).toHaveAttribute('aria-expanded', 'true')

    // Grade student 1
    const pill7 = screen.getByRole('button', { name: '7' })
    fireEvent.click(pill7)

    expect(addEntryMock).toHaveBeenCalledWith('st-01', 'oral', 7, 1)

    // Student 1 stays expanded, student 2 remains collapsed
    expect(cardButton1).toHaveAttribute('aria-expanded', 'true')
    expect(cardButton2).toHaveAttribute('aria-expanded', 'false')
  })
})

