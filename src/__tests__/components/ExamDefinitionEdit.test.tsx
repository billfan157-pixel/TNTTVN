import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ExamSessionView } from '../../components/exam/ExamSessionView'
import { useExamStore } from '../../stores/examStore'
import { useClassStore } from '../../stores/classStore'
import { useFilterStore } from '../../stores/filterStore'
import { useStudentStore } from '../../stores/studentStore'
import { api } from '../../lib/api'
import { getDB } from '../../lib/db'
import { setTenantScope } from '../../lib/tenantScope'
import type { ExamSession } from '../../types'

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ can: () => true, isAdmin: true }) }))
vi.mock('../../hooks/useEffectiveMode', () => ({ useEffectiveMode: () => 'desktop' }))

const owner = { userId: 'edit-ui-admin', parishId: 'edit-ui-parish' }
const session: ExamSession = {
  id: 'EXS-edit-ui', parishId: owner.parishId, classId: 'edit-ui-class', subject: 'Đề đang có',
  scoreType: '15m', maxScore: 10, semester: 1, academicYear: '2026-2027', status: 'draft',
  createdBy: owner.userId, createdAt: '2026-10-01T00:00:00Z', examType: 'multiple_choice',
  questionCount: 1, answerKey: { 1: 'A' }, definitionHash: 'a'.repeat(64),
  questions: [{ index: 1, type: 'multiple_choice', question: 'Câu ban đầu', options: { A: 'Một', B: 'Hai', C: 'Ba', D: 'Bốn' }, correctOption: 'A', points: 10 }],
}

beforeEach(async () => {
  vi.restoreAllMocks()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  setTenantScope(owner)
  localStorage.setItem('parish_current_user', JSON.stringify({ id: owner.userId, parishId: owner.parishId }))
  await getDB().syncQueue.clear()
  useClassStore.setState({ loading: false, classes: [{ id: session.classId, name: 'Lớp thử', code: 'EDIT', branch: 'AuNhi', academicYearId: session.academicYear } as any] })
  useStudentStore.setState({ students: [] })
  useFilterStore.setState({ selectedClassId: 'all', selectedSemester: 2 })
  useExamStore.setState({ sessions: [session], selectedSessionId: session.id, results: [], cachedResultsBySession: {}, queuedResultMutations: {}, saving: false, finalizing: false, editingDefinition: false, loading: false, error: null })
  vi.spyOn(api, 'getMyExamSessions').mockResolvedValue([session])
  vi.spyOn(api, 'getExamResults').mockResolvedValue({ session, results: [] })
  vi.spyOn(api, 'getExamEditContext').mockResolvedValue({ session, definitionHash: session.definitionHash! })
})
afterEach(async () => {
  cleanup()
  await getDB().syncQueue.clear()
  setTenantScope(null)
  localStorage.removeItem('parish_current_user')
  vi.restoreAllMocks()
})

