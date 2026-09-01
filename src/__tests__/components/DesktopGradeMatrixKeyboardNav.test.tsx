import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DesktopGradeMatrix } from '../../components/desktop/DesktopGradeMatrix'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useFilterStore } from '../../stores/filterStore'
import { useAuth } from '../../hooks/useAuth'

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../../hooks/useSemesterAccess', () => ({
  useSemesterAccess: () => ({ restricted: false, openSemester: 1 }),
}))

describe('DesktopGradeMatrix 2D Keyboard Navigation & Accessibility', () => {
  const mockStudents = [
    { id: 'st-01', code: 'TN01', holyName: 'Giuse', fullName: 'Nguyễn Văn A', classId: 'cl-01', status: 'Đang học', gender: 'Nam', dateOfBirth: '2015-01-01' },
    { id: 'st-02', code: 'TN02', holyName: 'Maria', fullName: 'Trần Thị B', classId: 'cl-01', status: 'Đang học', gender: 'Nữ', dateOfBirth: '2015-02-02' },
  ]

  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      can: (...roles: string[]) => roles.some(r => r === 'admin' || r === 'chunhiem'),
      role: 'admin',
      user: { id: 'u1', username: 'admin', role: 'admin', fullName: 'Admin' },
    } as any)

    useStudentStore.setState({
      students: mockStudents as any,
    })

    useGradeStore.setState({
      grades: [
        { id: 'g-01', studentId: 'st-01', academicYear: '2025-2026', semester: 1, scoreOral: 8, score15m: 9 },
      ] as any,
      batchSaveGrades: vi.fn().mockResolvedValue({ success: true, count: 1 }),
    })

    useFilterStore.setState({
      selectedClassId: 'cl-01',
      selectedSemester: 1,
    })
  })

  it('renders matrix input cells with data-matrix-row and data-matrix-col coordinates', () => {
    render(<DesktopGradeMatrix />)

    const inputs = screen.getAllByRole('textbox', { name: /Nhập điểm/i })
    expect(inputs.length).toBeGreaterThanOrEqual(12) // 2 students x 6 score fields

    const firstCell = inputs[0]
    expect(firstCell).toHaveAttribute('data-matrix-cell', 'true')
    expect(firstCell).toHaveAttribute('data-matrix-row', '0')
    expect(firstCell).toHaveAttribute('data-matrix-col', '0')
  })

  it('navigates to the next student same column on ArrowDown', () => {
    render(<DesktopGradeMatrix />)

    const cellRow0Col0 = document.querySelector<HTMLInputElement>(
      'input[data-matrix-row="0"][data-matrix-col="0"]'
    )
    const cellRow1Col0 = document.querySelector<HTMLInputElement>(
      'input[data-matrix-row="1"][data-matrix-col="0"]'
    )

    expect(cellRow0Col0).not.toBeNull()
    expect(cellRow1Col0).not.toBeNull()

    cellRow0Col0?.focus()
    expect(document.activeElement).toBe(cellRow0Col0)

    fireEvent.keyDown(cellRow0Col0!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(cellRow1Col0)
  })

  it('navigates to the previous student same column on ArrowUp', () => {
    render(<DesktopGradeMatrix />)

    const cellRow0Col0 = document.querySelector<HTMLInputElement>(
      'input[data-matrix-row="0"][data-matrix-col="0"]'
    )
    const cellRow1Col0 = document.querySelector<HTMLInputElement>(
      'input[data-matrix-row="1"][data-matrix-col="0"]'
    )

    cellRow1Col0?.focus()
    expect(document.activeElement).toBe(cellRow1Col0)

    fireEvent.keyDown(cellRow1Col0!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(cellRow0Col0)
  })

  it('clamps invalid score entries to range [0, 10] on blur', () => {
    render(<DesktopGradeMatrix />)

    const cell = document.querySelector<HTMLInputElement>(
      'input[data-matrix-row="0"][data-matrix-col="0"]'
    )!

    cell.value = '15.5'
    fireEvent.blur(cell)

    expect(cell.value).toBe('10')
  })

  it('renders accessible live region for screen readers', () => {
    render(<DesktopGradeMatrix />)

    const liveRegion = document.querySelector('[aria-live="polite"]')
    expect(liveRegion).not.toBeNull()
    expect(liveRegion).toHaveClass('sr-only')
  })
})
