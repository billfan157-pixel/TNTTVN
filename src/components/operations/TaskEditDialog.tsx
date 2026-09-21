import { Button, Select, TextArea, TextInput } from '../common/ui'
import { ModalShell } from '../common/ModalShell'
import type { OperationTask } from '../../lib/api/operations'

interface TaskEditDraft {
  title: string
  description: string
  dueAt: string
  scheduledStartAt: string
  scheduledEndAt: string
  priority: OperationTask['priority']
  isRequired: boolean
}

/**
 * W3.2 extraction: the "Sửa nhiệm vụ" dialog. The draft, its schedule
 * validation, OCC submit and acknowledgement-reset toast stay in the page
 * (they belong to the mutation flow and its tests); this component renders
 * only the form shell around those controlled values.
 */
export function TaskEditDialog({
  open,
  editingTask,
  draft,
  scheduleInvalid,
  saving,
  formError,
  onDraftChange,
  onClose,
  onSubmit,
}: {
  open: boolean
  editingTask: OperationTask | null
  draft: TaskEditDraft
  scheduleInvalid: boolean
  saving: boolean
  formError: string | null
  onDraftChange: (patch: Partial<TaskEditDraft>) => void
  onClose: () => void
  onSubmit: (event: React.FormEvent) => void
}) {
  return (
    <ModalShell
      isOpen={open && editingTask !== null}
      onClose={() => { if (!saving) onClose() }}
      title="Sửa nhiệm vụ"
      subtitle={editingTask?.title}
    >
      <form className="space-y-3" onSubmit={onSubmit}>
        <TextInput aria-label="Tên nhiệm vụ" className="w-full" value={draft.title} required maxLength={300} disabled={saving} onChange={event => onDraftChange({ title: event.target.value })} />
        <TextArea aria-label="Mô tả nhiệm vụ" className="w-full" value={draft.description} maxLength={5000} disabled={saving} onChange={event => onDraftChange({ description: event.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select aria-label="Ưu tiên nhiệm vụ" className="w-full" value={draft.priority} disabled={saving} onChange={event => onDraftChange({ priority: event.target.value as OperationTask['priority'] })}>
            <option value="LOW">Ưu tiên thấp</option>
            <option value="NORMAL">Ưu tiên bình thường</option>
            <option value="HIGH">Ưu tiên cao</option>
            <option value="URGENT">Khẩn</option>
          </Select>
          <label className="flex items-center gap-2 text-sm text-text-main">
            <input type="checkbox" checked={draft.isRequired} disabled={saving} onChange={event => onDraftChange({ isRequired: event.target.checked })} /> Nhiệm vụ bắt buộc
          </label>
          <div className="sm:col-span-2">
            <label htmlFor="edit-task-due-at" className="mb-1 block text-xs font-semibold text-text-main">
              Hạn hoàn thành
            </label>
            <TextInput
              id="edit-task-due-at"
              aria-label="Hạn nhiệm vụ"
              className="w-full"
              type="datetime-local"
              value={draft.dueAt}
              disabled={saving}
              onChange={event => onDraftChange({ dueAt: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor="edit-task-start-at" className="mb-1 block text-xs font-semibold text-text-main">
              Bắt đầu ca
            </label>
            <TextInput
              id="edit-task-start-at"
              aria-label="Bắt đầu ca nhiệm vụ"
              className="w-full"
              type="datetime-local"
              value={draft.scheduledStartAt}
              disabled={saving}
              onChange={event => onDraftChange({ scheduledStartAt: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor="edit-task-end-at" className="mb-1 block text-xs font-semibold text-text-main">
              Kết thúc ca
            </label>
            <TextInput
              id="edit-task-end-at"
              aria-label="Kết thúc ca nhiệm vụ"
              className="w-full"
              type="datetime-local"
              value={draft.scheduledEndAt}
              disabled={saving}
              onChange={event => onDraftChange({ scheduledEndAt: event.target.value })}
            />
          </div>
        </div>
        <p className="m-0 text-xs text-text-muted">Máy chủ quyết định thay đổi nào là quan trọng: sửa tên, mô tả, mức bắt buộc, hạn hoặc ca nhiệm vụ sẽ yêu cầu người đã nhận việc xác nhận lại. Đổi ưu tiên không làm mất xác nhận cũ.</p>
        {scheduleInvalid && <p className="m-0 text-xs text-parish-danger">Ca nhiệm vụ phải có đủ giờ bắt đầu và kết thúc, giờ kết thúc phải sau giờ bắt đầu.</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onClose}>Hủy</Button>
          {formError && <p role="alert" className="m-0 text-xs text-parish-danger">{formError}</p>}
          <Button type="submit" size="sm" loading={saving} disabled={!draft.title.trim() || scheduleInvalid}>Lưu thay đổi</Button>
        </div>
      </form>
    </ModalShell>
  )
}
