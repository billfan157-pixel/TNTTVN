import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { QuestionEditorModal } from '../components/exam/QuestionEditorModal'
import { EMPTY_QUESTION, mutationFromQuestionForm } from '../utils/questionEditorModel'

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