describe('editing an ungraded exam from its workspace', () => {
  it('creates a keys-only exam without requiring an imported file and preserves answers when the selected type is clicked again', async () => {
    const create = vi.spyOn(api, 'createExam').mockResolvedValue({ ...session, id: 'EXS-new-ui', subject: 'Đề mới' })
    render(<ExamSessionView />)
    fireEvent.click(screen.getByRole('button', { name: 'Danh sách phiên' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo Phiên Chấm' }))
    const dialog = await screen.findByRole('dialog', { name: 'Tạo Phiên Chấm' })
    expect(within(dialog).getByRole('button', { name: 'Tạo Phiên' })).toBeDisabled()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Môn hoặc nội dung kiểm tra' }), { target: { value: 'Đề mới' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Trắc nghiệm/ }))
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Số câu hỏi trắc nghiệm' }), { target: { value: '2' } })
    expect(within(dialog).getByRole('button', { name: 'Tạo Phiên' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Toàn A' }))
    fireEvent.click(within(dialog).getByRole('button', { name: /Trắc nghiệm/ }))
    expect(within(dialog).getByRole('button', { name: 'Tạo Phiên' })).toBeEnabled()
    expect(within(dialog).getAllByText(/Sẵn sàng tạo phiên chấm/)).toHaveLength(2)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo Phiên' }))
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create.mock.calls[0][0]).toMatchObject({ subject: 'Đề mới', questionCount: 2, answerKey: '{"1":"A","2":"A"}', semester: 2 })
  })

  it('lets the user cancel a type change that would discard existing answers', async () => {
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    const editor = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    fireEvent.click(within(editor).getByRole('button', { name: /^Tự luận/ }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Đổi hình thức bài kiểm tra?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Hủy' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(within(editor).getByRole('button', { name: /Trắc nghiệm/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(editor).getByRole('button', { name: 'Câu 1, đáp án A' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('prefills the editor, saves into the same session and keeps its original semester', async () => {
    const update = vi.spyOn(api, 'updateExamDefinition').mockImplementation(async (_id, data) => ({ ...session, ...data, definitionHash: 'b'.repeat(64) }))
    const create = vi.spyOn(api, 'createExam')
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    expect(within(dialog).getByDisplayValue('Đề đang có')).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: 'Lớp học cho phiên chấm' })).toBeDisabled()
    fireEvent.click(within(dialog).getByText('Câu 1 · Câu ban đầu'))
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Câu 1 (Trắc nghiệm)' }), { target: { value: 'Nội dung đã sửa' } })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Phương án B · Câu 1' }), { target: { value: 'Phương án mới' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Câu 1, đáp án B' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu đề thi' }))
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    const [id, payload] = update.mock.calls[0]
    expect(id).toBe(session.id)
    expect(payload).toMatchObject({ semester: 1, academicYear: session.academicYear, classId: session.classId, answerKey: '{"1":"B"}', expectedDefinitionHash: session.definitionHash })
    expect(JSON.parse(payload.questions!)[0]).toMatchObject({ question: 'Nội dung đã sửa', options: { B: 'Phương án mới' } })
    expect(create).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sửa đề thi' })).not.toBeInTheDocument())
  })

  it('keeps the unsaved editor and explains a server conflict', async () => {
    vi.spyOn(api, 'updateExamDefinition').mockRejectedValue(new Error('Phiên đã có hoạt động chấm bài; không thể sửa đề thi.'))
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu đề thi' }))
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('Phiên đã có hoạt động chấm bài'))
    expect(within(dialog).getByDisplayValue('Đề đang có')).toBeInTheDocument()
  })

  it('refuses offline editing and edits with a pending result command', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    expect(await useExamStore.getState().getEditContext(session.id)).toBeNull()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    useExamStore.setState({ queuedResultMutations: { pending: { clientMutationId: 'pending', queueOpId: 'op', sessionId: session.id, studentId: 'student', proposedScore: 8, status: 'pending', createdAt: '', updatedAt: '' } } })
    expect(await useExamStore.getState().updateDefinition(session.id, { classId: session.classId, subject: 'Sửa', scoreType: session.scoreType, semester: 1 }, session.definitionHash!)).toBeNull()
    expect(api.getExamEditContext).not.toHaveBeenCalled()
    expect(useExamStore.getState().editingDefinition).toBe(false)
  })

  it('binds result commands to the loaded definition and blocks grading while an edit is saving', async () => {
    const save = vi.spyOn(api, 'saveExamResults').mockResolvedValue({ saved: 1, upserted: 0, total: 1 })
    await useExamStore.getState().saveScores([{ studentId: 'student', score: 7, source: 'quick_entry' }])
    expect(save.mock.calls[0][1][0]).toMatchObject({ definitionHash: session.definitionHash })
    await useExamStore.getState().saveScores([{ studentId: 'student', score: 7, definitionHash: 'c'.repeat(64) }])
    expect(save.mock.calls[1][1][0].definitionHash).toBe('c'.repeat(64))
    await useExamStore.getState().saveScores([{ studentId: 'student', score: 7, definitionHash: undefined }])
    expect(save.mock.calls[2][1][0].definitionHash).toBeUndefined()
    useExamStore.setState({ editingDefinition: true })
    expect(await useExamStore.getState().saveScores([{ studentId: 'student', score: 8 }])).toBeNull()
    expect(save).toHaveBeenCalledTimes(3)
    expect(await useExamStore.getState().completeAndFinalize()).toBeNull()
  })

  it('preserves an in-flight grading save when a definition edit is refused', async () => {
    useExamStore.setState({ saving: true })
    expect(await useExamStore.getState().updateDefinition(session.id, { classId: session.classId, subject: 'Sửa', scoreType: session.scoreType, semester: 1 }, session.definitionHash!)).toBeNull()
    expect(useExamStore.getState().saving).toBe(true)
    expect(useExamStore.getState().editingDefinition).toBe(false)
    expect(api.getExamEditContext).not.toHaveBeenCalled()
  })
})
