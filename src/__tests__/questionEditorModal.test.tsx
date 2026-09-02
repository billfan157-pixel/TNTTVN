import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuestionEditorModal } from '../components/exam/QuestionEditorModal'
import { EMPTY_QUESTION } from '../utils/questionEditorModel'

vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}))

const props = {
  editing: false,
  form: EMPTY_QUESTION,
  setForm: vi.fn(),
  branches: [{ id: 'branch-1', name: 'Ngành Thiếu Nhi' }],
  classes: [{ id: 'class-1', name: 'Thiếu Nhi 1A', branchId: 'branch-1', academicYear: '2026-2027' }],
  saving: false,
  onClose: vi.fn(),
  onSave: vi.fn(),
}

describe('QuestionEditorModal', () => {
  it('does not expose the draft form before its button opens the window', () => {
    render(<QuestionEditorModal {...props} isOpen={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Tạo câu hỏi nháp')).not.toBeInTheDocument()
  })

  it('opens as the shared accessible modal with Catevia branch and class options', () => {
    render(<QuestionEditorModal {...props} isOpen />)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Tạo câu hỏi nháp' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Ngành Thiếu Nhi' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Thiếu Nhi 1A · 2026-2027' })).toBeInTheDocument()
  })
})
