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

  return <ModalShell
    isOpen={isOpen}
    onClose={onClose}
    title={editing ? 'Tạo phiên bản câu hỏi mới' : 'Tạo câu hỏi nháp'}
    subtitle="Chọn ngành và lớp từ danh mục Catevia; nội dung chỉ được sử dụng sau workflow duyệt."
    icon={<FilePlus2 className="h-5 w-5" />}
    maxWidth="920px"
    closeOnOverlay={!saving}
    footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose} disabled={saving}>Hủy</Button><Button loading={saving} onClick={onSave}>{editing ? 'Lưu phiên bản mới' : 'Lưu câu hỏi nháp'}</Button></div>}
  >
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
      <div className="space-y-3">
        <select className="form-select min-h-11 w-full" value={form.questionType} onChange={event => set('questionType', event.target.value as QuestionForm['questionType'])}>
          <option value="multiple_choice">Trắc nghiệm 4 đáp án</option><option value="essay">Tự luận</option>
        </select>
        <textarea className="form-input min-h-28 w-full" value={form.stem} onChange={event => set('stem', event.target.value)} placeholder="Nội dung câu hỏi" autoFocus />
        {form.questionType === 'multiple_choice' && <div className="grid gap-2 sm:grid-cols-2">{(['A', 'B', 'C', 'D'] as const).map(id => <label key={id} className="flex items-center gap-2"><input type="radio" checked={form.correctOption === id} onChange={() => set('correctOption', id)} /><input className="form-input min-h-11 min-w-0 flex-1" value={form[`option${id}`]} onChange={event => set(`option${id}`, event.target.value)} placeholder={`Phương án ${id}`} /></label>)}</div>}
        <textarea className="form-input min-h-24 w-full" value={form.explanation} onChange={event => set('explanation', event.target.value)} placeholder={form.questionType === 'essay' ? 'Rubric / gợi ý chấm' : 'Lời giải / giải thích'} />
      </div>
      <div className="space-y-3 rounded-xl bg-surface-sunken p-3">
        <select className="form-select min-h-11 w-full" value={form.branchId} onChange={event => setForm(current => ({ ...current, branchId: event.target.value, classId: '', curriculumLevel: '' }))}>
          <option value="">Chọn ngành</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
        <select className="form-select min-h-11 w-full" value={form.classId} disabled={!form.branchId} onChange={event => { const selected = classes.find(cls => cls.id === event.target.value); setForm(current => ({ ...current, classId: event.target.value, curriculumLevel: selected?.name ?? '' })) }}>
          <option value="">Dùng chung trong ngành</option>{classOptions.map(cls => <option key={cls.id} value={cls.id}>{cls.name}{cls.academicYear ? ` · ${cls.academicYear}` : ''}</option>)}
        </select>
        <select className="form-select min-h-11 w-full" value={form.difficulty} onChange={event => set('difficulty', event.target.value as QuestionDifficulty)}><option value="recognition">Nhận biết</option><option value="understanding">Thông hiểu</option><option value="application">Vận dụng</option></select>
        <div className="grid grid-cols-2 gap-2"><input className="form-input min-h-11" value={form.chapter} onChange={event => set('chapter', event.target.value)} placeholder="Chương" /><input className="form-input min-h-11" value={form.lesson} onChange={event => set('lesson', event.target.value)} placeholder="Bài" /></div>
        <input className="form-input min-h-11 w-full" type="number" min="0" value={form.lessonOrder} onChange={event => set('lessonOrder', event.target.value)} placeholder="Số thứ tự bài" />
        <input className="form-input min-h-11 w-full" value={form.topic} onChange={event => set('topic', event.target.value)} placeholder="Chủ đề" />
        <input className="form-input min-h-11 w-full" value={form.tags} onChange={event => set('tags', event.target.value)} placeholder="Tags, cách nhau bằng dấu phẩy" />
        <input className="form-input min-h-11 w-full" value={form.source} onChange={event => set('source', event.target.value)} placeholder="Nguồn câu hỏi" />
      </div>
    </div>
  </ModalShell>
}

export default QuestionEditorModal
