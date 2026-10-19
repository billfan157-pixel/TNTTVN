import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MobileConductEntry } from '../../components/mobile/MobileConductEntry'
import { useDailyGradeStore } from '../../stores/dailyGradeStore'
import { useGradeStore } from '../../stores/gradeStore'
import type { Student } from '../../types'

const student = { id: 'conduct-student', fullName: 'Nguyễn An', holyName: 'Maria' } as Student
const props = { students: [student], semester: 1 as const, academicYear: '2026-2027', canEdit: true }

describe('Mobile conduct deductions', () => {
  beforeEach(() => {
    useDailyGradeStore.setState({ conductEntries: [], addConductDeduction: vi.fn().mockResolvedValue(undefined) })
    useGradeStore.setState({ grades: [] })
  })

  it.each([[0.5, '0,5'], [1, '1'], [2, '2']])('requires a reason for a %s deduction and preserves its amount', async (value, label) => {
    render(<MobileConductEntry {...props} />)
    expect(screen.getByLabelText('Điểm đạo đức của Nguyễn An')).toHaveTextContent('10 / 10')
    fireEvent.click(screen.getByRole('button', { name: `−${label} đ` }))
    const save = screen.getByRole('button', { name: 'Lưu lần trừ' })
    expect(save).toBeDisabled()
    const reason = screen.getByRole('textbox')
    fireEvent.change(reason, { target: { value: '   ' } })
    expect(save).toBeDisabled()
    fireEvent.change(reason, { target: { value: 'Nói chuyện trong giờ học' } })
    fireEvent.click(save)
    await waitFor(() => expect(useDailyGradeStore.getState().addConductDeduction).toHaveBeenCalledWith(student.id, value, 'Nói chuyện trong giờ học', 1))
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
  })

  it('preserves an existing zero, blocks negative scores, and shows scoped history', () => {
    useGradeStore.setState({ grades: [{ studentId: student.id, semester: 1, academicYear: '2026-2027', scoreDaoDuc: 0 }] as any })
    useDailyGradeStore.setState({ conductEntries: [
      { id: 'a', studentId: student.id, academicYear: '2026-2027', semester: 1, scoreType: 'conduct', value: 2, reason: 'Lý do học kỳ này', date: '2026-10-19', createdAt: '2026-10-19' },
      { id: 'b', studentId: student.id, academicYear: '2026-2027', semester: 2, scoreType: 'conduct', value: 1, reason: 'Lý do học kỳ khác', date: '2026-10-19', createdAt: '2026-10-19' },
    ] })
    render(<MobileConductEntry {...props} />)
    expect(screen.getByLabelText('Điểm đạo đức của Nguyễn An')).toHaveTextContent('0 / 10')
    expect(screen.getByRole('button', { name: '−0,5 đ' })).toBeDisabled()
    expect(screen.getByText('Lý do học kỳ này')).toBeInTheDocument()
    expect(screen.queryByText('Lý do học kỳ khác')).not.toBeInTheDocument()
  })

  it('shows the pending preview without subtracting confirmed deductions twice', () => {
    useGradeStore.setState({ grades: [{ studentId: student.id, semester: 1, academicYear: '2026-2027', scoreDaoDuc: 9, updatedAt: '2026-10-19T11:00:00Z' }] as any })
    useDailyGradeStore.setState({ conductEntries: [
      { id: 'a', studentId: student.id, academicYear: '2026-2027', semester: 1, scoreType: 'conduct', value: 1, reason: 'Đã đồng bộ', afterScore: 9, date: '2026-10-19', createdAt: '2026-10-19T10:00:00Z', pending: false },
      { id: 'b', studentId: student.id, academicYear: '2026-2027', semester: 1, scoreType: 'conduct', value: 0.5, reason: 'Đang chờ', date: '2026-10-19', createdAt: '2026-10-19T12:00:00Z', pending: true },
    ] })
    render(<MobileConductEntry {...props} />)
    expect(screen.getByLabelText('Điểm đạo đức của Nguyễn An')).toHaveTextContent('8,5 / 10')
  })

  it('retains the reason when durable saving fails and permits retry', async () => {
    const add = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined)
    useDailyGradeStore.setState({ addConductDeduction: add })
    render(<MobileConductEntry {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '−1 đ' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Vi phạm nội quy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu lần trừ' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu lần trừ' })).toBeEnabled())
    expect(screen.getByRole('textbox')).toHaveValue('Vi phạm nội quy')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu lần trừ' }))
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
    expect(add).toHaveBeenCalledTimes(2)
  })

  it('lets a read-only user inspect history without deduction buttons', () => {
    render(<MobileConductEntry {...props} canEdit={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
