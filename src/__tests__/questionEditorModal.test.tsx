import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { QuestionEditorModal } from '../components/exam/QuestionEditorModal'
import { EMPTY_QUESTION, mutationFromQuestionForm, questionFormFromItem } from '../utils/questionEditorModel'
import type { QuestionBankItem } from '../types'

vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}))

const props = {
  editing: false,
  form: EMPTY_QUESTION,
  setForm: vi.fn(),
  branches: [{ id: 'branch-1', name: 'Ngành Thiếu Nhi' }],
  blocks: [{
    id: 'branch-1::grade:1',
    branchId: 'branch-1',
    label: 'Thiếu Nhi 1',
    classNames: ['Thiếu Nhi 1A', 'Thiếu Nhi 1B'],
    academicYear: '2026-2027',
  }],
  saving: false,
  onClose: vi.fn(),
  onSave: vi.fn(),
}

describe('QuestionEditorModal', () => {
  it.each([
    { questionType: 'true_false', answerData: { correct: false } },
    { questionType: 'short_answer', answerData: { acceptedAnswers: ['Chúa Giêsu', 'Đức Giêsu'] } },
    { questionType: 'multiple_select', answerData: { options: [{ id: 'A', text: 'Một' }, { id: 'B', text: 'Hai' }, { id: 'E', text: 'Năm' }], correctOptionIds: ['A', 'E'] } },
    { questionType: 'multiple_choice', answerData: { options: ['A', 'B', 'C', 'D', 'E'].map(id => ({ id, text: `Phương án ${id}` })), correctOptionIds: ['E'] } },
  ])('preserves the bank question type and every answer while editing $questionType', input => {
    const item = { current: { ...input, stem: 'Nội dung gốc', explanation: null }, tags: [], book: 'Giáo lý 1' } as unknown as QuestionBankItem
    const form = questionFormFromItem(item, [])
    const revised = mutationFromQuestionForm({ ...form, stem: 'Nội dung đã sửa' })
    expect(revised).toMatchObject({ questionType: input.questionType, stem: 'Nội dung đã sửa', book: 'Giáo lý 1' })
    expect(revised.answerData).toEqual(input.answerData)
  })

  it('keeps the essay rubric when it is stored in the answer instead of the explanation', () => {
    const item = { current: { questionType: 'essay', stem: 'Trình bày.', explanation: null, answerData: { rubric: 'Đủ hai ý', answerLineCount: 12 } }, tags: [] } as unknown as QuestionBankItem
    const revised = mutationFromQuestionForm(questionFormFromItem(item, []))
    expect(revised.answerData).toMatchObject({ rubric: 'Đủ hai ý', answerLineCount: 12 })
  })

  it('lets a teacher set and clear the essay answer line count through the form', () => {
    const save = vi.fn()
    function Editor() {
      const [form, setForm] = useState<typeof EMPTY_QUESTION>({ ...EMPTY_QUESTION, questionType: 'essay', stem: 'Trình bày ý nghĩa.' })
      return <QuestionEditorModal {...props} form={form} setForm={setForm} isOpen onSave={() => save(mutationFromQuestionForm(form))} />
    }
    render(<Editor />)
    const lines = screen.getByRole('spinbutton', { name: 'Số dòng trả lời' })
    fireEvent.change(lines, { target: { value: '18' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu câu hỏi nháp' }))
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ answerData: expect.objectContaining({ answerLineCount: 18 }) }))
    fireEvent.change(lines, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu câu hỏi nháp' }))
    expect(save.mock.lastCall?.[0].answerData.answerLineCount).toBeUndefined()
  })
  it('authors multiword gap answers and optional word choices through the visible form', () => {
    const save = vi.fn()
    function Editor() {
      const [form, setForm] = useState(EMPTY_QUESTION)
      return <QuestionEditorModal {...props} form={form} setForm={setForm} isOpen onSave={() => save(mutationFromQuestionForm(form))} />
    }
    render(<Editor />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Hình thức câu hỏi' }), { target: { value: 'fill_blank' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Nội dung câu hỏi/ }), { target: { value: 'Em biết {{1}}.' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Đáp án từng ô / cặp ghép' }), { target: { value: '1: chia sẻ | san sẻ' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Từ cho sẵn (tùy chọn)' }), { target: { value: 'chia sẻ, cầu nguyện' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu câu hỏi nháp' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ questionType: 'fill_blank', stem: 'Em biết {{1}}.', answerData: { blanks: [{ id: '1', acceptedAnswers: ['chia sẻ', 'san sẻ'] }], wordBank: ['chia sẻ', 'cầu nguyện'], rubric: undefined } }))
  })
  it('does not expose the draft form before its button opens the window', () => {
    render(<QuestionEditorModal {...props} isOpen={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Tạo câu hỏi nháp')).not.toBeInTheDocument()
  })

  it('opens as the shared accessible modal with Catevia branch and khối options', () => {
    render(<QuestionEditorModal {...props} isOpen />)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Tạo câu hỏi nháp' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Ngành Thiếu Nhi' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Thiếu Nhi 1 · 2026-2027' })).toBeInTheDocument()
  })
})
