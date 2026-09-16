import { AlertTriangle, CircleAlert } from 'lucide-react'
import type { OperationEventDetail, OperationTask } from '../../lib/api/operations'
import { Button, TextArea } from '../common/ui'
import { ModalShell } from '../common/ModalShell'
import { ConfirmDialog } from '../common/ConfirmDialog'
import type { EventTransitionFlow } from '../../hooks/useOperationsEventTransitionFlow'

/**
 * W3.2 extraction: the four dialogs of the event command surface — the
 * pending-acceptance confirmation, the BLOCKED/CANCELLED reason prompt, the
 * readiness-override dialog and the completion-blocked warning. All state and
 * handlers come from useEventTransitionFlow / the page; this component only
 * renders. Keeping them together means the page body no longer interleaves
 * ~150 lines of dialog markup with the section layout.
 */
export function OperationsEventDialogs({
  detail,
  flow,
  taskReason,
}: {
  detail: OperationEventDetail | null
  flow: EventTransitionFlow
  taskReason: {
    action: { task: OperationTask; status: OperationTask['status'] } | null
    text: string
    submitting: boolean
    onTextChange: (value: string) => void
    onClose: () => void
    onConfirm: () => void | Promise<void>
  }
}) {
  const {
    acceptanceWarning, setAcceptanceWarning,
    transitioningEvent,
    readinessBlockers, setReadinessBlockers,
    completionBlockers, setCompletionBlockers,
    pendingTargetStatus,
    overrideReason, setOverrideReason,
    handleEventTransition,
  } = flow
  const { action: reasonAction, text: reasonText, submitting: reasonSubmitting } = taskReason

  return (
    <>
      <ConfirmDialog
        isOpen={acceptanceWarning !== null}
        title="Còn người chưa nhận nhiệm vụ"
        message={acceptanceWarning?.length
          ? `Các task chưa đủ xác nhận: ${acceptanceWarning.map(item => item.label).join(', ')}. Bạn vẫn muốn chuyển sự kiện sang Chuẩn bị?`
          : 'Vẫn còn người thực hiện chưa nhận nhiệm vụ. Bạn vẫn muốn chuyển sự kiện sang Chuẩn bị?'}
        confirmText="Vẫn chuyển sang Chuẩn bị"
        cancelText="Ở lại Kế hoạch"
        variant="warning"
        isBusy={transitioningEvent}
        onCancel={() => setAcceptanceWarning(null)}
        onConfirm={() => void handleEventTransition('PREPARING', true)}
      />

      {/* Modal nhập lý do khi task chuyển BLOCKED hoặc CANCELLED */}
      <ModalShell
        isOpen={reasonAction !== null}
        onClose={() => { if (!reasonSubmitting) taskReason.onClose() }}
        title={reasonAction?.status === 'BLOCKED' ? 'Báo Điểm Nghẽn (Bị Chặn)' : 'Hủy Nhiệm Vụ'}
        subtitle={reasonAction?.task.title}
      >
        <form onSubmit={e => { e.preventDefault(); void taskReason.onConfirm() }} className="space-y-4">
          <p className="text-sm text-text-muted">
            {reasonAction?.status === 'BLOCKED'
              ? 'Vui lòng nêu rõ lý do khiến nhiệm vụ không thể tiếp tục thực hiện để Ban Điều hành hỗ trợ giải quyết.'
              : 'Vui lòng nêu rõ lý do hủy nhiệm vụ này. Thao tác hủy sẽ thông báo đến những người đã được phân công.'}
          </p>
          <TextArea
            aria-label="Lý do"
            required
            rows={3}
            maxLength={2000}
            placeholder={reasonAction?.status === 'BLOCKED' ? 'Mô tả trở ngại, thiếu vật tư, nhân sự...' : 'Lý do hủy nhiệm vụ...'}
            value={reasonText}
            onChange={e => taskReason.onTextChange(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              disabled={reasonSubmitting}
              onClick={taskReason.onClose}
            >
              Đóng
            </Button>
            <Button
              variant={reasonAction?.status === 'BLOCKED' ? 'primary' : 'danger'}
              type="submit"
              loading={reasonSubmitting}
              disabled={!reasonText.trim()}
            >
              {reasonAction?.status === 'BLOCKED' ? 'Xác nhận bị chặn' : 'Xác nhận hủy việc'}
            </Button>
          </div>
        </form>
      </ModalShell>

      {/* Modal Override cho READINESS_BLOCKED */}
      <ModalShell
        isOpen={readinessBlockers !== null}
        onClose={() => { setReadinessBlockers(null); setOverrideReason('') }}
        title="Điều kiện Sẵn sàng Chưa Hoàn tất"
        subtitle={detail?.event.title}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Chưa thể chuyển sự kiện sang giai đoạn tiếp theo do còn các điểm nghẽn sau:
          </p>
          <ul className="space-y-2 max-h-48 overflow-y-auto border border-surface-border rounded-xl p-3 bg-surface-ground/30">
            {readinessBlockers?.map((blocker, index) => (
              <li key={blocker.id || index} className="flex items-start gap-2 text-sm text-text-main">
                <AlertTriangle className="h-4 w-4 text-parish-warning shrink-0 mt-0.5" />
                <span>{blocker.label || 'Điều kiện chưa hoàn tất'}</span>
              </li>
            ))}
          </ul>
          {detail?.permissions['operations.event.override_readiness'] ? (
            <div className="space-y-3 pt-2 border-t border-surface-border">
              <p className="text-sm font-semibold text-text-main">
                Bạn có quyền Ghi đè (Override Readiness). Nhập lý do bắt buộc để tiếp tục:
              </p>
              <TextArea
                aria-label="Lý do ghi đè"
                required
                rows={3}
                maxLength={2000}
                placeholder="Nhập lý do ghi đè điều kiện sẵn sàng..."
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setReadinessBlockers(null); setOverrideReason('') }}>
                  Hủy
                </Button>
                <Button
                  variant="danger"
                  loading={transitioningEvent}
                  disabled={!overrideReason.trim()}
                  onClick={() => {
                    const status = pendingTargetStatus
                    if (status) {
                      void handleEventTransition(status, true, overrideReason)
                    }
                  }}
                >
                  Xác nhận Ghi đè & Chuyển
                </Button>
              </div>
            </div>
          ) : (
            <div className="pt-2 border-t border-surface-border">
              <p className="text-sm text-parish-danger">
                Bạn không có quyền Ghi đè (cần quyền operations.event.override_readiness). Vui lòng hoàn thành các điều kiện trên hoặc báo Trưởng Ban Điều hành.
              </p>
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => { setReadinessBlockers(null); setOverrideReason('') }}>
                  Đã hiểu
                </Button>
              </div>
            </div>
          )}
        </div>
      </ModalShell>

      {/* Modal Cảnh báo cho COMPLETION_BLOCKED */}
      <ModalShell
        isOpen={completionBlockers !== null}
        onClose={() => setCompletionBlockers(null)}
        title="Chưa thể Đóng Sự kiện"
        subtitle={detail?.event.title}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Sự kiện còn các nhiệm vụ bắt buộc hoặc điều kiện chưa hoàn tất:
          </p>
          <ul className="space-y-2 max-h-48 overflow-y-auto border border-surface-border rounded-xl p-3 bg-surface-ground/30">
            {completionBlockers?.map((blocker, index) => (
              <li key={blocker.id || index} className="flex items-start gap-2 text-sm text-text-main">
                <CircleAlert className="h-4 w-4 text-parish-danger shrink-0 mt-0.5" />
                <span>{blocker.label || 'Nhiệm vụ bắt buộc chưa hoàn thành'}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-muted">
            Vui lòng kiểm tra và hoàn thành các nhiệm vụ bắt buộc trong tab Nhiệm vụ trước khi thực hiện Hoàn tất sự kiện.
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => setCompletionBlockers(null)}>
              Đã hiểu
            </Button>
          </div>
        </div>
      </ModalShell>
    </>
  )
}
