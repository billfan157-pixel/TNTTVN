import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ExamSessionView } from '../../components/exam/ExamSessionView'
import { useExamStore } from '../../stores/examStore'
import { useClassStore } from '../../stores/classStore'
import { useFilterStore } from '../../stores/filterStore'
import { useStudentStore } from '../../stores/studentStore'
import { api } from '../../lib/api'
import { setTenantScope } from '../../lib/tenantScope'
import type { ExamSession } from '../../types'

const view = vi.hoisted(() => ({ mode: 'desktop', canGrade: true }))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ can: () => view.canGrade, isAdmin: true }) }))
vi.mock('../../hooks/useEffectiveMode', () => ({ useEffectiveMode: () => view.mode }))
vi.mock('../../components/exam/GuidedGradeModal', () => ({
  GuidedGradeModal: () => <div role="dialog" aria-label="Chấm từng thiếu nhi" />,
}))
vi.mock('../../components/exam/ExamScanModal', () => ({
  ExamScanModal: () => <div role="dialog" aria-label="Camera QR và OMR" />,
}))
vi.mock('../../components/exam/ExamBatchScanModal', () => ({
  ExamBatchScanModal: () => <div role="dialog" aria-label="Nhập nhiều ảnh để chấm" />,
}))

const session: ExamSession = {
  id: 'EXS-actions', parishId: 'actions-parish', classId: 'actions-class', subject: 'Kiểm tra giáo lý',
  scoreType: '15m', maxScore: 10, semester: 1, academicYear: '2026-2027', status: 'draft',
  createdBy: 'actions-admin', createdAt: '2026-10-01T00:00:00Z', examType: 'multiple_choice',
  questionCount: 2, answerKey: { 1: 'B', 2: 'D' }, definitionHash: 'a'.repeat(64),
}

beforeEach(() => {
  vi.restoreAllMocks()
  view.mode = 'desktop'
  view.canGrade = true
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  setTenantScope({ userId: 'actions-admin', parishId: session.parishId })
  useClassStore.setState({ loading: false, classes: [{
    id: session.classId, name: 'Lớp thử', code: 'ACT', branchId: 'AuNhi', branchName: 'Ấu Nhi',
    academicYear: session.academicYear, academicYearId: session.academicYear, parishId: session.parishId,
    room: null, homeroomTeacher: null, assistants: [], studentCount: 1,
    createdAt: session.createdAt, updatedAt: session.createdAt, updatedBy: null,
  }] })
  useStudentStore.setState({ students: [{
    id: 'actions-student', classId: session.classId, code: 'TN001', fullName: 'Thiếu nhi thử', holyName: 'Giuse',
    status: 'Đang học', gender: 'Nam', dateOfBirth: '2015-01-01', branch: 'AuNhi',
    parentName: '', parentPhone: '', address: '',
  }] })
  useFilterStore.setState({ selectedClassId: 'all', selectedSemester: 1 })
  useExamStore.setState({ sessions: [session], selectedSessionId: session.id, results: [], cachedResultsBySession: {}, queuedResultMutations: {}, saving: false, finalizing: false, editingDefinition: false, loading: false, error: null })
  vi.spyOn(api, 'getMyExamSessions').mockResolvedValue([session])
  vi.spyOn(api, 'getExamResults').mockResolvedValue({ session, results: [] })
})

afterEach(() => {
  cleanup()
  setTenantScope(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('exam grading actions', () => {
  it.each([
    ['Chấm Ổn Định', 'Chấm từng thiếu nhi'],
    ['Quét QR + OMR', 'Camera QR và OMR'],
    ['Chấm Nhiều Ảnh', 'Nhập nhiều ảnh để chấm'],
  ])('opens %s from one chooser and dismisses the chooser', async (label, target) => {
    render(<ExamSessionView />)
    expect(screen.queryByRole('button', { name: new RegExp(label.replace('+', '\\+')) })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quét / Chấm bài' }))
    const chooser = screen.getByRole('dialog', { name: 'Chọn cách chấm bài' })
    fireEvent.click(within(chooser).getByRole('button', { name: new RegExp(label.replace('+', '\\+')) }))
    expect(await screen.findByRole('dialog', { name: target })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Chọn cách chấm bài' })).not.toBeInTheDocument()
  })

  it('preserves the empty-roster and written-exam restrictions inside the chooser', () => {
    useStudentStore.setState({ students: [] })
    useExamStore.setState({ sessions: [{ ...session, examType: 'written' }] })
    render(<ExamSessionView />)
    fireEvent.click(screen.getByRole('button', { name: 'Quét / Chấm bài' }))
    const chooser = screen.getByRole('dialog', { name: 'Chọn cách chấm bài' })
    expect(within(chooser).getByRole('button', { name: /Chấm Ổn Định/ })).toBeDisabled()
    expect(within(chooser).getByRole('button', { name: /Quét QR/ })).toBeEnabled()
    expect(within(chooser).queryByRole('button', { name: /Chấm Nhiều Ảnh/ })).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(['completed', 'read-only'])('hides grading entry points for %s sessions', (mode) => {
    if (mode === 'completed') useExamStore.setState({ sessions: [{ ...session, status: 'completed' }] })
    else view.canGrade = false
    render(<ExamSessionView />)
    expect(screen.queryByRole('button', { name: 'Quét / Chấm bài' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Chấm Nhiều Ảnh/ })).not.toBeInTheDocument()
  })

  it('shows the standard answer key and regrade action inside the mobile paper viewer, even without imported questions', async () => {
    view.mode = 'mobile'
    const rescore = vi.spyOn(api, 'updateAnswerKey')
    render(<ExamSessionView />)
    expect(screen.queryByRole('button', { name: 'Đáp Án' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xem Đề Thi' }))
    const paper = await screen.findByRole('dialog', { name: 'Xem Đề Thi & Tài Liệu' }, { timeout: 10_000 })
    fireEvent.click(within(paper).getByRole('button', { name: 'Đáp án' }))
    expect(within(paper).getByRole('heading', { name: 'Đáp án chuẩn' })).toBeInTheDocument()
    expect(within(paper).getByText('Câu 1:').parentElement).toHaveTextContent('B')
    expect(within(paper).getByText('Câu 2:').parentElement).toHaveTextContent('D')
    fireEvent.click(within(paper).getByRole('button', { name: 'Chấm Lại Điểm' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Chấm lại điểm?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Hủy' }))
    expect(rescore).not.toHaveBeenCalled()
    fireEvent.click(within(paper).getByRole('button', { name: 'Đọc Đề' }))
    expect(within(paper).queryByRole('heading', { name: 'Đáp án chuẩn' })).not.toBeInTheDocument()
    expect(within(paper).getByText('Chưa có nội dung câu hỏi trích xuất')).toBeInTheDocument()
  }, 15_000)

  it('keeps the desktop answer-key entry point', () => {
    render(<ExamSessionView />)
    fireEvent.click(screen.getByRole('button', { name: 'Đáp Án' }))
    const answers = screen.getByRole('dialog', { name: 'Đáp Án Chuẩn — Kiểm tra giáo lý' })
    expect(within(answers).getByText('Câu 1:').parentElement).toHaveTextContent('B')
  })
})
