import { FilePlus2 } from 'lucide-react'
import { Button } from '../common/ui'
import { ModalShell } from '../common/ModalShell'
import type { QuestionBranchOption, QuestionClassOption, QuestionForm } from '../../utils/questionEditorModel'
import type { QuestionDifficulty } from '../../types'

export type { QuestionBranchOption, QuestionClassOption, QuestionForm }

interface QuestionEditorModalProps {
  isOpen: boolean
  editing: boolean
  form: QuestionForm
  setForm: (updater: (current: QuestionForm) => QuestionForm) => void
  branches: QuestionBranchOption[]
  classes: QuestionClassOption[]
  saving: boolean
  onClose: () => void
  onSave: () => void
}

export function QuestionEditorModal({ isOpen, editing, form, setForm, branches, classes, saving, onClose, onSave }: QuestionEditorModalProps) {
  const classOptions = classes.filter(cls => !form.branchId || cls.branchId === form.branchId)
  const set = <K extends keyof QuestionForm>(key: K, value: QuestionForm[K]) => setForm(current => ({ ...current, [key]: value }))

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Tạo phiên bản câu hỏi mới' : 'Tạo câu hỏi nháp'}
      subtitle="Nội dung sẽ được lưu dưới dạng bản nháp và chỉ được sử dụng sau quy trình phê duyệt."
      icon={<FilePlus2 className="h-5 w-5 text-parish-primary" />}
      maxWidth="960px"
      closeOnOverlay={!saving}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button loading={saving} disabled={!form.stem.trim()} onClick={onSave}>
            {editing ? 'Lưu phiên bản mới' : 'Lưu câu hỏi nháp'}
          </Button>
        </div>
      }
    >
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
              onChange={event => set('questionType', event.target.value as QuestionForm['questionType'])}
            >
              <option value="multiple_choice">Trắc nghiệm 4 đáp án (A, B, C, D)</option>
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

          {form.questionType === 'multiple_choice' && (
            <div className="space-y-2">
              <label className="form-label">
                Các phương án lựa chọn &amp; Đáp án đúng
              </label>
              <p className="text-xs text-text-muted">
                Tick chọn nút tròn phương án đúng. Phiên bản trắc nghiệm chuẩn OMR yêu cầu đủ 4 đáp án A, B, C, D.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['A', 'B', 'C', 'D'] as const).map(id => {
                  const isCorrect = form.correctOption === id
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
                          type="radio"
                          name="qe-correct-option"
                          aria-label={`Đáp án đúng ${id}`}
                          checked={isCorrect}
                          onChange={() => set('correctOption', id)}
                          className="h-4 w-4 text-parish-primary focus:ring-parish-primary"
                        />
                        <span>{id}</span>
                      </label>
                      <input
                        className="form-input min-h-10 min-w-0 flex-1 text-sm"
                        value={form[`option${id}`]}
                        onChange={event => set(`option${id}`, event.target.value)}
                        placeholder={`Nội dung phương án ${id}`}
                        aria-label={`Nội dung phương án ${id}`}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

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
              onChange={event => setForm(current => ({ ...current, branchId: event.target.value, classId: '', curriculumLevel: '' }))}
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
            <label className="form-label text-xs" htmlFor="qe-class">Khối lớp áp dụng</label>
            <select
              id="qe-class"
              className="form-select min-h-10 w-full text-sm"
              value={form.classId}
              disabled={!form.branchId}
              onChange={event => {
                const selected = classes.find(cls => cls.id === event.target.value)
                setForm(current => ({ ...current, classId: event.target.value, curriculumLevel: selected?.name ?? '' }))
              }}
            >
              <option value="">-- Dùng chung toàn ngành --</option>
              {classOptions.map(cls => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}{cls.academicYear ? ` · ${cls.academicYear}` : ''}
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
