import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MobileDailyGradeEntry } from '../../components/mobile/MobileDailyGradeEntry'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useDailyGradeStore } from '../../stores/dailyGradeStore'
import { useFilterStore } from '../../stores/filterStore'
import { useClassStore } from '../../stores/classStore'
import { useAuth } from '../../hooks/useAuth'

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
})
