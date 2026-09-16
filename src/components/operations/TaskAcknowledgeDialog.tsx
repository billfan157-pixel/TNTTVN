import { Button, TextArea } from '../common/ui'
import { ModalShell } from '../common/ModalShell'
import type { OperationTask } from '../../lib/api/operations'

/**
 * W4.3: dialog for Nhận việc / Từ chối with the OPTIONAL note the API has
 * always accepted (`acknowledgementSchema.note`). Declining keeps a note
 * encouraged (it is the manager's only feedback channel for a refusal);
 * accepting allows skipping it. The submit + idempotency stay in the page.
 */
export function TaskAcknowledgeDialog({
  action,
  note,
  submitting,
  onNoteChange,
  onClose,
  onConfirm,
}: {
  action: { task: OperationTask; status: 'ACCEPTED' | 'DECLINED' } | null
  note: string
  submitting: boolean
  onNoteChange: (value: string) => void
  onClose: () => void
  onConfirm: () => void | Promise<void>
}) {
  const declining = action?.status === 'DECLINED'
  return (
    <ModalShell
      isOpen={action !== null}
      onClose={() => { if (!submitting) onClose() }}
      title={declining ? 'Từ chối nhiệm vụ' : 'Nhận nhiệm vụ'}
      subtitle={action?.task.title}
    >
      <form onSubmit={e => { e.preventDefault(); void onConfirm() }} className="space-y-4">
        <p className="text-sm text-text-muted">
          {declining
            ? 'Việc từ chối sẽ được báo cho người giao việc. Ghi lý do hoặc đề xuất người thay (không bắt buộc, nhưng rất nên có).'
            : 'Xác nhận bạn sẽ thực hiện nhiệm vụ này. Có thể để lại ghi chú cho người giao việc (không bắt buộc).'}
        </p>
        <TextArea
          aria-label="Ghi chú khi phản hồi nhiệm vụ"
          rows={3}
          maxLength={2000}
          placeholder={declining ? 'Ví dụ: trùng lịch cuối tuần, nhờ anh Minh nhận thay…' : 'Ghi chú gửi người giao việc…'}
          value={note}
          disabled={submitting}
          onChange={e => onNoteChange(e.target.value)}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" disabled={submitting} onClick={onClose}>
            Đóng
          </Button>
          <Button variant={declining ? 'danger' : 'primary'} type="submit" loading={submitting}>
            {declining ? 'Xác nhận từ chối' : 'Xác nhận nhận việc'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
