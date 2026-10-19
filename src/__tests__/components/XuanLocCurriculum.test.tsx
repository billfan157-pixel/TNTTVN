import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionBankView, XuanLocCurriculumPanel } from '../../components/exam/QuestionBankView'
import { api } from '../../lib/api'

vi.mock('../../lib/api', () => ({ api: {
  listQuestionBank: vi.fn(async () => ({ items: [] })),
  listExamBlueprints: vi.fn(async () => []),
  createQuestionBankItem: vi.fn(),
} }))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ role: 'admin', user: { id: 'test-user' } }) }))
vi.mock('../../hooks/useEffectiveMode', () => ({ useEffectiveMode: () => 'desktop' }))
vi.mock('../../stores/classStore', () => ({ useClassStore: (selector: (state: unknown) => unknown) => selector({
  classes: [], branches: [], fetchAll: vi.fn(),
}) }))
vi.mock('../../stores/academicYearStore', () => ({ useAcademicYearStore: (selector: (state: unknown) => unknown) => selector({
  resolveActiveYear: () => '2026-2027',
}) }))

describe('Xuân Lộc curriculum references', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens an unsaved empty authoring form from the actual bank tab with the selected lesson and source', async () => {
    render(<QuestionBankView />)
    fireEvent.click(screen.getByRole('tab', { name: 'Giáo lý Xuân Lộc' }))
    expect(screen.getByText(/chưa xác nhận áp dụng cho 2026–2027/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tham chiếu bài Khai Tâm'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Soạn câu hỏi với tham chiếu này' }))
    const form = within(await screen.findByRole('dialog', { name: 'Tạo câu hỏi nháp' }))
    expect(form.getByLabelText('Bài học')).toHaveValue('Bài 50')
    expect(form.getByLabelText('Thứ tự bài')).toHaveValue(50)
    expect(form.getByLabelText('Chương')).toHaveValue('Phần IV')
    const source = (form.getByLabelText('Nguồn trích dẫn') as HTMLInputElement).value
    expect(source).toContain('giaophanthaibinh.net')
    expect(source.length).toBeLessThanOrEqual(500)
    expect(form.getByRole('button', { name: 'Lưu câu hỏi nháp' })).toBeDisabled()
    expect(api.createQuestionBankItem).not.toHaveBeenCalled()
  })

  it('clears the previous lesson when switching books, and does not invent a book for Hồng Ân', () => {
    const useReference = vi.fn()
    render(<XuanLocCurriculumPanel online onUseReference={useReference} />)
    fireEvent.change(screen.getByLabelText('Tham chiếu bài Khai Tâm'), { target: { value: '16' } })
    fireEvent.change(screen.getByLabelText('Khối chương trình'), { target: { value: 'them-suc' } })
    expect(screen.queryByLabelText('Tham chiếu bài Khai Tâm')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Soạn câu hỏi với tham chiếu này' }))
    expect(useReference).toHaveBeenCalledWith(expect.objectContaining({ lesson: '', lessonOrder: '', chapter: '', source: expect.stringContaining('2016') }))
    fireEvent.change(screen.getByLabelText('Khối chương trình'), { target: { value: 'hong-an' } })
    expect(screen.getByRole('status')).toHaveTextContent('Chưa xác minh sách cho khối Hồng Ân')
    expect(screen.queryByRole('button', { name: 'Soạn câu hỏi với tham chiếu này' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Khối chương trình'), { target: { value: 'khai-tam' } })
    expect(screen.getByLabelText('Tham chiếu bài Khai Tâm')).toHaveValue('')
  })

  it('keeps references readable offline while preventing draft authoring', () => {
    const useReference = vi.fn()
    render(<XuanLocCurriculumPanel online={false} onUseReference={useReference} />)
    expect(screen.getByLabelText('Tham chiếu bài Khai Tâm').querySelectorAll('option')).toHaveLength(51)
    const source = screen.getByRole('link', { name: 'Xem tên 50 bài tại nguồn Thái Bình' })
    expect(source).toHaveAttribute('rel', 'noopener noreferrer')
    fireEvent.click(screen.getByRole('button', { name: 'Soạn câu hỏi với tham chiếu này' }))
    expect(useReference).not.toHaveBeenCalled()
  })
})
