import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  it.each(['Hủy', 'Đóng', 'Escape', 'overlay'])('asks before discarding changed exam data via %s and keeps edits when cancelled', async action => {
    const update = vi.spyOn(api, 'updateExamDefinition')
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    const editor = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Môn hoặc nội dung kiểm tra' }), { target: { value: 'Đề chưa lưu' } })
    if (action === 'Escape') fireEvent.keyDown(document, { key: 'Escape' })
    else if (action === 'overlay') fireEvent.click(editor)
    else fireEvent.click(within(editor).getByRole('button', { name: action }))
    const prompt = await screen.findByRole('dialog', { name: 'Lưu thay đổi trước khi thoát?' })
    fireEvent.click(within(prompt).getByRole('button', { name: 'Tiếp tục chỉnh sửa' }))
    expect(within(editor).getByRole('textbox', { name: 'Môn hoặc nội dung kiểm tra' })).toHaveValue('Đề chưa lưu')
    expect(update).not.toHaveBeenCalled()
    fireEvent.click(within(editor).getByRole('button', { name: 'Hủy' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Lưu thay đổi trước khi thoát?' })).getByRole('button', { name: 'Không lưu' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sửa đề thi' })).not.toBeInTheDocument())
    expect(update).not.toHaveBeenCalled()
  })

  it('closes unchanged or reverted forms without prompting and warns on browser unload only while dirty', async () => {
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    let editor = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    const cleanUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanUnload)
    expect(cleanUnload.defaultPrevented).toBe(false)
    fireEvent.click(within(editor).getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    editor = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    const subject = within(editor).getByRole('textbox', { name: 'Môn hoặc nội dung kiểm tra' })
    fireEvent.change(subject, { target: { value: 'Đề đã sửa' } })
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyUnload)
    expect(dirtyUnload.defaultPrevented).toBe(true)
    fireEvent.change(subject, { target: { value: session.subject } })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const afterExit = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(afterExit)
    expect(afterExit.defaultPrevented).toBe(false)
  })

  it('waits for save success before exiting and blocks repeated exit actions during the save', async () => {
    let finishSave!: (value: ExamSession) => void
    const update = vi.spyOn(api, 'updateExamDefinition').mockImplementation(() => new Promise(resolve => { finishSave = resolve }))
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    const editor = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    fireEvent.click(within(editor).getByRole('button', { name: 'Câu 1, đáp án B' }))
    fireEvent.click(within(editor).getByRole('button', { name: 'Hủy' }))
    const prompt = await screen.findByRole('dialog', { name: 'Lưu thay đổi trước khi thoát?' })
    fireEvent.click(within(prompt).getByRole('button', { name: 'Lưu và thoát' }))
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(within(prompt).getByRole('button', { name: 'Không lưu' })).toBeDisabled()
    expect(within(prompt).getByRole('button', { name: 'Tiếp tục chỉnh sửa' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(prompt).toBeInTheDocument()
    expect(editor).toBeInTheDocument()
    await act(async () => finishSave({ ...session, answerKey: { 1: 'B' }, definitionHash: 'b'.repeat(64) }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(update.mock.calls[0][1]).toMatchObject({ answerKey: '{"1":"B"}', expectedDefinitionHash: session.definitionHash })
    const afterSave = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(afterSave)
    expect(afterSave.defaultPrevented).toBe(false)
  })

  it('keeps changes after a failed save-and-exit and does not offer saving an incomplete draft', async () => {
    const update = vi.spyOn(api, 'updateExamDefinition').mockRejectedValue(new Error('Đề đã thay đổi trên thiết bị khác.'))
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    const editor = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    const subject = within(editor).getByRole('textbox', { name: 'Môn hoặc nội dung kiểm tra' })
    fireEvent.change(subject, { target: { value: 'Đề cần giữ' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Hủy' }))
    let prompt = await screen.findByRole('dialog', { name: 'Lưu thay đổi trước khi thoát?' })
    fireEvent.click(within(prompt).getByRole('button', { name: 'Lưu và thoát' }))
    await waitFor(() => expect(within(editor).getByRole('alert')).toHaveTextContent('Đề đã thay đổi trên thiết bị khác.'))
    expect(subject).toHaveValue('Đề cần giữ')
    expect(screen.queryByRole('dialog', { name: 'Lưu thay đổi trước khi thoát?' })).not.toBeInTheDocument()
    fireEvent.change(subject, { target: { value: '' } })
    fireEvent.keyDown(document, { key: 'Escape' })
    prompt = await screen.findByRole('dialog', { name: 'Lưu thay đổi trước khi thoát?' })
    expect(within(prompt).getByRole('button', { name: 'Lưu và thoát' })).toBeDisabled()
    expect(update).toHaveBeenCalledOnce()
  })

  it('saves buffered structured answers without requiring blur', async () => {
    const structured: ExamSession = { ...session, examType: 'written', answerKey: undefined, questionCount: undefined,
      questions: [{ index: 1, type: 'essay', question: 'Sống {{1}}.', responseFormat: 'fill_blank', points: 10,
        answerData: { blanks: [{ id: '1', acceptedAnswers: ['tốt'] }] } }] }
    useExamStore.setState({ sessions: [structured] })
    vi.mocked(api.getMyExamSessions).mockResolvedValue([structured])
    vi.mocked(api.getExamResults).mockResolvedValue({ session: structured, results: [] })
    vi.mocked(api.getExamEditContext).mockResolvedValue({ session: structured, definitionHash: session.definitionHash! })
    const update = vi.spyOn(api, 'updateExamDefinition').mockImplementation(async (_id, data) => ({ ...structured, ...data }))
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    const editor = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    fireEvent.change(within(editor).getByDisplayValue('1: tốt'), { target: { value: '1: yêu thương | chia sẻ' } })
    fireEvent.keyDown(document, { key: 'Escape' })
    const prompt = await screen.findByRole('dialog', { name: 'Lưu thay đổi trước khi thoát?' })
    fireEvent.click(within(prompt).getByRole('button', { name: 'Lưu và thoát' }))
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(JSON.parse(update.mock.calls[0][1].questions!)[0].answerData.blanks).toEqual([
      { id: '1', acceptedAnswers: ['yêu thương', 'chia sẻ'] },
    ])
  })

  it('requires applying a pasted answer key before save-and-exit', async () => {
    const update = vi.spyOn(api, 'updateExamDefinition')
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    const editor = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    fireEvent.click(within(editor).getByRole('button', { name: 'Ma trận nhanh' }))
    fireEvent.change(within(editor).getByPlaceholderText('Dán chuỗi đáp án (VD: ABCD... hoặc 1A 2B 3C...)'), { target: { value: 'B' } })
    fireEvent.keyDown(document, { key: 'Escape' })
    const prompt = await screen.findByRole('dialog', { name: 'Lưu thay đổi trước khi thoát?' })
    expect(within(prompt).getByRole('button', { name: 'Lưu và thoát' })).toBeDisabled()
    fireEvent.click(within(prompt).getByRole('button', { name: 'Tiếp tục chỉnh sửa' }))
    expect(within(editor).getByPlaceholderText('Dán chuỗi đáp án (VD: ABCD... hoặc 1A 2B 3C...)')).toHaveValue('B')
    expect(update).not.toHaveBeenCalled()
  })

  it('previews the unsaved exam, returns to editing and creates only after confirmation', async () => {
    const create = vi.spyOn(api, 'createExam').mockImplementation(async data => ({ ...session, ...data, id: 'EXS-preview-ui' }))
    const update = vi.spyOn(api, 'updateExamDefinition')
    render(<ExamSessionView />)
    fireEvent.click(screen.getByRole('button', { name: 'Danh sách phiên' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo Phiên Chấm' }))
    const editor = await screen.findByRole('dialog', { name: 'Tạo Phiên Chấm' })
    expect(within(editor).getByRole('button', { name: 'Xem trước đề' })).toBeDisabled()
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Môn hoặc nội dung kiểm tra' }), { target: { value: 'Đề chưa tạo' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Nhập đề kiểm tra' }))
    const importer = await screen.findByRole('dialog', { name: 'Import Đề Thi Thông Minh' })
    fireEvent.change(within(importer).getByRole('textbox', { name: 'Nội dung đề thi' }), { target: { value: 'Câu 1: Chọn một.\nA. Một\n*B. Hai\nC. Ba\nD. Bốn' } })
    fireEvent.click(within(importer).getByRole('button', { name: 'Áp Dụng Vào Phiên Chấm' }))
    fireEvent.click(within(editor).getByRole('button', { name: 'Xem trước đề' }))
    let preview = await screen.findByRole('dialog', { name: 'Xem trước đề thi' }, { timeout: 5000 })
    const previewDocument = () => new DOMParser().parseFromString(within(preview).getByTitle('Xem trước đề thi chưa lưu').getAttribute('srcdoc')!, 'text/html')
    expect(previewDocument().body.textContent).toContain('Đề chưa tạo')
    expect(previewDocument().querySelector('.org-unit')?.textContent).toBe('XỨ ĐOÀN ĐỨC MẸ FATIMA')
    expect(previewDocument().body.textContent).toContain('Chọn một.')
    expect(previewDocument().querySelector('img[alt="QR"]')).toBeNull()
    expect(previewDocument().querySelector('.questions-wrapper')?.classList.contains('cols-2')).toBe(true)
    expect(previewDocument().querySelectorAll('.option-correct')).toHaveLength(0)
    fireEvent.click(within(preview).getByRole('checkbox', { name: 'Hiện đáp án' }))
    expect(previewDocument().querySelector('.option-correct')?.textContent).toContain('B.')
    fireEvent.change(within(preview).getByRole('combobox', { name: 'Bố cục đề' }), { target: { value: '1' } })
    expect(previewDocument().querySelector('.questions-wrapper')?.classList.contains('cols-2')).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    fireEvent.click(within(preview).getByRole('button', { name: 'Chỉnh sửa tiếp' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Xem trước đề thi' })).not.toBeInTheDocument())
    expect(within(editor).getByRole('button', { name: 'Xem trước đề' })).toHaveFocus()
    fireEvent.click(within(editor).getByText('Câu 1 · Chọn một.'))
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Câu 1 (Trắc nghiệm)' }), { target: { value: 'Nội dung đã xem lại' } })
    fireEvent.change(within(editor).getByRole('combobox', { name: 'Đáp án đúng · Câu 1' }), { target: { value: 'D' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Xem trước đề' }))
    preview = await screen.findByRole('dialog', { name: 'Xem trước đề thi' }, { timeout: 5000 })
    expect(previewDocument().body.textContent).toContain('Nội dung đã xem lại')
    fireEvent.click(within(preview).getByRole('button', { name: 'Tạo Phiên' }))
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create.mock.calls[0][0]).toMatchObject({ subject: 'Đề chưa tạo', answerKey: '{"1":"D"}' })
    expect(JSON.parse(create.mock.calls[0][0].questions!)).toMatchObject([{ question: 'Nội dung đã xem lại', correctOption: 'D' }])
    expect(update).not.toHaveBeenCalled()
  })

  it('allows an incomplete draft preview, shows missing answers and returns to the same editor on Escape', async () => {
    const update = vi.spyOn(api, 'updateExamDefinition')
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    const editor = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    fireEvent.click(within(editor).getByRole('button', { name: 'Thêm câu trắc nghiệm' }))
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Câu 2 (Trắc nghiệm)' }), { target: { value: 'Câu chưa chọn đáp án' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Xem trước đề' }))
    const preview = await screen.findByRole('dialog', { name: 'Xem trước đề thi' }, { timeout: 5000 })
    expect(within(preview).getByRole('button', { name: 'Lưu đề thi' })).toBeDisabled()
    fireEvent.click(within(preview).getByRole('checkbox', { name: 'Hiện đáp án' }))
    const html = within(preview).getByTitle('Xem trước đề thi chưa lưu').getAttribute('srcdoc')!
    const draft = new DOMParser().parseFromString(html, 'text/html')
    expect(draft.querySelectorAll('.key-ans')[1]?.textContent).toBe('—')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Xem trước đề thi' })).not.toBeInTheDocument())
    expect(within(editor).getByRole('textbox', { name: 'Câu 2 (Trắc nghiệm)' })).toHaveValue('Câu chưa chọn đáp án')
    expect(update).not.toHaveBeenCalled()
  })

  it('continues a mixed import into a fresh essay dialog and preserves the first part when cancelled', async () => {
    const create = vi.spyOn(api, 'createExam').mockImplementation(async data => ({ ...session, ...data, id: 'EXS-mixed-ui' }))
    render(<ExamSessionView />)
    fireEvent.click(screen.getByRole('button', { name: 'Danh sách phiên' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo Phiên Chấm' }))
    const editor = await screen.findByRole('dialog', { name: 'Tạo Phiên Chấm' })
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Môn hoặc nội dung kiểm tra' }), { target: { value: 'Đề kết hợp' } })
    fireEvent.click(within(editor).getByRole('button', { name: /Kết hợp TN/ }))
    fireEvent.click(within(editor).getByText('Nhập riêng từng phần'))
    fireEvent.click(within(editor).getByRole('button', { name: 'Nhập phần trắc nghiệm' }))
    const mcImport = await screen.findByRole('dialog', { name: 'Import Phần Trắc Nghiệm' })
    fireEvent.change(within(mcImport).getByRole('textbox', { name: 'Nội dung đề thi' }), { target: { value: 'Câu 1 (3 điểm): Chọn một.\nA. Một\n*B. Hai\nC. Ba\nD. Bốn' } })
    fireEvent.click(within(mcImport).getByRole('button', { name: /Tiếp tục.*Import Tự Luận/ }))
    let essayImport = await screen.findByRole('dialog', { name: 'Import Phần Tự Luận' })
    expect(within(essayImport).getByRole('textbox', { name: 'Nội dung đề thi' })).toHaveValue('')
    expect(within(essayImport).getByRole('button', { name: 'Áp Dụng Vào Phiên Chấm' })).toBeDisabled()
    fireEvent.click(within(essayImport).getByRole('button', { name: 'Hủy' }))
    expect(within(editor).getByRole('button', { name: /Kết hợp TN/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(editor).getByText('Câu 1 · Chọn một.')).toBeInTheDocument()
    expect(within(editor).getByRole('button', { name: 'Tạo Phiên' })).toBeDisabled()
    fireEvent.click(within(editor).getByRole('button', { name: 'Nhập phần tự luận' }))
    essayImport = await screen.findByRole('dialog', { name: 'Import Phần Tự Luận' })
    fireEvent.change(within(essayImport).getByRole('textbox', { name: 'Nội dung đề thi' }), { target: { value: 'PHẦN TỰ LUẬN\nCâu 1 (7 điểm): Trình bày ý nghĩa.' } })
    fireEvent.click(within(essayImport).getByRole('button', { name: 'Áp Dụng Vào Phiên Chấm' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Import Phần Tự Luận' })).not.toBeInTheDocument())
    fireEvent.click(within(editor).getByRole('button', { name: 'Tạo Phiên' }))
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    const payload = create.mock.calls[0][0]
    expect(payload).toMatchObject({ examType: 'mixed', questionCount: 1, answerKey: '{"1":"B"}' })
    expect(JSON.parse(payload.questions!)).toMatchObject([{ index: 1, question: 'Chọn một.', correctOption: 'B' }, { index: 2, type: 'essay', question: 'Trình bày ý nghĩa.' }])
  })

  it('adds and removes imported questions without moving answers onto another question', async () => {
    const mixed: ExamSession = { ...session, examType: 'mixed', questionCount: 2, answerKey: { 1: 'A', 2: 'B' }, questions: [
      ...session.questions as Exclude<ExamSession['questions'], string | undefined>,
      { index: 2, type: 'multiple_choice', question: 'Câu giữ lại', options: { A: 'Một', B: 'Hai', C: 'Ba', D: 'Bốn' }, correctOption: 'B', points: 2 },
      { index: 3, type: 'essay', question: 'Tự luận giữ lại', points: 5, answerLineCount: 12, explanation: 'Hướng dẫn cũ' },
    ] }
    useExamStore.setState({ sessions: [mixed] })
    vi.mocked(api.getMyExamSessions).mockResolvedValue([mixed])
    vi.mocked(api.getExamResults).mockResolvedValue({ session: mixed, results: [] })
    vi.mocked(api.getExamEditContext).mockResolvedValue({ session: mixed, definitionHash: session.definitionHash! })
    const update = vi.spyOn(api, 'updateExamDefinition').mockImplementation(async (_id, data) => ({ ...mixed, ...data }))
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    const editor = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    const answers = within(editor).getByRole('region', { name: 'Câu hỏi và đáp án chuẩn' })
    expect(within(answers).getByText('Câu 1 · Câu ban đầu')).toBeInTheDocument()
    expect(within(answers).getByText('Câu 3 · Tự luận giữ lại')).toBeInTheDocument()
    expect(within(editor).queryByRole('heading', { name: /Nội dung câu hỏi/ })).not.toBeInTheDocument()
    fireEvent.click(within(answers).getByRole('button', { name: 'Câu 2, đáp án D' }))
    fireEvent.click(within(editor).getByText('Câu 1 · Câu ban đầu'))
    fireEvent.click(within(editor).getByRole('button', { name: 'Xóa câu 1' }))
    let confirm = await screen.findByRole('alertdialog', { name: 'Xóa câu 1?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Hủy' }))
    expect(within(editor).getByText('Câu 1 · Câu ban đầu')).toBeInTheDocument()
    fireEvent.click(within(editor).getByRole('button', { name: 'Xóa câu 1' }))
    confirm = await screen.findByRole('alertdialog', { name: 'Xóa câu 1?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Xóa câu' }))
    await waitFor(() => expect(within(editor).queryByText('Câu 1 · Câu ban đầu')).not.toBeInTheDocument())
    fireEvent.click(within(editor).getByRole('button', { name: 'Thêm câu trắc nghiệm' }))
    expect(within(editor).getByRole('button', { name: 'Lưu đề thi' })).toBeDisabled()
    // Query associated labels directly while editing several fields in one journey.
    // Recomputing every hidden accordion's accessible tree for each keystroke
    // adds unrelated work to this answer-preservation regression.
    fireEvent.change(within(editor).getByLabelText('Câu 2 (Trắc nghiệm)', { exact: true }), { target: { value: 'Câu mới' } })
    for (const option of ['A', 'B', 'C', 'D']) fireEvent.change(within(editor).getByLabelText(`Phương án ${option} · Câu 2`, { exact: true }), { target: { value: `Mới ${option}` } })
    fireEvent.change(within(editor).getByLabelText('Đáp án đúng · Câu 2', { exact: true }), { target: { value: 'C' } })
    fireEvent.click(within(editor).getByText('Câu 3 · Tự luận giữ lại'))
    expect(within(editor).getByLabelText('Số dòng trả lời · Câu 3', { exact: true })).toHaveValue(12)
    fireEvent.change(within(editor).getByLabelText('Đáp án / hướng dẫn chấm · Câu 3', { exact: true }), { target: { value: 'Hướng dẫn mới' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Thêm câu tự luận' }))
    fireEvent.change(within(editor).getByLabelText('Câu 4 (Tự luận)', { exact: true }), { target: { value: 'Tự luận mới' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Lưu đề thi' }))
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    const payload = update.mock.calls[0][1]
    expect(payload).toMatchObject({ examType: 'mixed', questionCount: 2, answerKey: '{"1":"D","2":"C"}', expectedDefinitionHash: session.definitionHash })
    expect(JSON.parse(payload.questions!)).toMatchObject([
      { index: 1, question: 'Câu giữ lại', correctOption: 'D', points: 2 },
      { index: 2, question: 'Câu mới', correctOption: 'C', options: { C: 'Mới C' } },
      { index: 3, question: 'Tự luận giữ lại', answerLineCount: 12, explanation: 'Hướng dẫn mới' },
      { index: 4, type: 'essay', question: 'Tự luận mới' },
    ])
  })

  it('keeps an empty multiple-choice draft unsavable and lets the user replace its last question', async () => {
    const update = vi.spyOn(api, 'updateExamDefinition').mockImplementation(async (_id, data) => ({ ...session, ...data }))
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    const editor = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    fireEvent.click(within(editor).getByText('Câu 1 · Câu ban đầu'))
    fireEvent.click(within(editor).getByRole('button', { name: 'Xóa câu 1' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Xóa câu 1?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Xóa câu' }))
    await waitFor(() => expect(within(editor).queryByText('Câu 1 · Câu ban đầu')).not.toBeInTheDocument())
    expect(within(editor).getByRole('button', { name: /Trắc nghiệm/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(editor).getByRole('button', { name: 'Lưu đề thi' })).toBeDisabled()
    fireEvent.click(within(editor).getByRole('button', { name: 'Thêm câu trắc nghiệm' }))
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Câu 1 (Trắc nghiệm)' }), { target: { value: 'Nội dung thay thế' } })
    expect(within(editor).getByRole('button', { name: 'Lưu đề thi' })).toBeDisabled()
    fireEvent.change(within(editor).getByRole('combobox', { name: 'Đáp án đúng · Câu 1' }), { target: { value: 'B' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Lưu đề thi' }))
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0][1]).toMatchObject({ examType: 'multiple_choice', questionCount: 1, answerKey: '{"1":"B"}' })
    expect(JSON.parse(update.mock.calls[0][1].questions!)).toMatchObject([{ index: 1, question: 'Nội dung thay thế', correctOption: 'B' }])
  })

  it('limits the combined question count to the server contract of 50', async () => {
    const full: ExamSession = { ...session, examType: 'mixed', questions: [
      ...(session.questions as Exclude<ExamSession['questions'], string | undefined>),
      ...Array.from({ length: 49 }, (_, i) => ({ index: i + 2, type: 'essay' as const, question: `Tự luận ${i + 2}`, points: 1 })),
    ] }
    useExamStore.setState({ sessions: [full] })
    vi.mocked(api.getMyExamSessions).mockResolvedValue([full])
    vi.mocked(api.getExamResults).mockResolvedValue({ session: full, results: [] })
    vi.mocked(api.getExamEditContext).mockResolvedValue({ session: full, definitionHash: session.definitionHash! })
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    const editor = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    expect(within(editor).getByRole('button', { name: 'Thêm câu trắc nghiệm' })).toBeDisabled()
    expect(within(editor).getByRole('button', { name: 'Thêm câu tự luận' })).toBeDisabled()
    expect(within(editor).getByText('1 câu trắc nghiệm · 49 câu tự luận')).toBeInTheDocument()
  })

  it('preserves existing answer-only questions when adding the first authored question', async () => {
    const keysOnly: ExamSession = { ...session, questions: undefined, questionCount: 2, answerKey: { 1: 'C', 2: 'D' } }
    useExamStore.setState({ sessions: [keysOnly] })
    vi.mocked(api.getMyExamSessions).mockResolvedValue([keysOnly])
    vi.mocked(api.getExamResults).mockResolvedValue({ session: keysOnly, results: [] })
    vi.mocked(api.getExamEditContext).mockResolvedValue({ session: keysOnly, definitionHash: session.definitionHash! })
    const update = vi.spyOn(api, 'updateExamDefinition').mockImplementation(async (_id, data) => ({ ...keysOnly, ...data }))
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    const editor = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    fireEvent.click(within(editor).getByRole('button', { name: 'Thêm câu trắc nghiệm' }))
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Câu 3 (Trắc nghiệm)' }), { target: { value: 'Nội dung bổ sung' } })
    fireEvent.change(within(editor).getByRole('combobox', { name: 'Đáp án đúng · Câu 3' }), { target: { value: 'A' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Lưu đề thi' }))
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0][1]).toMatchObject({ questionCount: 3, answerKey: '{"1":"C","2":"D","3":"A"}' })
    expect(JSON.parse(update.mock.calls[0][1].questions!)).toMatchObject([
      { index: 1, correctOption: 'C', isPlaceholder: true },
      { index: 2, correctOption: 'D', isPlaceholder: true },
      { index: 3, question: 'Nội dung bổ sung', correctOption: 'A' },
    ])
  })

  it('keeps the edited answer when the user removes the essay part by changing exam type', async () => {
    const mixed: ExamSession = { ...session, examType: 'mixed', questions: [
      ...(session.questions as Exclude<ExamSession['questions'], string | undefined>),
      { index: 2, type: 'essay', question: 'Phần tự luận', points: 5 },
    ] }
    useExamStore.setState({ sessions: [mixed] })
    vi.mocked(api.getMyExamSessions).mockResolvedValue([mixed])
    vi.mocked(api.getExamResults).mockResolvedValue({ session: mixed, results: [] })
    vi.mocked(api.getExamEditContext).mockResolvedValue({ session: mixed, definitionHash: session.definitionHash! })
    const update = vi.spyOn(api, 'updateExamDefinition').mockImplementation(async (_id, data) => ({ ...mixed, ...data }))
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    const editor = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    fireEvent.click(within(editor).getByRole('button', { name: 'Câu 1, đáp án D' }))
    fireEvent.click(within(editor).getByRole('button', { name: /Trắc nghiệm/ }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Đổi hình thức bài kiểm tra?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Đổi hình thức' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    fireEvent.click(within(editor).getByRole('button', { name: 'Lưu đề thi' }))
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0][1]).toMatchObject({ examType: 'multiple_choice', questionCount: 1, answerKey: '{"1":"D"}' })
  })

  it('rejects invalid essay spacing before saving the definition and preserves explicit zero', async () => {
    const written: ExamSession = { ...session, examType: 'written', questionCount: undefined, answerKey: undefined,
      questions: [{ index: 1, type: 'essay', question: 'Trình bày ý nghĩa.', points: 10, answerLineCount: 8 }] }
    useExamStore.setState({ sessions: [written] })
    vi.mocked(api.getMyExamSessions).mockResolvedValue([written])
    vi.mocked(api.getExamResults).mockResolvedValue({ session: written, results: [] })
    vi.mocked(api.getExamEditContext).mockResolvedValue({ session: written, definitionHash: session.definitionHash! })
    const update = vi.spyOn(api, 'updateExamDefinition').mockImplementation(async (_id, data) => ({ ...written, ...data }))
    render(<ExamSessionView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa đề thi' }))
    const editor = await screen.findByRole('dialog', { name: 'Sửa đề thi' })
    fireEvent.click(within(editor).getByText('Câu 1 · Trình bày ý nghĩa.'))
    const lines = within(editor).getByRole('spinbutton', { name: 'Số dòng trả lời · Câu 1' })
    for (const value of ['-1', '1.5', '101']) {
      fireEvent.change(lines, { target: { value } })
      fireEvent.click(within(editor).getByRole('button', { name: 'Lưu đề thi' }))
      expect(within(editor).getByRole('alert')).toHaveTextContent('số dòng trả lời phải là số nguyên từ 0 đến 100')
      expect(update).not.toHaveBeenCalled()
    }
    fireEvent.change(lines, { target: { value: '0' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Lưu đề thi' }))
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(JSON.parse(update.mock.calls[0][1].questions!)[0].answerLineCount).toBe(0)
  })

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
    fireEvent.click(within(dialog).getByRole('button', { name: 'Câu 1, đáp án A' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Câu 2, đáp án A' }))
    fireEvent.click(within(dialog).getByRole('button', { name: /Trắc nghiệm/ }))
    expect(within(dialog).getByRole('button', { name: 'Tạo Phiên' })).toBeEnabled()
    expect(within(dialog).getByText('Sẵn sàng tạo phiên chấm')).toBeInTheDocument()
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
