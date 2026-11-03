import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ExamVariantsModal } from '../../components/exam/ExamVariantsModal'
import { api } from '../../lib/api'
import { useExamStore } from '../../stores/examStore'
import { generateExamVariantManifest } from '../../../server/src/services/examVariantManifest'
import type { ExamQuestion, ExamSession } from '../../types'

const questions = [
  { index: 1, question: 'Câu một', options: { A: 'Một', B: 'Hai', C: 'Ba', D: 'Bốn' }, correctOption: 'B' },
  { index: 2, question: 'Câu hai', options: { A: 'Năm', B: 'Sáu', C: 'Bảy', D: 'Tám' }, correctOption: 'C' },
] satisfies ExamQuestion[]
const session: ExamSession = {
  id: 'variant-ui', parishId: 'test', classId: 'class', subject: 'Giáo lý', scoreType: '15m', semester: 1,
  academicYear: '2026-2027', status: 'draft', createdBy: 'admin', createdAt: '2026-10-30T00:00:00Z',
  maxScore: 10, examType: 'multiple_choice', questionCount: 2, questions, answerKey: { 1: 'B', 2: 'C' },
}

beforeEach(() => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  useExamStore.setState({ sessions: [session], selectedSessionId: session.id, saving: false, error: null })
  vi.spyOn(api, 'previewExamVariantManifests').mockImplementation(async (_id, variantCount, shuffleMode, options) => ({
    definitionHash: 'f'.repeat(64),
    manifests: generateExamVariantManifest({ questions, questionCount: 2, variantCount, shuffleMode,
      seed: 'component-preview', shufflePolicy: options?.shufflePolicy, heldQuestionIndices: options?.heldQuestionIndices }),
  }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('exam variant generation controls', () => {
  it('allows ordinary quantifiers from the reported questions instead of showing positional warnings', () => {
    const safeQuestions = [
      { ...questions[0], options: { ...questions[0].options, D: 'Tất cả mọi người đều có hình dáng giống nhau.' } },
      { ...questions[1], options: { ...questions[1].options, A: 'Khả năng biết trước tất cả mọi sự.' } },
    ]
    render(<ExamVariantsModal session={{ ...session, questions: safeQuestions }} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Xem trước' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Tạo và khóa' })).toBeDisabled()
    expect(screen.queryByText(/vấn đề cần xử lý trước khi đảo đề/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Kiểu trộn' }), { target: { value: 'options_only' } })
    expect(screen.getByRole('button', { name: 'Xem trước' })).toBeEnabled()
  })

  it('offers reference-aware generation and invalidates the preview when settings change', async () => {
    const generate = vi.spyOn(api, 'generateExamVariantManifests')
    const referenced = [{ ...questions[0], options: { ...questions[0].options, D: 'Cả A và B đúng.' } }, questions[1]]
    render(<ExamVariantsModal session={{ ...session, questions: referenced }} onClose={() => {}} />)
    expect(screen.getByText(/Câu 1: Cập nhật nhãn tham chiếu/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Tạo và khóa' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Xem trước' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo và khóa' })).toBeEnabled())
    fireEvent.change(screen.getByRole('combobox', { name: 'Kiểu trộn' }), { target: { value: 'questions_only' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo và khóa' })).toBeDisabled())
    expect(screen.queryByRole('region', { name: 'Xem trước nội dung mã đề' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Kiểu trộn' }), { target: { value: 'options_only' } })
    expect(screen.getByRole('button', { name: 'Tạo và khóa' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và khóa' }))
    expect(generate).not.toHaveBeenCalled()
  })

  it('sends the chosen mode through the store and shows the saved source/key mapping', async () => {
    const generate = vi.spyOn(api, 'generateExamVariantManifests').mockImplementation(async (_id, variantCount, shuffleMode, options) => {
      const manifests = generateExamVariantManifest({ questions, questionCount: 2, variantCount, shuffleMode, seed: options!.seed!,
        shufflePolicy: options?.shufflePolicy, heldQuestionIndices: options?.heldQuestionIndices })
      return { session: { ...session, variantManifests: JSON.stringify(manifests), answerVariants: Object.fromEntries(Object.entries(manifests.variants).map(([code, entry]) => [code, entry!.answerKey])) }, manifests }
    })
    render(<ExamVariantsModal session={session} onClose={() => {}} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Kiểu trộn' }), { target: { value: 'questions_only' } })
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Số mã' })).toHaveValue('2'))
    expect(within(screen.getByRole('combobox', { name: 'Số mã' })).getAllByRole('option')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo và khóa' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và khóa' }))
    await screen.findByRole('status')
    expect(generate).toHaveBeenCalledWith(session.id, 2, 'questions_only', expect.objectContaining({
      expectedDefinitionHash: 'f'.repeat(64), seed: 'component-preview', shufflePolicy: 'fixed_aggregates',
      analysisHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Mã B (102)' }))
    const rows = within(screen.getByRole('region', { name: 'Đối chiếu mã B' })).getAllByRole('row')
    expect(within(rows[1]).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['2', 'A·B·C·D', 'C'])
    expect(screen.queryByRole('button', { name: 'Tạo và khóa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lưu và chấm lại' })).not.toBeInTheDocument()
    expect(useExamStore.getState().sessions[0].variantManifests).toMatchObject({ shuffleMode: 'questions_only' })
  })

  it('shows a server validation failure and permits correcting the generation settings', async () => {
    vi.spyOn(api, 'generateExamVariantManifests').mockRejectedValue(new Error('Không đủ hoán vị khác nhau.'))
    render(<ExamVariantsModal session={session} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo và khóa' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và khóa' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Không đủ hoán vị khác nhau.')
    expect(screen.getByRole('button', { name: 'Xem trước' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Tạo và khóa' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Kiểu trộn' })).toBeEnabled()
  })

  it('blocks generation offline and responds to reconnection', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const generate = vi.spyOn(api, 'generateExamVariantManifests')
    render(<ExamVariantsModal session={session} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Tạo và khóa' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Lưu và chấm lại' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và khóa' }))
    expect(generate).not.toHaveBeenCalled()
    online.mockReturnValue(true)
    fireEvent(window, new Event('online'))
    expect(screen.getByRole('button', { name: 'Xem trước' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Tạo và khóa' })).toBeDisabled()
  })

  it('requires explicit acceptance for aggregate wording changes', async () => {
    render(<ExamVariantsModal session={session} onClose={() => {}} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Xử lý lựa chọn tổng hợp' }), { target: { value: 'rewrite_aggregates' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }))
    const accepted = await screen.findByRole('checkbox', { name: /Tôi đã xem các tập lựa chọn/ })
    expect(screen.getByRole('button', { name: 'Tạo và khóa' })).toBeDisabled()
    fireEvent.click(accepted)
    expect(screen.getByRole('button', { name: 'Tạo và khóa' })).toBeEnabled()
    fireEvent.change(screen.getByRole('combobox', { name: 'Số mã' }), { target: { value: '2' } })
    expect(screen.getByRole('button', { name: 'Tạo và khóa' })).toBeDisabled()
    expect(screen.queryByRole('checkbox', { name: /Tôi đã xem các tập lựa chọn/ })).not.toBeInTheDocument()
  })

  it('keeps unsaved manual keys out of the server preview workflow', () => {
    render(<ExamVariantsModal session={session} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Câu 1, đáp án C' }))
    expect(screen.getByRole('button', { name: 'Xem trước' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Tạo và khóa' })).toBeDisabled()
    expect(screen.getByText(/Có đáp án chỉnh sửa chưa lưu/)).toBeVisible()
    expect(api.previewExamVariantManifests).not.toHaveBeenCalled()
  })

  it('reports six available codes for a single pinned aggregate instead of blocking it', () => {
    const source = [{ ...questions[0], options: { ...questions[0].options, D: 'Tất cả đáp đều đúng.' } }]
    render(<ExamVariantsModal session={{ ...session, questions: source, questionCount: 1 }} onClose={() => {}} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Kiểu trộn' }), { target: { value: 'options_only' } })
    expect(within(screen.getByRole('combobox', { name: 'Số mã' })).getAllByRole('option')).toHaveLength(6)
    expect(screen.getByText(/Giữ D; trộn những lựa chọn/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Xem trước' })).toBeEnabled()
  })

  it.each([
    { ...questions[0], isPlaceholder: true },
    { ...questions[0], options: { A: 'Một', B: 'Hai', C: 'Ba' } } as ExamQuestion,
  ])('blocks placeholder or incomplete questions before calling the server', question => {
    const generate = vi.spyOn(api, 'generateExamVariantManifests')
    render(<ExamVariantsModal session={{ ...session, questions: [question], questionCount: 1 }} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Tạo và khóa' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và khóa' }))
    expect(generate).not.toHaveBeenCalled()
  })

  it('opens legacy v1 manifests as read-only and closes through the shared dialog shell', () => {
    const manifest = generateExamVariantManifest({ questions, questionCount: 2, variantCount: 2, seed: 'legacy-variant' })
    manifest.algorithmVersion = 'catevia-variant-v1'
    delete manifest.shuffleMode
    const onClose = vi.fn()
    render(<ExamVariantsModal session={{ ...session, variantManifests: JSON.stringify(manifest) }} onClose={onClose} />)
    expect(screen.getByText(/Đã lưu bộ mã đề: Trộn câu và đáp án/)).toBeVisible()
    expect(screen.getByRole('region', { name: 'Đối chiếu mã A' })).toBeVisible()
    expect(screen.queryByRole('combobox', { name: 'Kiểu trộn' })).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
