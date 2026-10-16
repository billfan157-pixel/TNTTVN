import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { DesktopGradeMatrix } from '../../components/desktop/DesktopGradeMatrix'
import { useStudentStore } from '../../stores/studentStore'
import { useGradeStore } from '../../stores/gradeStore'
import { useFilterStore } from '../../stores/filterStore'
import { useAuth } from '../../hooks/useAuth'
import { useSyncStore } from '../../stores/syncStore'
import { useAcademicYearStore } from '../../stores/academicYearStore'

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
    useAcademicYearStore.setState({ currentYear: '2025-2026' })
  })

  function seedLargeMatrix() {
    const students = Array.from({ length: 121 }, (_, index) => ({
      ...mockStudents[0], id: `large-${index}`, fullName: `Học sinh ${String(index).padStart(3, '0')}`,
    }))
    useStudentStore.setState({ students: students as any })
    useGradeStore.setState({ grades: students.flatMap(student => [
      { id: `old-${student.id}`, studentId: student.id, academicYear: '2024-2025', semester: 1, scoreOral: 2 },
      { id: `hk2-${student.id}`, studentId: student.id, academicYear: '2025-2026', semester: 2, scoreOral: 3 },
      { id: `current-${student.id}`, studentId: student.id, academicYear: '2025 - 2026', semester: 1, scoreOral: 8, scoreFinal: 7, version: 4 },
    ]) as any })
  }

  it('renders matrix input cells with data-matrix-row and data-matrix-col coordinates', () => {
    render(<DesktopGradeMatrix />)

    const inputs = screen.getAllByLabelText(/Nhập điểm/i)
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

  it('merges hydrated grades without replacing a locally edited score', () => {
    useGradeStore.setState({ grades: [] })
    render(<DesktopGradeMatrix />)
    const cell = screen.getByLabelText('Nhập điểm miệng cho Giuse Nguyễn Văn A')
    expect(cell).toHaveValue('')
    act(() => {
      useGradeStore.setState({ grades: [{ id: 'hydrated', studentId: 'st-01', academicYear: '2025 - 2026', semester: 1, scoreOral: 8 }] as any })
    })
    expect(cell).toHaveValue('8')
    fireEvent.input(cell, { target: { value: '9.4' } })
    fireEvent.blur(cell)
    act(() => {
      useGradeStore.setState({ grades: [{ id: 'hydrated', studentId: 'st-01', academicYear: '2025-2026', semester: 1, scoreOral: 7 }] as any })
    })
    expect(cell).toHaveValue('9.4')
  })

  it('preserves the focused unblurred cell across an unrelated background-store rerender', () => {
    render(<DesktopGradeMatrix />)
    const cell = document.querySelector<HTMLInputElement>(
      'input[data-matrix-row="0"][data-matrix-col="0"]'
    )!

    cell.focus()
    fireEvent.input(cell, { target: { value: '9.7' } })
    act(() => { useSyncStore.setState({ pendingCount: 4 }) })

    const currentCell = document.querySelector<HTMLInputElement>(
      'input[data-matrix-row="0"][data-matrix-col="0"]'
    )!
    expect(currentCell).toBe(cell)
    expect(currentCell.value).toBe('9.7')
    expect(document.activeElement).toBe(currentCell)
  })

  it('keeps the draft and restores the active class when durable enqueue fails during a context switch', async () => {
    const batchSaveGrades = vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'))
    useGradeStore.setState({ batchSaveGrades })
    render(<DesktopGradeMatrix />)

    const cell = document.querySelector<HTMLInputElement>(
      'input[data-matrix-row="0"][data-matrix-col="0"]'
    )!
    fireEvent.input(cell, { target: { value: '9.4' } })
    fireEvent.blur(cell)

    act(() => {
      useFilterStore.getState().setSelectedClassId('cl-02')
    })

    await waitFor(() => {
      expect(batchSaveGrades).toHaveBeenCalled()
      expect(useFilterStore.getState().selectedClassId).toBe('cl-01')
    })

    const restoredCell = document.querySelector<HTMLInputElement>(
      'input[data-matrix-row="0"][data-matrix-col="0"]'
    )!
    expect(restoredCell.value).toBe('9.4')
    expect(screen.getByText(/Bản nháp vẫn còn trên màn hình/i)).toBeInTheDocument()
    const saved = batchSaveGrades.mock.calls[0][0][0]
    expect(saved).toMatchObject({ studentId: 'st-01', scoreOral: 9.4, scoreOral_source: 'manual' })
    expect(saved).not.toHaveProperty('score15m')
  })

  it('uses the acknowledged score when switching from all classes into the edited student class', async () => {
    useFilterStore.setState({ selectedClassId: 'all' })
    useGradeStore.setState({ batchSaveGrades: vi.fn(async (records: Parameters<ReturnType<typeof useGradeStore.getState>['batchSaveGrades']>[0]) => {
      const grades = useGradeStore.getState().grades
      useGradeStore.setState({ grades: grades.map(grade => ({ ...grade, ...records.find(record => record.studentId === grade.studentId) })) })
    }) })
    render(<DesktopGradeMatrix />)
    const cell = screen.getByLabelText('Nhập điểm miệng cho Giuse Nguyễn Văn A')
    fireEvent.input(cell, { target: { value: '9.4' } })
    fireEvent.blur(cell)
    act(() => { useFilterStore.getState().setSelectedClassId('cl-01') })
    await waitFor(() => expect(within(cell.closest('tr')!).getByText('9.2')).toBeInTheDocument())
  })

  it('bounds mounted inputs for a large roster while every student remains reachable with the correct year and semester', () => {
    seedLargeMatrix()
    const { container } = render(<DesktopGradeMatrix />)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(50)
    expect(container.querySelectorAll('[data-matrix-cell]')).toHaveLength(300)
    const pager = within(screen.getByLabelText('Phân trang bảng điểm'))
    expect(screen.getByLabelText('Nhập điểm miệng cho Giuse Học sinh 000')).toHaveValue('8')
    expect(pager.getByRole('button', { name: 'Trang trước' })).toBeDisabled()

    fireEvent.click(pager.getByRole('button', { name: 'Trang sau' }))
    expect(screen.queryByLabelText('Nhập điểm miệng cho Giuse Học sinh 000')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nhập điểm miệng cho Giuse Học sinh 050')).toHaveValue('8')
    fireEvent.click(pager.getByRole('button', { name: 'Trang sau' }))
    expect(container.querySelectorAll('tbody tr')).toHaveLength(21)
    expect(screen.getByLabelText('Nhập điểm miệng cho Giuse Học sinh 120')).toHaveValue('8')
    expect(pager.getByRole('button', { name: 'Trang sau' })).toBeDisabled()
  }, 15_000)

  it('commits an unblurred score and carries ArrowDown/ArrowUp focus across page boundaries', async () => {
    seedLargeMatrix()
    render(<DesktopGradeMatrix />)
    const lastCell = screen.getByLabelText('Nhập điểm miệng cho Giuse Học sinh 049')
    lastCell.focus()
    fireEvent.input(lastCell, { target: { value: '9.4' } })
    fireEvent.keyDown(lastCell, { key: 'ArrowDown' })

    const nextCell = await screen.findByLabelText('Nhập điểm miệng cho Giuse Học sinh 050')
    await waitFor(() => expect(document.activeElement).toBe(nextCell))
    fireEvent.keyDown(nextCell, { key: 'ArrowUp' })
    const restoredCell = await screen.findByLabelText('Nhập điểm miệng cho Giuse Học sinh 049')
    await waitFor(() => expect(document.activeElement).toBe(restoredCell))
    expect(restoredCell).toHaveValue('9.4')
  }, 15_000)

  it('keeps drafts from multiple pages and flushes only those edited fields on unmount', async () => {
    seedLargeMatrix()
    const batchSaveGrades = vi.fn().mockResolvedValue(undefined)
    useGradeStore.setState({ batchSaveGrades })
    const { unmount } = render(<DesktopGradeMatrix />)
    const first = screen.getByLabelText('Nhập điểm miệng cho Giuse Học sinh 000')
    fireEvent.input(first, { target: { value: '9.4' } })
    fireEvent.blur(first)
    fireEvent.click(within(screen.getByLabelText('Phân trang bảng điểm')).getByRole('button', { name: 'Trang sau' }))
    const next = screen.getByLabelText('Nhập điểm miệng cho Giuse Học sinh 050')
    fireEvent.input(next, { target: { value: '9.1' } })
    fireEvent.blur(next)
    unmount()

    await waitFor(() => expect(batchSaveGrades).toHaveBeenCalled())
    const saved = batchSaveGrades.mock.calls.flatMap(call => call[0])
    expect(saved).toEqual(expect.arrayContaining([
      expect.objectContaining({ studentId: 'large-0', scoreOral: 9.4, scoreOral_source: 'manual', version: 4 }),
      expect.objectContaining({ studentId: 'large-50', scoreOral: 9.1, scoreOral_source: 'manual', version: 4 }),
    ]))
    expect(new Set(saved.map(row => row.studentId))).toEqual(new Set(['large-0', 'large-50']))
    expect(saved.every(row => !Object.hasOwn(row, 'scoreFinal'))).toBe(true)
  }, 15_000)

  it('keeps the current page and focused input through background sync and clamps a smaller roster', () => {
    seedLargeMatrix()
    const { container } = render(<DesktopGradeMatrix />)
    fireEvent.click(within(screen.getByLabelText('Phân trang bảng điểm')).getByRole('button', { name: 'Trang sau' }))
    const cell = screen.getByLabelText('Nhập điểm miệng cho Giuse Học sinh 050')
    cell.focus()
    fireEvent.input(cell, { target: { value: '9.7' } })
    act(() => { useSyncStore.setState({ pendingCount: 4 }) })
    expect(document.activeElement).toBe(cell)
    expect(cell).toHaveValue('9.7')

    act(() => { useStudentStore.setState({ students: useStudentStore.getState().students.slice(0, 10) }) })
    expect(container.querySelectorAll('tbody tr')).toHaveLength(10)
    expect(screen.getByLabelText('Nhập điểm miệng cho Giuse Học sinh 000')).toHaveValue('8')
  }, 15_000)
})
