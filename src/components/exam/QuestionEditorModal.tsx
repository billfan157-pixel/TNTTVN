import { FilePlus2, Plus, X } from 'lucide-react'
import { Button } from '../common/ui'
import { ModalShell } from '../common/ModalShell'
import type { QuestionBranchOption, QuestionForm } from '../../utils/questionEditorModel'
import type { QuestionBlockOption } from '../../utils/questionBlock'
import type { QuestionDifficulty } from '../../types'
import { extractEssaySubparts, parseStructuredQuestion } from '../../utils/structuredQuestions'
import { StructuredQuestionPreview } from './StructuredQuestionPreview'

export type { QuestionBranchOption, QuestionForm }
export type { QuestionBlockOption }

interface QuestionEditorModalProps {
  isOpen: boolean
  editing: boolean
  form: QuestionForm
  setForm: (updater: (current: QuestionForm) => QuestionForm) => void
  branches: QuestionBranchOption[]
  blocks: QuestionBlockOption[]
  saving: boolean
  error?: string | null
  onClose: () => void
  onSave: () => void
}

export function QuestionEditorModal({ isOpen, editing, form, setForm, branches, blocks, saving, error, onClose, onSave }: QuestionEditorModalProps) {
  const blockOptions = blocks.filter(block => !form.branchId || block.branchId === form.branchId)
  const set = <K extends keyof QuestionForm>(key: K, value: QuestionForm[K]) => setForm(current => ({ ...current, [key]: value }))

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Chỉnh sửa câu hỏi và đáp án' : 'Tạo câu hỏi nháp'}
      subtitle={editing ? 'Thay đổi được lưu thành bản nháp để duyệt lại. Các đề thi đã tạo giữ nguyên nội dung và đáp án.' : 'Nội dung sẽ được lưu dưới dạng bản nháp và chỉ được sử dụng sau quy trình phê duyệt.'}
      icon={<FilePlus2 className="h-5 w-5 text-parish-primary" />}
      maxWidth="960px"
      closeOnOverlay={!saving}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button loading={saving} disabled={!form.stem.trim()} onClick={onSave}>
            {editing ? 'Lưu thay đổi' : 'Lưu câu hỏi nháp'}
          </Button>
        </div>
      }
    >
      {error && <p role="alert" className="mb-4 rounded-xl border border-parish-danger/30 bg-parish-danger-bg p-3 text-sm text-text-main">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(290px,0.7fr)]">
        {/* Cột trái: Nội dung câu hỏi & Đáp án */}
        <div className="space-y-4">
          <div className="form-group">
            <label className="form-label" htmlFor="qe-question-type">
              Hình thức câu hỏi
            </label>
            <select
              id="qe-question-type"
              className="form-select min-h-11 w-full"
              value={form.questionType}
              onChange={event => setForm(current => ({ ...current,
                questionType: event.target.value as QuestionForm['questionType'],
                correctOptionIds: event.target.value === 'multiple_choice' ? current.correctOptionIds.slice(0, 1) : current.correctOptionIds,
              }))}
            >
              <option value="multiple_choice">Trắc nghiệm một đáp án</option>
              <option value="multiple_select">Trắc nghiệm nhiều đáp án</option>
              <option value="true_false">Đúng / Sai</option>
              <option value="short_answer">Trả lời ngắn</option>
              <option value="fill_blank">Điền từ vào chỗ trống</option>
              <option value="matching">Nối ý / Ghép cột</option>
              <option value="essay">Tự luận / Trả lời mở</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="qe-stem">
              Nội dung câu hỏi <span className="text-parish-danger" aria-hidden="true">*</span>
            </label>
            <textarea
              id="qe-stem"
              className="form-input min-h-28 w-full text-base"
              value={form.stem}
              onChange={event => set('stem', event.target.value)}
              placeholder="Nhập nội dung câu hỏi hoặc đề bài..."
              autoFocus
              required
            />
          </div>

          {(form.questionType === 'multiple_choice' || form.questionType === 'multiple_select') && (
            <div className="space-y-2">
              <label className="form-label">
                Các phương án lựa chọn &amp; Đáp án đúng
              </label>
              <p className="text-xs text-text-muted">
                {form.questionType === 'multiple_select' ? 'Đánh dấu tất cả phương án đúng.' : 'Chọn một phương án đúng. Đề trắc nghiệm chấm OMR yêu cầu đúng 4 phương án A, B, C, D.'}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {form.options.map(({ id, text }) => {
                  const isCorrect = form.correctOptionIds.includes(id)
                  return (
                    <div
                      key={id}
                      className={`flex items-center gap-2 rounded-xl border p-2.5 transition-colors ${
                        isCorrect
                          ? 'border-parish-primary bg-surface-selected ring-1 ring-parish-primary'
                          : 'border-surface-border bg-surface-card hover:bg-surface-hover'
                      }`}
                    >
                      <label className="flex cursor-pointer items-center gap-1.5 font-bold text-text-main shrink-0">
                        <input
                          type={form.questionType === 'multiple_select' ? 'checkbox' : 'radio'}
                          name="qe-correct-option"
                          aria-label={`Đáp án đúng ${id}`}
                          checked={isCorrect}
                          onChange={() => setForm(current => ({ ...current, correctOptionIds: current.questionType === 'multiple_select'
                            ? current.correctOptionIds.includes(id) ? current.correctOptionIds.filter(value => value !== id) : [...current.correctOptionIds, id]
                            : [id] }))}
                          className="h-4 w-4 text-parish-primary focus:ring-parish-primary"
                        />
                        <span>{id}</span>
                      </label>
                      <input
                        className="form-input min-h-10 min-w-0 flex-1 text-sm"
                        value={text}
                        onChange={event => setForm(current => ({ ...current, options: current.options.map(option => option.id === id ? { ...option, text: event.target.value } : option) }))}
                        placeholder={`Nội dung phương án ${id}`}
                        aria-label={`Nội dung phương án ${id}`}
                      />
                      <Button variant="ghost" size="sm" aria-label={`Xóa phương án ${id}`} disabled={form.options.length <= 2}
                        onClick={() => setForm(current => ({ ...current, options: current.options.filter(option => option.id !== id), correctOptionIds: current.correctOptionIds.filter(value => value !== id) }))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })}
              </div>
              <Button size="sm" variant="secondary" leadingIcon={<Plus className="h-4 w-4" />} disabled={form.options.length >= 8}
                onClick={() => setForm(current => ({ ...current, options: [...current.options, { id: 'ABCDEFGH'.split('').find(id => !current.options.some(option => option.id === id))!, text: '' }] }))}>
                Thêm phương án
              </Button>
            </div>
          )}

          {form.questionType === 'true_false' && <div className="form-group">
            <label className="form-label" htmlFor="qe-true-false">Đáp án đúng</label>
            <select id="qe-true-false" className="form-select min-h-11 w-full" value={String(form.trueFalseAnswer)} onChange={event => set('trueFalseAnswer', event.target.value === 'true')}>
              <option value="true">Đúng</option><option value="false">Sai</option>
            </select>
          </div>}
          {form.questionType === 'short_answer' && <div className="form-group">
            <label className="form-label" htmlFor="qe-accepted-answers">Các đáp án được chấp nhận</label>
            <textarea id="qe-accepted-answers" className="form-input min-h-24 w-full" value={form.acceptedAnswers} onChange={event => set('acceptedAnswers', event.target.value)} />
            <p className="text-xs text-text-muted">Mỗi dòng là một cách trả lời được chấp nhận.</p>
          </div>}

          {(form.questionType === 'fill_blank' || form.questionType === 'matching') && (
            <div className="space-y-3 rounded-xl border border-surface-border p-3">
              <p className="text-xs text-text-muted">{form.questionType === 'fill_blank'
                ? 'Đánh dấu ô trống bằng (1) ___, (2) ___ hoặc {{1}}, {{2}}. Đáp án: 1: từ đúng | cách viết khác; 2: từ đúng.'
                : 'Nhập hai cột dưới nội dung: 1. Ý thứ nhất | A. Nội dung A, rồi xuống dòng 2. Ý thứ hai | B. Nội dung B. Đáp án: 1-B; 2-A.'}</p>
              {form.questionType === 'fill_blank' && <div className="form-group">
                <label className="form-label" htmlFor="qe-word-bank">Từ cho sẵn (tùy chọn)</label>
                <input id="qe-word-bank" className="form-input min-h-11 w-full" value={form.wordBank} onChange={event => set('wordBank', event.target.value)} placeholder="Các từ cách nhau bằng dấu phẩy" />
              </div>}
              <div className="form-group">
                <label className="form-label" htmlFor="qe-structured-answers">Đáp án từng ô / cặp ghép</label>
                <textarea id="qe-structured-answers" className="form-input min-h-24 w-full" value={form.structuredAnswers} onChange={event => set('structuredAnswers', event.target.value)} />
              </div>
              <p className="text-xs text-text-muted">Các dạng này được chấm bằng nhập điểm. Có thể lưu nháp khi chưa nhập đủ đáp án; cần hoàn thiện trước khi gửi duyệt.</p>
              {(() => {
                const result = parseStructuredQuestion(form.stem, form.questionType, form.structuredAnswers)
                return <><StructuredQuestionPreview question={{ index: 1, type: 'essay', responseFormat: form.questionType, question: result.question, answerData: result.answerData }} showAnswers />
                  {result.warnings.map(warning => <p key={warning} className="text-xs text-parish-warning">{warning}</p>)}</>
              })()}
            </div>
          )}
          {form.questionType === 'essay' && <p className="text-xs text-text-muted">
            Dùng a), b), 1.1 hoặc i), ii) cho các ý nhỏ trong cùng câu. Điểm từng ý ghi (0,5 điểm). Đã nhận diện {extractEssaySubparts(form.stem).length} ý nhỏ.
          </p>}
          {form.questionType === 'essay' && <div className="form-group">
            <label className="form-label" htmlFor="qe-answer-lines">Số dòng trả lời</label>
            <input id="qe-answer-lines" className="form-input w-full" type="number" min="0" max="100" step="1" placeholder="Tự động"
              value={form.answerLineCount} onChange={event => set('answerLineCount', event.target.value)} />
            <p className="text-xs text-text-muted">Để trống để tự động; 0 để không chừa dòng trên đề in.</p>
          </div>}

          <div className="form-group">
            <label className="form-label" htmlFor="qe-explanation">
              {form.questionType === 'essay' ? 'Rubric / Gợi ý chấm điểm' : 'Lời giải chi tiết / Giải thích đáp án'}
            </label>
            <textarea
              id="qe-explanation"
              className="form-input min-h-24 w-full text-sm"
              value={form.explanation}
              onChange={event => set('explanation', event.target.value)}
              placeholder={
                form.questionType === 'essay'
                  ? 'Ghi chú các tiêu chí cho điểm, dàn ý bài làm...'
                  : 'Giải thích lý do phương án đúng hoặc trích dẫn giáo lý liên quan...'
              }
            />
          </div>
        </div>

        {/* Cột phải: Phân loại & Taxonomy */}
        <div className="space-y-3 rounded-2xl bg-surface-sunken p-4 border border-surface-border/60">
          <div className="border-b border-surface-border pb-2">
            <h4 className="typography-card-title text-text-main text-sm font-bold">Phân loại &amp; Taxonomy</h4>
            <p className="text-xs text-text-muted mt-0.5">Gắn nhãn để dễ dàng lọc và thiết lập ma trận đề.</p>
          </div>

          <div className="form-group">
            <label className="form-label text-xs" htmlFor="qe-branch">Ngành mục tiêu</label>
            <select
              id="qe-branch"
              className="form-select min-h-10 w-full text-sm"
              value={form.branchId}
              onChange={event => setForm(current => ({ ...current, branchId: event.target.value, blockId: '', curriculumLevel: '' }))}
            >
              <option value="">-- Mọi ngành trong Xứ đoàn --</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label text-xs" htmlFor="qe-block">Khối áp dụng</label>
            <select
              id="qe-block"
              className="form-select min-h-10 w-full text-sm"
              value={form.blockId}
              disabled={!form.branchId}
              onChange={event => {
                const selected = blocks.find(block => block.id === event.target.value)
                setForm(current => ({ ...current, blockId: event.target.value, curriculumLevel: selected?.label ?? '' }))
              }}
            >
              <option value="">-- Dùng chung toàn ngành --</option>
              {blockOptions.map(block => (
                <option key={block.id} value={block.id}>
                  {block.label}{block.academicYear ? ` · ${block.academicYear}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label text-xs" htmlFor="qe-difficulty">Mức độ nhận thức</label>
            <select
              id="qe-difficulty"
              className="form-select min-h-10 w-full text-sm"
              value={form.difficulty}
              onChange={event => set('difficulty', event.target.value as QuestionDifficulty)}
            >
              <option value="recognition">Nhận biết (Câu hỏi cơ bản, ghi nhớ)</option>
              <option value="understanding">Thông hiểu (Hiểu ý nghĩa, giải thích)</option>
              <option value="application">Vận dụng (Vận dụng vào đời sống Kitô giáo)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label text-xs" htmlFor="qe-book">Sách giáo lý</label>
            <input id="qe-book" className="form-input min-h-10 w-full text-sm" value={form.book} onChange={event => set('book', event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="form-group">
              <label className="form-label text-xs" htmlFor="qe-chapter">Chương</label>
              <input
                id="qe-chapter"
                className="form-input min-h-10 text-sm"
                value={form.chapter}
                onChange={event => set('chapter', event.target.value)}
                placeholder="VD: Chương I"
              />
            </div>
            <div className="form-group">
              <label className="form-label text-xs" htmlFor="qe-lesson">Bài học</label>
              <input
                id="qe-lesson"
                className="form-input min-h-10 text-sm"
                value={form.lesson}
                onChange={event => set('lesson', event.target.value)}
                placeholder="VD: Bài 3"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="form-group">
              <label className="form-label text-xs" htmlFor="qe-lesson-order">Thứ tự bài</label>
              <input
                id="qe-lesson-order"
                className="form-input min-h-10 text-sm"
                type="number"
                min="0"
                value={form.lessonOrder}
                onChange={event => set('lessonOrder', event.target.value)}
                placeholder="Số TT"
              />
            </div>
            <div className="form-group">
              <label className="form-label text-xs" htmlFor="qe-topic">Chủ đề</label>
              <input
                id="qe-topic"
                className="form-input min-h-10 text-sm"
                value={form.topic}
                onChange={event => set('topic', event.target.value)}
                placeholder="VD: Bí tích Thánh Thể"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label text-xs" htmlFor="qe-tags">Nhãn / Từ khóa</label>
            <input
              id="qe-tags"
              className="form-input min-h-10 w-full text-sm"
              value={form.tags}
              onChange={event => set('tags', event.target.value)}
              placeholder="Cách nhau bằng dấu phẩy (,)"
            />
          </div>

          <div className="form-group">
            <label className="form-label text-xs" htmlFor="qe-source">Nguồn trích dẫn</label>
            <input
              id="qe-source"
              className="form-input min-h-10 w-full text-sm"
              value={form.source}
              onChange={event => set('source', event.target.value)}
              placeholder="VD: Giáo lý Bạn Trẻ, Đề thi 2025..."
            />
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

export default QuestionEditorModal
